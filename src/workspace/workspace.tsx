import * as React from 'react';
import { hcl } from 'd3-color';

import { shallowArrayEqual } from '../coreUtils/collections';
import { Events, EventObserver, EventSource, EventTrigger } from '../coreUtils/events';
import { HashMap } from '../coreUtils/hashMap';

import { ElementTypeIri } from '../data/model';
import { MetadataProvider } from '../data/metadataProvider';
import { ValidationProvider } from '../data/validationProvider';
import { hashFnv32a } from '../data/utils';

import { RestoreGeometry, restoreViewport } from '../diagram/commands';
import {
    TypeStyleResolver, LabelLanguageSelector, RenameLinkProvider,
} from '../diagram/customization';
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
import { OverlayController } from '../editor/overlayController';

import { DefaultLinkTemplate } from '../templates/defaultLinkTemplate';
import { StandardTemplate } from '../templates/standardTemplate';

import type { VisualAuthoringCommands } from '../widgets/visualAuthoring';

import {
    WorkspaceContext, WorkspaceEventKey, ProcessedTypeStyle,
} from './workspaceContext';
import { EntityElement } from '../workspace';

/**
 * Props for `Workspace` component.
 *
 * @see Workspace
 */
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
     * Provides an strategy to visually edit graph data.
     * 
     * If provided, switches editor into the graph authoring mode.
     */
    metadataProvider?: MetadataProvider;
    /**
     * Provides a strategy to validate changes to the data in the graph authoring mode.
     */
    validationProvider?: ValidationProvider;
    /**
     * Provides a strategy to rename diagram links (change labels).
     */
    renameLinkProvider?: RenameLinkProvider;
    /**
     * Event bus to connect `VisualAuthoring` to other components.
     *
     * If not specified, an internal instance will be automatically created.
     */
    authoringCommands?: Events<VisualAuthoringCommands> & EventTrigger<VisualAuthoringCommands>;
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
    /**
     * Handler for a request to navigate to a specific IRI.
     *
     * @deprecated Use element templates to change how IRIs should be opened.
     */
    onIriClick?: (event: IriClickEvent) => void;
    /**
     * Handler for a well-known workspace event.
     */
    onWorkspaceEvent?: (key: WorkspaceEventKey) => void;
    /**
     * Component children.
     */
    children: React.ReactNode;
}

const DEFAULT_LANGUAGE = 'en';
const DEFAULT_TYPE_STYLE_RESOLVER: TypeStyleResolver = types => undefined;
const TYPE_STYLE_COLOR_SEED = 0x0BADBEEF;

/**
 * Top-level component which establishes workspace context, which stores
 * graph data and provides means to display and interact with the diagram.
 *
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
            metadataProvider,
            validationProvider,
            renameLinkProvider,
            authoringCommands = new EventSource(),
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
            renameLinkProvider,
        });

        const editor = new EditorController({
            model,
            authoringCommands,
            metadataProvider,
            validationProvider,
        });

        const overlay = new OverlayController({
            model,
            view,
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

    /**
     * Returns top-level workspace context.
     */
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

/**
 * Parameters which are passed to the workspace initialization callback.
 *
 * @see useLoadedWorkspace()
 */
export interface LoadedWorkspaceParams {
    /**
     * Top-level workspace context to use for initialization.
     */
    readonly context: WorkspaceContext;
    /**
     * Cancellation signal which is aborted on the workspace unmount.
     */
    readonly signal: AbortSignal;
}

/**
 * Result of the workspace initialization hook.
 *
 * @see useLoadedWorkspace()
 */
export interface LoadedWorkspace {
    /**
     * Returns the top-level context for the mounted workspace via the hook.
     *
     * Throws an error if the workspace is not mounted yet.
     */
    readonly getContext: () => WorkspaceContext;
    /**
     * Callback to pass as `ref` to the top-level workspace component
     * to perform the initialization specified in the hook.
     */
    readonly onMount: (workspace: Workspace | null) => void;
}

/**
 * React hook to perform asynchronous initialization of the workspace.
 *
 * This function could be used to setup data provider, fetch initial data
 * or import existing diagram layout.
 *
 * The command history is automatically reset when the initialization is done.
 *
 * **Example**:
 * ```ts
 * const {getContext, onMount} = useLoadedWorkspace();
 * 
 * return (
 *     <Reactodia.Workspace ref={onMount}>
 *         ...
 *     </Reactodia.Workspace>
 * );
 * ```
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

                if (!controller.signal.aborted) {
                    context.model.history.reset();
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
