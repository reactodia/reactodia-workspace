import { HashMap, chainHash, hashString } from '@reactodia/hashmap';
import * as React from 'react';
import { hcl } from 'd3-color';

import { shallowArrayEqual } from '../coreUtils/collections';
import { EventObserver, EventSource } from '../coreUtils/events';
import { type Translation, TranslatedText, TranslationProvider } from '../coreUtils/i18n';

import { ElementTypeIri } from '../data/model';
import { MetadataProvider } from '../data/metadataProvider';
import { TemplateProperties, ColorVariant } from '../data/schema';
import { ValidationProvider } from '../data/validationProvider';

import { RestoreGeometry, restoreViewport } from '../diagram/commands';
import { TypeStyleResolver, RenameLinkProvider } from '../diagram/customization';
import { Element, Link } from '../diagram/elements';
import { CommandHistory, InMemoryHistory } from '../diagram/history';
import {
    CalculatedLayout, LayoutFunction, LayoutTypeProvider, calculateLayout, applyLayout,
} from '../diagram/layout';
import { DefaultTranslation, DefaultTranslationBundle } from '../diagram/locale';
import { RenameLinkToLinkStateProvider, SharedCanvasState } from '../diagram/sharedCanvasState';

import { AnnotationElement, AnnotationLink } from '../editor/annotationCells';
import { DataDiagramModel } from '../editor/dataDiagramModel';
import { EntityElement, EntityGroup, EntityGroupItem } from '../editor/dataElements';
import { EditorController } from '../editor/editorController';
import {
    groupEntities, ungroupAllEntities, ungroupSomeEntities,
} from '../editor/elementGrouping';
import {
    OverlayController, type DialogSettingsProvider, DefaultDialogSettingsProvider,
} from '../editor/overlayController';

import { NoteTemplate, NoteLinkTemplate } from '../templates/noteAnnotation';
import { StandardTemplate } from '../templates/standardElement';
import { StandardLinkTemplate } from '../templates/standardLink';

import type { CommandBusTopic } from './commandBusTopic';
import {
    WorkspaceContext, WorkspaceEventKey, ProcessedTypeStyle,
} from './workspaceContext';

const DEFAULT_LANGUAGE = 'en';
const DEFAULT_TYPE_STYLE_RESOLVER: TypeStyleResolver = types => undefined;
const TYPE_STYLE_COLOR_SEED = 0x0BADBEEF;

/**
 * Params for {@link createWorkspace} function.
 */
export interface CreateWorkspaceParams {
    /**
     * Overrides default i18n (translation) implementation.
     *
     * By default, {@link DefaultTranslation} instance with a single
     * {@link DefaultTranslationBundle} is used.
     */
    translation?: Translation;
    /**
     * Overrides default command history implementation.
     *
     * By default, {@link InMemoryHistory} instance is used.
     */
    history?: CommandHistory;
    /**
     * Allows to customize how colors and icons are assigned to elements based
     * on its types.
     *
     * By default, the colors are assigned deterministically based on total
     * hash of type strings.
     *
     * For non-{@link EntityElement entity} elements, the {@link Element.elementState}
     * is checked for {@link TemplateProperties.ColorVariant} template state property
     * instead.
     */
    typeStyleResolver?: TypeStyleResolver;
    /**
     * Provides defaults and persists changes to {@link OverlayDialog overlay dialog} properties.
     *
     * By default, {@link DefaultDialogSettingsProvider} instance is used.
     */
    dialogSettingsProvider?: DialogSettingsProvider;
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
     *
     * By default, {@link DefaultRenameLinkProvider} instance is used.
     *
     * If specified as `null`, the default provider would not be used.
     */
    renameLinkProvider?: RenameLinkProvider | null;
    /**
     * Initial language to display the graph data with.
     */
    defaultLanguage?: string;
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
}

/**
 * Represents a context for the whole workspace, its stores and services.
 *
 * The context tracks ongoing async operations while it's actively mounted
 * with {@link mount mount()} once or many times at the same time,
 * and cancels all operations with {@link WorkspaceContext.disposeSignal}
 * when fully unmounted.
 *
 * @category Core
 */
export interface TrackedWorkspaceContext extends WorkspaceContext {
    /**
     * Mounts the workspace to allow tracking async operations within.
     *
     * @returns a function to unmount the workspace, cancelling all active
     * async operations.
     */
    mount(): () => void;
}

/**
 * Creates standalone workspace context which stores graph data and provides
 * means to display and interact with the diagram.
 *
 * @see {@link WorkspaceProvider}
 */
export function createWorkspace(params: CreateWorkspaceParams): TrackedWorkspaceContext {
    return new RefCountedWorkspaceContext(params);
}

/**
 * Top-level component to mount and provide specified workspace context
 * to the child UI components.
 *
 * @category Components
 * @see {@link createWorkspace}
 */
export function WorkspaceProvider(props: {
    /**
     * Workspace context to provide to the child UI components.
     */
    workspace: TrackedWorkspaceContext;
    /**
     * Handler to run when the context is mounted and UI components are ready.
     *
     * @see {@link useLoadedWorkspace}
     */
    onMount?: (instance: { getContext(): WorkspaceContext } | null) => void;
    /**
     * Component children.
     */
    children: React.ReactNode;
}) {
    const {workspace, onMount, children} = props;

    React.useEffect(() => {
        const unmount = workspace.mount();
        return unmount;
    }, [workspace]);

    React.useEffect(() => {
        if (onMount) {
            const instance = { getContext: () => workspace };
            onMount(instance);
            return () => onMount(null);
        }
    }, [onMount]);

    return (
        <TranslationProvider translation={workspace.translation}>
            <WorkspaceContext.Provider value={workspace}>
                {children}
            </WorkspaceContext.Provider>
        </TranslationProvider>
    );
}

class RefCountedWorkspaceContext implements WorkspaceContext {
    private refCount = 0;
    private cancellation = new AbortController();
    private readonly extensionCommands = new WeakMap<CommandBusTopic<any>, EventSource<any>>();

    private readonly resolveTypeStyle: TypeStyleResolver;
    private readonly cachedTypeStyles: WeakMap<ReadonlyArray<ElementTypeIri>, ProcessedTypeStyle>;
    private readonly cachedGroupStyles: WeakMap<ReadonlyArray<EntityGroupItem>, ProcessedTypeStyle>;
    // TODO: use colors from theme directly
    private readonly annotationStyles = new Map<ColorVariant, ProcessedTypeStyle>([
        ['default', {color: '#bec3c9'}],
        ['primary', {color: '#337ab7'}],
        ['success', {color: '#5cb85c'}],
        ['info', {color: '#54c7ec'}],
        ['warning', {color: '#ffba00'}],
        ['danger', {color: '#c9302c'}],
    ]);

    private readonly layoutTypeProvider: LayoutTypeProvider;

    readonly model: DataDiagramModel;
    readonly view: SharedCanvasState;
    readonly editor: EditorController;
    readonly overlay: OverlayController;
    readonly translation: Translation;

    readonly triggerWorkspaceEvent: (key: WorkspaceEventKey) => void;

    constructor(params: CreateWorkspaceParams) {
        const {
            translation = new DefaultTranslation({
                bundles: [DefaultTranslationBundle],
            }),
            history = new InMemoryHistory(),
            dialogSettingsProvider = new DefaultDialogSettingsProvider(),
            metadataProvider,
            validationProvider,
            renameLinkProvider,
            typeStyleResolver,
            defaultLanguage = DEFAULT_LANGUAGE,
            defaultLayout,
            onWorkspaceEvent = () => {},
        } = params;

        this.translation = translation;

        this.resolveTypeStyle = typeStyleResolver ?? DEFAULT_TYPE_STYLE_RESOLVER;
        this.cachedTypeStyles = new WeakMap();
        this.cachedGroupStyles = new WeakMap();

        this.model = new DataDiagramModel({history, translation: this.translation});
        this.model.setLanguage(defaultLanguage);

        this.view = new SharedCanvasState({
            defaultElementResolver: element => {
                if (element instanceof AnnotationElement) {
                    return NoteTemplate;
                }
                return StandardTemplate;
            },
            defaultLinkResolver: link => {
                if (link instanceof AnnotationLink) {
                    return NoteLinkTemplate;
                }
                return StandardLinkTemplate;
            },
            defaultLayout,
            renameLinkProvider: renameLinkProvider === null ? undefined : (
                renameLinkProvider ?? new DefaultRenameLinkProvider()
            ),
        });

        this.editor = new EditorController({
            model: this.model,
            translation: this.translation,
            getDisposeSignal: () => this.disposeSignal,
            metadataProvider,
            validationProvider,
        });

        this.overlay = new OverlayController({
            model: this.model,
            view: this.view,
            translation: this.translation,
            dialogSettingsProvider,
        });

        this.triggerWorkspaceEvent = onWorkspaceEvent;

        this.layoutTypeProvider = {
            getElementTypes: element => {
                if (element instanceof EntityElement) {
                    return element.data.types;
                }
                return [];
            },
        };

        const listener = new EventObserver();
        listener.listen(this.model.events, 'loadingSuccess', () => {
            for (const canvas of this.view.findAllCanvases()) {
                canvas.renderingState.syncUpdate();
                void canvas.zoomToFit();
            }
        });

        if (onWorkspaceEvent) {
            listener.listen(this.model.events, 'changeSelection', () =>
                onWorkspaceEvent(WorkspaceEventKey.editorChangeSelection)
            );
            listener.listen(this.overlay.events, 'changeOpenedDialog', () =>
                onWorkspaceEvent(WorkspaceEventKey.editorToggleDialog)
            );
        }
    }

    mount(): () => void {
        this.refCount++;
        let mounted = true;
        return () => {
            if (mounted) {
                mounted = false;
                this.refCount--;
                if (this.refCount === 0) {
                    this.view.dispose();
                    this.cancellation.abort();
                    this.cancellation = new AbortController();
                }
            }
        };
    }

    get disposeSignal(): AbortSignal {
        return this.cancellation.signal;
    }

    readonly getCommandBus: WorkspaceContext['getCommandBus'] = (extension) => {
        let commands = this.extensionCommands.get(extension);
        if (!commands) {
            commands = new EventSource();
            this.extensionCommands.set(extension, commands);
        }
        return commands;
    };

    readonly getElementStyle: WorkspaceContext['getElementStyle'] = element => {
        if (element instanceof EntityElement) {
            return this.getElementTypeStyle(element.data.types);
        } else if (element instanceof EntityGroup) {
            return this.getGroupTypeStyle(element);
        } else {
            const style = this.tryGetColorVariantStyle(element);
            return style ??this.getElementTypeStyle([]);
        }
    };

    readonly getElementTypeStyle: WorkspaceContext['getElementTypeStyle'] = types => {
        let processedStyle = this.cachedTypeStyles.get(types);
        if (!processedStyle) {
            const customStyle = this.resolveTypeStyle(types);

            let color: string;
            if (customStyle && customStyle.color) {
                color = hcl(customStyle.color).toString();
            } else {
                const hue = getHueFromClasses(types, TYPE_STYLE_COLOR_SEED);
                color = hcl(hue, 40, 75).toString();
            }

            processedStyle = {...customStyle, color};
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

    private tryGetColorVariantStyle(element: Element): ProcessedTypeStyle | undefined {
        const {elementState} = element;
        const colorVariant = elementState.get(TemplateProperties.ColorVariant);
        if (colorVariant || element instanceof AnnotationElement) {
            return this.annotationStyles.get(colorVariant ?? 'default');
        }
        return undefined;
    }

    readonly performLayout: WorkspaceContext['performLayout'] = async params => {
        const {
            canvas: targetCanvas, layoutFunction, selectedElements, fixedElements,
            animate, signal, zoomToFit = true,
        } = params;
        const {model, view, overlay, disposeSignal} = this;
        const t = this.translation;

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
                fixedElements,
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
                await canvas.zoomToFit();
            }
        }
    };

    readonly group: WorkspaceContext['group'] = params => {
        return groupEntities(this, params);
    };

    readonly ungroupAll: WorkspaceContext['ungroupAll'] = params => {
        return ungroupAllEntities(this, params);
    };

    readonly ungroupSome: WorkspaceContext['ungroupSome'] = params => {
        return ungroupSomeEntities(this, params);
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
    readonly onMount: (instance: { getContext(): WorkspaceContext } | null) => void;
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
 * const workspace = React.useState(() => Reactodia.createWorkspace({...}));
 * const {onMount} = Reactodia.useLoadedWorkspace(async ({context, signal}) => {
 *     // ...
 * });
 * return (
 *     <Reactodia.WorkspaceProvider
 *         workspace={workspace}
 *         onMount={onMount}>
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
            void (async () => {
                const task = context.overlay.startTask();
                try {
                    // Move execution into a microtask to avoid React warnings
                    // when calling RenderingState.syncUpdate()
                    await Promise.resolve();

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

/**
 * Default {@link RenameLinkProvider} implementation for the {@link Workspace workspace}.
 *
 * Unless overridden, it allows to rename {@link AnnotationLink} graph links
 * and stores the changed label in the {@link Link.linkState link template state}.
 *
 * @see {@link WorkspaceProps.renameLinkProvider}
 * @see {@link RenameLinkToLinkStateProvider}
 */
export class DefaultRenameLinkProvider extends RenameLinkToLinkStateProvider {
    override canRename(link: Link): boolean {
        return link instanceof AnnotationLink;
    }
}
