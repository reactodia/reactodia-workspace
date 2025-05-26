import { HashMap, chainHash, hashString } from '@reactodia/hashmap';
import * as React from 'react';
import { hcl } from 'd3-color';

import { shallowArrayEqual } from '../coreUtils/collections';
import { EventObserver, EventSource } from '../coreUtils/events';
import { LabelLanguageSelector, TranslationBundle, TranslatedText } from '../coreUtils/i18n';

import { ElementTypeIri } from '../data/model';
import { MetadataProvider } from '../data/metadataProvider';
import { ValidationProvider } from '../data/validationProvider';

import { RestoreGeometry, restoreViewport } from '../diagram/commands';
import { TypeStyleResolver, RenameLinkProvider } from '../diagram/customization';
import { CommandHistory, InMemoryHistory } from '../diagram/history';
import {
    CalculatedLayout, LayoutFunction, LayoutTypeProvider, calculateLayout, applyLayout,
} from '../diagram/layout';
import {
    DefaultTranslation, DefaultTranslationBundle, TranslationProvider,
} from '../diagram/locale';
import { SharedCanvasState } from '../diagram/sharedCanvasState';

import { DataDiagramModel } from '../editor/dataDiagramModel';
import { EntityElement, EntityGroup, EntityGroupItem } from '../editor/dataElements';
import { EditorController } from '../editor/editorController';
import {
    groupEntitiesAnimated, ungroupAllEntitiesAnimated, ungroupSomeEntitiesAnimated,
} from '../editor/elementGrouping';
import { OverlayController } from '../editor/overlayController';

import { DefaultLinkTemplate } from '../templates/defaultLinkTemplate';
import { StandardTemplate } from '../templates/standardTemplate';

import type { CommandBusTopic } from './commandBusTopic';
import {
    WorkspaceContext, WorkspaceEventKey, ProcessedTypeStyle,
} from './workspaceContext';

/**
 * Props for {@link Workspace} component.
 *
 * @see {@link Workspace}
 */
export interface WorkspaceProps {
    /**
     * Overrides default command history implementation.
     *
     * By default, it uses {@link InMemoryHistory} instance.
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
     * Overrides how a single label gets selected from multiple of them based on target language.
     */
    selectLabelLanguage?: LabelLanguageSelector;
    /**
     * Initial language to display the graph data with.
     */
    defaultLanguage?: string;
    /**
     * Additional translation bundles for UI text strings in the workspace
     * in order from higher to lower priority.
     *
     * @default []
     * @see {@link useDefaultTranslation}
     */
    translations?: ReadonlyArray<Partial<TranslationBundle>>;
    /**
     * If set, disables translation fallback which (with default `en` language).
     *
     * @default true
     * @see {@link translations}
     */
    useDefaultTranslation?: boolean;
    /**
     * Default function to compute diagram layout.
     *
     * It is recommended to get layout function from a background worker,
     * e.g. with {@link defineDefaultLayouts} and {@link useWorker}.
     *
     * In cases when a worker is not available, it is possible to import and
     * use {@link blockingDefaultLayout} as a synchronous fallback.
     */
    defaultLayout: LayoutFunction;
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

    private readonly extensionCommands = new WeakMap<CommandBusTopic<any>, EventSource<any>>();

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
            typeStyleResolver,
            selectLabelLanguage,
            defaultLanguage = DEFAULT_LANGUAGE,
            translations = [],
            useDefaultTranslation = true,
            defaultLayout,
            onWorkspaceEvent = () => {},
        } = this.props;

        const translationBundles: Partial<TranslationBundle>[] = [...translations];
        if (useDefaultTranslation) {
            translationBundles.push(DefaultTranslationBundle);
        }

        const translation = new DefaultTranslation(translationBundles, selectLabelLanguage);

        this.resolveTypeStyle = typeStyleResolver ?? DEFAULT_TYPE_STYLE_RESOLVER;
        this.cachedTypeStyles = new WeakMap();
        this.cachedGroupStyles = new WeakMap();

        const model = new DataDiagramModel({history, translation});
        model.setLanguage(defaultLanguage);

        const view = new SharedCanvasState({
            defaultElementTemplate: StandardTemplate,
            defaultLinkTemplate: DefaultLinkTemplate,
            defaultLayout,
            renameLinkProvider,
        });

        const editor = new EditorController({
            model,
            metadataProvider,
            validationProvider,
        });

        const overlay = new OverlayController({
            model,
            view,
            translation,
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
            translation,
            disposeSignal: this.cancellation.signal,
            getCommandBus: this.getCommandBus,
            getElementStyle: this.getElementStyle,
            getElementTypeStyle: this.getElementTypeStyle,
            performLayout: this.onPerformLayout,
            group: this.onGroup,
            ungroupAll: this.onUngroupAll,
            ungroupSome: this.onUngroupSome,
            triggerWorkspaceEvent: onWorkspaceEvent,
        };
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
            <TranslationProvider translation={this.workspaceContext.translation}>
                <WorkspaceContext.Provider value={this.workspaceContext}>
                    {children}
                </WorkspaceContext.Provider>
            </TranslationProvider>
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

    private getCommandBus: WorkspaceContext['getCommandBus'] = (extension) => {
        let commands = this.extensionCommands.get(extension);
        if (!commands) {
            commands = new EventSource();
            this.extensionCommands.set(extension, commands);
        }
        return commands;
    };

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
        const {model, view, overlay, translation: t, disposeSignal} = this.workspaceContext;

        const canvas = targetCanvas ?? view.findAnyCanvas();
        if (!canvas) {
            throw new Error('Failed to find any canvas to perform layout');
        }

        canvas.renderingState.syncUpdate();

        const task = overlay.startTask({
            title: t.text('workspace.perform_layout.task'),
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

        const batch = model.history.startBatch(
            TranslatedText.text('workspace.perform_layout.command')
        );
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
        hash = chainHash(hash, hashString(name, hash));
    }
    return hash | 0;
}

/**
 * Parameters which are passed to the workspace initialization callback.
 *
 * @see {@link useLoadedWorkspace}
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
 * @see {@link useLoadedWorkspace}
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

    const stateRef = React.useRef<State>(undefined);
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
