import * as React from 'react';
import { hcl } from 'd3-color';

import { shallowArrayEqual } from '../coreUtils/collections';
import { EventObserver } from '../coreUtils/events';
import { HashMap } from '../coreUtils/hashMap';

import { ElementTypeIri } from '../data/model';
import { MetadataApi } from '../data/metadataApi';
import { ValidationApi } from '../data/validationApi';
import { hashFnv32a } from '../data/utils';

import { RestoreGeometry, restoreViewport } from '../diagram/commands';
import { TypeStyleResolver, LabelLanguageSelector } from '../diagram/customization';
import { CommandHistory, InMemoryHistory } from '../diagram/history';
import {
    CalculatedLayout, LayoutFunction, LayoutTypeProvider, calculateLayout, applyLayout,
} from '../diagram/layout';
import { blockingDefaultLayout } from '../diagram/layoutShared';
import { SharedCanvasState, IriClickEvent } from '../diagram/sharedCanvasState';

import { DataDiagramModel } from '../editor/dataDiagramModel';
import { EntityGroup, EntityGroupItem } from '../editor/dataElements';
import { EditorController } from '../editor/editorController';
import {
    groupEntitiesAnimated, ungroupAllEntitiesAnimated, ungroupSomeEntitiesAnimated,
} from '../editor/elementGrouping';
import { OverlayController, PropertyEditor } from '../editor/overlayController';

import { DefaultLinkTemplate } from '../templates/defaultLinkTemplate';
import { StandardTemplate } from '../templates/standardTemplate';

import {
    WorkspaceContext, WorkspaceEventHandler, WorkspaceEventKey, ProcessedTypeStyle,
} from './workspaceContext';
import { EntityElement } from '../workspace';

export interface WorkspaceProps {
    /**
     * Overrides default command history implementation.
     *
     * By default, it uses `InMemoryHistory` instance.
     */
    history?: CommandHistory;
    /**
     * Allows to customize how colors and icons are assigned to elements based
     * on its types.
     *
     * By default, the colors are assigned deterministically based on total
     * hash of type strings.
     */
    typeStyleResolver?: TypeStyleResolver;
    /**
     * Provides a strategy to visually edit graph data.
     * 
     * If provided, switches editor into "authoring mode".
     */
    metadataApi?: MetadataApi;
    /**
     * Provides a strategy to validate changes to the graph data in "authoring mode".
     */
    validationApi?: ValidationApi;
    /**
     * Overrides default property editor for elements and links in "authoring mode".
     */
    propertyEditor?: PropertyEditor;
    /**
     * Overrides how a single label gets selected from multiple of them based on target language.
     */
    selectLabelLanguage?: LabelLanguageSelector;
    /**
     * Initial language to display the graph data with.
     */
    defaultLanguage?: string;
    /**
     * Default function to compute diagram layout.
     *
     * If not provided, uses synchronous fallback to `layoutForcePadded()`.
     */
    defaultLayout?: LayoutFunction;

    onIriClick?: (event: IriClickEvent) => void;
    onWorkspaceEvent?: WorkspaceEventHandler;

    children: React.ReactNode;
}

const DEFAULT_LANGUAGE = 'en';
const DEFAULT_TYPE_STYLE_RESOLVER: TypeStyleResolver = types => undefined;
const TYPE_STYLE_COLOR_SEED = 0x0BADBEEF;

/**
 * @category Components
 */
export class Workspace extends React.Component<WorkspaceProps> {
    private readonly listener = new EventObserver();
    private readonly cancellation = new AbortController();

    private readonly resolveTypeStyle: TypeStyleResolver;
    private readonly cachedTypeStyles: WeakMap<ReadonlyArray<ElementTypeIri>, ProcessedTypeStyle>;
    private readonly cachedGroupStyles: WeakMap<ReadonlyArray<EntityGroupItem>, ProcessedTypeStyle>;

    private readonly layoutTypeProvider: LayoutTypeProvider;

    private readonly workspaceContext: WorkspaceContext;

    /** @hidden */
    constructor(props: WorkspaceProps) {
        super(props);

        const {
            history = new InMemoryHistory(),
            metadataApi,
            validationApi,
            propertyEditor,
            typeStyleResolver,
            selectLabelLanguage,
            defaultLanguage = DEFAULT_LANGUAGE,
            defaultLayout,
            onWorkspaceEvent = () => {},
        } = this.props;

        this.resolveTypeStyle = typeStyleResolver ?? DEFAULT_TYPE_STYLE_RESOLVER;
        this.cachedTypeStyles = new WeakMap();
        this.cachedGroupStyles = new WeakMap();

        const model = new DataDiagramModel({history, selectLabelLanguage});
        model.setLanguage(defaultLanguage);

        const view = new SharedCanvasState({
            defaultElementTemplate: StandardTemplate,
            defaultLinkTemplate: DefaultLinkTemplate,
            defaultLayout: defaultLayout ?? blockingDefaultLayout,
        });

        const editor = new EditorController({
            model,
            validationApi,
        });
        editor.setMetadataApi(metadataApi);

        const overlay = new OverlayController({
            model,
            view,
            editor,
            propertyEditor,
        });

        this.layoutTypeProvider = {
            getElementTypes: element => {
                if (element instanceof EntityElement) {
                    return element.data.types;
                }
                return [];
            },
        };

        this.workspaceContext = {
            model,
            view,
            editor,
            overlay,
            disposeSignal: this.cancellation.signal,
            getElementStyle: this.getElementStyle,
            getElementTypeStyle: this.getElementTypeStyle,
            performLayout: this.onPerformLayout,
            group: this.onGroup,
            ungroupAll: this.onUngroupAll,
            ungroupSome: this.onUngroupSome,
            triggerWorkspaceEvent: onWorkspaceEvent,
        };

        if (!defaultLayout) {
            console.warn(
                'Reactodia.Workspace: "defaultLayout" prop is not provided, using synchronous fallback ' +
                'which may freeze the execution for large diagrams. It is recommended to use ' +
                'layout worker via Reactodia.defineDefaultLayouts() and Reactodia.useWorker().'
            );
        }
    }

    getContext(): WorkspaceContext {
        return this.workspaceContext;
    }

    /** @hidden */
    render() {
        const {children} = this.props;
        return (
            <WorkspaceContext.Provider value={this.workspaceContext}>
                {children}
            </WorkspaceContext.Provider>
        );
    }

    /** @hidden */
    componentDidMount() {
        const {onWorkspaceEvent} = this.props;
        const {model, view, overlay} = this.workspaceContext;

        this.listener.listen(model.events, 'loadingSuccess', () => {
            for (const canvas of view.findAllCanvases()) {
                canvas.renderingState.syncUpdate();
                canvas.zoomToFit();
            }
        });
        this.listener.listen(view.events, 'iriClick', e => {
            const {onIriClick} = this.props;
            onIriClick?.(e);
        });

        if (onWorkspaceEvent) {
            this.listener.listen(model.events, 'changeSelection', () =>
                onWorkspaceEvent(WorkspaceEventKey.editorChangeSelection)
            );
            this.listener.listen(overlay.events, 'changeOpenedDialog', () =>
                onWorkspaceEvent(WorkspaceEventKey.editorToggleDialog)
            );
        }
    }

    /** @hidden */
    componentDidUpdate(prevProps: WorkspaceProps) {
        const {editor} = this.workspaceContext;

        if (this.props.metadataApi !== editor.metadataApi) {
            editor.setMetadataApi(this.props.metadataApi);
        }
    }

    /** @hidden */
    componentWillUnmount() {
        this.listener.stopListening();
        const {view, editor, overlay} = this.workspaceContext;
        view.dispose();
        editor.dispose();
        overlay.dispose();
    }

    private getElementStyle: WorkspaceContext['getElementStyle'] = element => {
        if (element instanceof EntityElement) {
            return this.getElementTypeStyle(element.data.types);
        } else if (element instanceof EntityGroup) {
            return this.getGroupTypeStyle(element);
        } else {
            return this.getElementTypeStyle([]);
        }
    };

    private getElementTypeStyle: WorkspaceContext['getElementTypeStyle'] = types => {
        let processedStyle = this.cachedTypeStyles.get(types);
        if (!processedStyle) {
            const customStyle = this.resolveTypeStyle(types);
            const icon = customStyle ? customStyle.icon : undefined;
            let color: string;
            if (customStyle && customStyle.color) {
                color = hcl(customStyle.color).toString();
            } else {
                const hue = getHueFromClasses(types, TYPE_STYLE_COLOR_SEED);
                color = hcl(hue, 40, 75).toString();
            }
            processedStyle = {icon, color};
            this.cachedTypeStyles.set(types, processedStyle);
        }
        return processedStyle;
    };

    private getGroupTypeStyle(group: EntityGroup): ProcessedTypeStyle {
        const {items} = group;
        let processedStyle = this.cachedGroupStyles.get(items);
        if (!processedStyle) {
            // Find the most frequent set of types for items in the group
            const countPerTypes = new HashMap<ReadonlyArray<ElementTypeIri>, number>(
                hashTypeIris,
                shallowArrayEqual
            );
            for (const item of items) {
                countPerTypes.set(item.data.types, (countPerTypes.get(item.data.types) ?? 0) + 1);
            }
            let maxCount = 0;
            let typesAtMax: ReadonlyArray<ElementTypeIri> = [];
            for (const [types, count] of countPerTypes) {
                if (count > maxCount) {
                    maxCount = count;
                    typesAtMax = types;
                }
            }
            processedStyle = this.getElementTypeStyle(typesAtMax);
            this.cachedGroupStyles.set(items, processedStyle);
        }
        return processedStyle;
    }

    private onPerformLayout: WorkspaceContext['performLayout'] = async params => {
        const {
            canvas: targetCanvas, layoutFunction, selectedElements, animate, signal,
            zoomToFit = true,
        } = params;
        const {model, view, overlay, disposeSignal} = this.workspaceContext;

        const canvas = targetCanvas ?? view.findAnyCanvas();
        if (!canvas) {
            throw new Error('Failed to find any canvas to perform layout');
        }

        canvas.renderingState.syncUpdate();

        const task = overlay.startTask({
            title: 'Computing graph layout',
            delay: 200,
        });
        let calculatedLayout: CalculatedLayout;
        try {
            calculatedLayout = await calculateLayout({
                layoutFunction: layoutFunction ?? view.defaultLayout,
                model,
                selectedElements,
                sizeProvider: canvas.renderingState,
                typeProvider: this.layoutTypeProvider,
                signal: signal ?? disposeSignal,
            });
        } catch (err) {
            task.setError(err);
            console.error('Failed to compute graph layout', err);
            return;
        } finally {
            task.end();
        }

        const batch = model.history.startBatch('Graph layout');
        batch.history.registerToUndo(RestoreGeometry.capture(model));

        for (const link of model.links) {
            link.setVertices([]);
        }

        batch.history.registerToUndo(restoreViewport(canvas));
        if (animate) {
            await Promise.all([
                canvas.animateGraph(() => {
                    applyLayout(calculatedLayout, model);
                    batch.store();
                }),
                zoomToFit ? canvas.zoomToFit({animate: true}) : null,
            ]);
        } else {
            applyLayout(calculatedLayout, model);
            batch.store();
            if (zoomToFit) {
                canvas.zoomToFit();
            }
        }
    };

    private onGroup: WorkspaceContext['group'] = ({elements, canvas}) => {
        return groupEntitiesAnimated(elements, canvas, this.workspaceContext);
    };

    private onUngroupAll: WorkspaceContext['ungroupAll'] = ({groups, canvas}) => {
        return ungroupAllEntitiesAnimated(groups, canvas, this.workspaceContext);
    };

    private onUngroupSome: WorkspaceContext['ungroupSome'] = ({group, entities, canvas}) => {
        return ungroupSomeEntitiesAnimated(group, entities, canvas, this.workspaceContext);
    };
}

function getHueFromClasses(types: ReadonlyArray<ElementTypeIri>, seed?: number): number {
    const hash = hashTypeIris(types, seed);
    const MAX_INT32 = 0x7fffffff;
    return 360 * ((hash === undefined ? 0 : hash) / MAX_INT32);
}

function hashTypeIris(types: ReadonlyArray<ElementTypeIri>, seed = 0): number {
    let hash = seed | 0;
    for (const name of types) {
        hash = Math.imul(hash, 31) + (hashFnv32a(name, hash) | 0);
    }
    return hash | 0;
}

export interface LoadedWorkspaceParams {
    readonly context: WorkspaceContext;
    readonly signal: AbortSignal;
}

export interface LoadedWorkspace {
    readonly getContext: () => WorkspaceContext;
    readonly onMount: (workspace: Workspace | null) => void;
}

/**
 * Hook to perform asynchronous initialization of the workspace.
 *
 * This function could be used to setup data provider, fetch initial data
 * or import existing diagram layout.
 * 
 * @category Hooks
 */
export function useLoadedWorkspace(
    onLoad: (params: LoadedWorkspaceParams) => Promise<void>,
    deps: unknown[]
): LoadedWorkspace {
    const [context, setContext] = React.useState<WorkspaceContext>();

    interface State {
        latestOnLoad: typeof onLoad;
        context: WorkspaceContext | undefined;
        loadedWorkspace: LoadedWorkspace;
    }

    const stateRef = React.useRef<State>();
    if (stateRef.current) {
        stateRef.current.latestOnLoad = onLoad;
    } else {
        const state: State = {
            latestOnLoad: onLoad,
            context: undefined,
            loadedWorkspace: {
                getContext: () => {
                    if (!state.context) {
                        throw new Error('Cannot get Reactodia Workspace context: it is not mounted yet');
                    }
                    return state.context;
                },
                onMount: workspace => {
                    const context = workspace?.getContext();
                    state.context = context;
                    setContext(context);
                },
            }
        };
        stateRef.current = state;
    }

    React.useEffect(() => {
        if (context) {
            const latestOnLoad = stateRef.current!.latestOnLoad;

            const controller = new AbortController();
            (async () => {
                const task = context.overlay.startTask();
                try {
                    await latestOnLoad({context, signal: controller.signal});
                } catch (err) {
                    if (!controller.signal.aborted) {
                        task.setError(err);
                        console.error('Reactodia: failed to load a workspace', err);
                    }
                } finally {
                    task.end();
                }
            })();

            return () => {
                controller.abort();
                context.model.discardLayout();
            };
        }
    }, [context, ...deps]);

    return stateRef.current.loadedWorkspace;
}
