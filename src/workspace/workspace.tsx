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
import { calculateLayout, applyLayout } from '../diagram/layout';
import { SharedCanvasState, IriClickEvent } from '../diagram/sharedCanvasState';

import { AsyncModel, GroupBy } from '../editor/asyncModel';
import { EditorController } from '../editor/editorController';
import { OverlayController, PropertyEditor } from '../editor/overlayController';

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
            onWorkspaceEvent = () => {},
        } = this.props;

        this.resolveTypeStyle = typeStyleResolver ?? DEFAULT_TYPE_STYLE_RESOLVER;
        this.cachedTypeStyles = new WeakMap();

        const model = new AsyncModel({history, selectLabelLanguage, groupBy});
        model.setLanguage(defaultLanguage);

        const view = new SharedCanvasState({
            defaultElementTemplate: StandardTemplate,
        });

        const editor = new EditorController({
            model,
            validationApi,
        });
        editor.setMetadataApi(metadataApi);

        const overlayController = new OverlayController({
            model,
            view,
            editor,
            propertyEditor,
        });

        this.workspaceContext = {
            model,
            view,
            editor,
            overlayController,
            disposeSignal: this.cancellation.signal,
            getElementTypeStyle: this.getElementTypeStyle,
            performLayout: this.onPerformLayout,
            triggerWorkspaceEvent: onWorkspaceEvent,
        };
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
        const {model, view, editor, overlayController} = this.workspaceContext;

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
            this.listener.listen(overlayController.events, 'changeOpenedDialog', () =>
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
        const {view, editor, overlayController} = this.workspaceContext;
        view.dispose();
        editor.dispose();
        overlayController.dispose();
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
        const {canvas, layoutFunction, selectedElements, animate, signal} = params;
        const {model, disposeSignal} = this.workspaceContext;

        canvas.renderingState.syncUpdate();
        const calculatedLayout = await calculateLayout({
            layoutFunction,
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
