import * as React from 'react';
import { hcl } from 'd3-color';

import { EventObserver } from '../coreUtils/events';

import { ElementTypeIri } from '../data/model';
import { MetadataApi } from '../data/metadataApi';
import { ValidationApi } from '../data/validationApi';
import { hashFnv32a } from '../data/utils';

import { RestoreGeometry, restoreViewport } from '../diagram/commands';
import { TypeStyleResolver, LabelLanguageSelector } from '../diagram/customization';
import { CommandHistory, InMemoryHistory } from '../diagram/history';
import { LayoutFunction, calculateLayout, applyLayout } from '../diagram/layout';
import { blockingDefaultLayout } from '../diagram/layoutShared';
import { SharedCanvasState, IriClickEvent } from '../diagram/sharedCanvasState';

import { AsyncModel, GroupBy } from '../editor/asyncModel';
import { EditorController } from '../editor/editorController';
import { OverlayController, PropertyEditor } from '../editor/overlayController';

import { DefaultLinkTemplate } from '../templates/defaultLinkTemplate';
import { StandardTemplate } from '../templates/standardTemplate';

import {
    WorkspaceContext, WorkspaceEventHandler, WorkspaceEventKey, ProcessedTypeStyle,
} from './workspaceContext';

export interface WorkspaceProps {
    history?: CommandHistory;
    /**
     * If provided, switches editor into "authoring mode".
     */
    metadataApi?: MetadataApi;
    validationApi?: ValidationApi;
    propertyEditor?: PropertyEditor;
    typeStyleResolver?: TypeStyleResolver;
    groupBy?: ReadonlyArray<GroupBy>;
    /**
     * Overrides label selection based on target language.
     */
    selectLabelLanguage?: LabelLanguageSelector;
    /**
     * Initial selected language.
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

export class Workspace extends React.Component<WorkspaceProps> {
    private readonly listener = new EventObserver();
    private readonly cancellation = new AbortController();

    private readonly resolveTypeStyle: TypeStyleResolver;
    private readonly cachedTypeStyles: WeakMap<ReadonlyArray<ElementTypeIri>, ProcessedTypeStyle>;

    private readonly workspaceContext: WorkspaceContext;

    constructor(props: WorkspaceProps) {
        super(props);

        const {
            history = new InMemoryHistory(),
            metadataApi,
            validationApi,
            propertyEditor,
            groupBy = [],
            typeStyleResolver,
            selectLabelLanguage,
            defaultLanguage = DEFAULT_LANGUAGE,
            defaultLayout,
            onWorkspaceEvent = () => {},
        } = this.props;

        this.resolveTypeStyle = typeStyleResolver ?? DEFAULT_TYPE_STYLE_RESOLVER;
        this.cachedTypeStyles = new WeakMap();

        const model = new AsyncModel({history, selectLabelLanguage, groupBy});
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

        this.workspaceContext = {
            model,
            view,
            editor,
            overlay,
            disposeSignal: this.cancellation.signal,
            getElementTypeStyle: this.getElementTypeStyle,
            performLayout: this.onPerformLayout,
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

    render() {
        const {children} = this.props;
        return (
            <WorkspaceContext.Provider value={this.workspaceContext}>
                {children}
            </WorkspaceContext.Provider>
        );
    }

    componentDidMount() {
        const {onWorkspaceEvent} = this.props;
        const {model, view, editor, overlay} = this.workspaceContext;

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
            this.listener.listen(editor.events, 'changeSelection', () =>
                onWorkspaceEvent(WorkspaceEventKey.editorChangeSelection)
            );
            this.listener.listen(overlay.events, 'changeOpenedDialog', () =>
                onWorkspaceEvent(WorkspaceEventKey.editorToggleDialog)
            );
        }
    }

    componentDidUpdate(prevProps: WorkspaceProps) {
        const {editor} = this.workspaceContext;

        if (this.props.metadataApi !== editor.metadataApi) {
            editor.setMetadataApi(this.props.metadataApi);
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        const {view, editor, overlay} = this.workspaceContext;
        view.dispose();
        editor.dispose();
        overlay.dispose();
    }

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

    private onPerformLayout: WorkspaceContext['performLayout'] = async params => {
        const {canvas: targetCanvas, layoutFunction, selectedElements, animate, signal} = params;
        const {model, view, disposeSignal} = this.workspaceContext;

        const canvas = targetCanvas ?? view.findAnyCanvas();
        if (!canvas) {
            throw new Error('Failed to find any canvas to perform layout');
        }

        canvas.renderingState.syncUpdate();
        const calculatedLayout = await calculateLayout({
            layoutFunction: layoutFunction ?? view.defaultLayout,
            model,
            selectedElements,
            sizeProvider: canvas.renderingState,
            signal: signal ?? disposeSignal,
        });

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
                canvas.zoomToFit({animate: true})
            ]);
        } else {
            applyLayout(calculatedLayout, model);
            batch.store();
            canvas.zoomToFit();
        }
    };
}

function getHueFromClasses(classes: ReadonlyArray<ElementTypeIri>, seed?: number): number {
    let hash = seed;
    for (const name of classes) {
        hash = hashFnv32a(name, hash);
    }
    const MAX_INT32 = 0x7fffffff;
    return 360 * ((hash === undefined ? 0 : hash) / MAX_INT32);
}

export interface LoadedWorkspace {
    readonly getContext: () => WorkspaceContext;
    readonly onMount: (workspace: Workspace | null) => void;
}

export function useLoadedWorkspace(
    onLoad: (context: WorkspaceContext, signal: AbortSignal) => Promise<void>,
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
            latestOnLoad(context, controller.signal).catch(err => {
                if (controller.signal.aborted) {
                    return;
                }
                context.overlay.setSpinner({ errorOccurred: true });
                console.error('Error loading Reactodia workspace', err);
            });

            return () => {
                controller.abort();
                context.model.discardLayout();
            };
        }
    }, [context, ...deps]);

    return stateRef.current.loadedWorkspace;
}
