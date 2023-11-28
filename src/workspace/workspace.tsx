import * as React from 'react';

import { EventObserver } from '../coreUtils/events';

import { MetadataApi } from '../data/metadataApi';
import { ValidationApi } from '../data/validationApi';

import type { CanvasApi } from '../diagram/canvasApi';
import { RestoreGeometry, restoreViewport } from '../diagram/commands';
import { TypeStyleResolver } from '../diagram/customization';
import { CommandHistory, InMemoryHistory } from '../diagram/history';
import { calculateLayout, applyLayout } from '../diagram/layout';
import { DiagramView, IriClickEvent, LabelLanguageSelector } from '../diagram/view';

import { AsyncModel, GroupBy } from '../editor/asyncModel';
import { EditorController } from '../editor/editorController';
import { OverlayController, PropertyEditor } from '../editor/overlayController';

import {
    WorkspaceContext, WorkspacePerformLayout, WorkspaceEventHandler, WorkspaceEventKey,
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

export class Workspace extends React.Component<WorkspaceProps> {
    private readonly listener = new EventObserver();
    private readonly cancellation = new AbortController();

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

        const model = new AsyncModel(history, groupBy);
        const view = new DiagramView({
            model,
            typeStyleResolver,
            selectLabelLanguage,
        });
        view.setLanguage(defaultLanguage);

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

    private onPerformLayout: WorkspacePerformLayout = async params => {
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
