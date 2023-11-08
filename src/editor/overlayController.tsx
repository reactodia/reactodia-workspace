import * as React from 'react';

import { Events, EventObserver, EventSource, PropertyChange } from '../coreUtils/events';

import { ElementModel, LinkModel } from '../data/model';

import { CanvasApi, CanvasContext, CanvasPointerUpEvent } from '../diagram/canvasApi';
import { Element, Link, LinkVertex } from '../diagram/elements';
import { Vector } from '../diagram/geometry';
import { calculateLayout, applyLayout, layoutForcePadded } from '../diagram/layout';
import { Spinner, SpinnerProps } from '../diagram/spinner';
import { DiagramView, ElementDecoratorResolver } from '../diagram/view';

import { Dialog } from '../widgets/dialog';

import { EditEntityForm } from '../forms/editEntityForm';
import { EditElementTypeForm } from '../forms/editElementTypeForm';
import { EditLinkForm } from '../forms/editLinkForm';
import { EditLinkLabelForm } from '../forms/editLinkLabelForm';

import { AsyncModel } from './asyncModel';
import { AuthoringState, TemporaryState } from './authoringState';
import { EditorController } from './editorController';
import { EditLayer, EditLayerMode } from './editLayer';
import { ElementDecorator } from './elementDecorator';
import { LinkStateWidget } from './linkStateWidget';

export interface OverlayControllerProps extends OverlayControllerOptions {
    readonly model: AsyncModel;
    readonly view: DiagramView;
    readonly editor: EditorController;
}

interface OverlayControllerOptions {
    readonly propertyEditor: PropertyEditor | undefined;
}

export type PropertyEditor = (options: PropertyEditorOptions) => React.ReactElement<any>;
export interface PropertyEditorOptions {
    elementData: ElementModel;
    onSubmit: (newData: ElementModel) => void;
    onCancel?: () => void;
}

export interface OverlayControllerEvents {
    changeOpenedDialog: PropertyChange<OverlayController, OpenedDialog | undefined>;
}

export type KnownDialogType =
    | 'connectionsMenu'
    | 'editEntity'
    | 'editLink'
    | 'editEntityType'
    | 'editLinkLabel';

export interface OpenedDialog {
    readonly target: Element | Link;
    readonly knownType: KnownDialogType | undefined;
    readonly holdSelection: boolean;
}

export class OverlayController {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<OverlayControllerEvents>();
    readonly events: Events<OverlayControllerEvents> = this.source;

    private readonly model: AsyncModel;
    private readonly view: DiagramView;
    private readonly editor: EditorController;
    private readonly options: OverlayControllerOptions;

    private readonly authoringStateDecorator: ElementDecoratorResolver;

    private _openedDialog: OpenedDialog | undefined;

    constructor(props: OverlayControllerProps) {
        const {model, view, editor, ...options} = props;
        this.model = model;
        this.view = view;
        this.editor = editor;
        this.options = options;

        this.listener.listen(this.model.events, 'loadingStart', () => this.setSpinner({}));
        this.listener.listen(this.model.events, 'loadingSuccess', () => {
            this.setSpinner(undefined);
            this.view.setCanvasWidget('states', {
                element: <LinkStateWidget />,
                attachment: 'overLinks',
            });
        });
        this.listener.listen(this.model.events, 'loadingError', ({error}) => {
            const statusText = error ? error.message : undefined;
            this.setSpinner({statusText, errorOccurred: true});
        });
        const finishGroupLayout = async (group: string) => {
            const canvas = this.view.findAnyCanvas();
            if (canvas) {
                canvas.renderingState.syncUpdate();
                const layout = await calculateLayout({
                    layoutFunction: layoutForcePadded,
                    model: this.model,
                    sizeProvider: canvas.renderingState,
                });
                applyLayout(layout, this.model);
                this.model.triggerChangeGroupContent(group, {layoutComplete: true});
            }
        };
        this.listener.listen(this.model.events, 'changeGroupContent', e => {
            if (!e.layoutComplete) {
                finishGroupLayout(e.group);
            }
        });
        this.listener.listen(this.editor.events, 'changeSelection', () => {
            const target = this.editor.selection.length === 1 ? this.editor.selection[0] : undefined;
            if (this.openedDialog && this.openedDialog.target !== target) {
                this.hideDialog();
            }
        });

        view.setCanvasWidget('selectionHandler', {
            element: <CanvasOverlayHandler onCanvasPointerUp={this.onAnyCanvasPointerUp} />,
            attachment: 'viewport',
        });
        this.authoringStateDecorator = (element: Element) => (
            <ElementDecorator target={element}
                position={element.position}
            />
        );
        this.listener.listen(this.editor.events, 'changeMode', () => {
            this.updateElementDecorator();
        });
        this.updateElementDecorator();
    }

    get openedDialog(): OpenedDialog | undefined {
        return this._openedDialog;
    }

    dispose() {
        this.listener.stopListening();
    }

    private onAnyCanvasPointerUp = (event: CanvasPointerUpEvent) => {
        const {sourceEvent, target, triggerAsClick} = event;

        if (sourceEvent.ctrlKey || sourceEvent.shiftKey || sourceEvent.metaKey) {
            return;
        }
        if (this.openedDialog && this.openedDialog.holdSelection) {
            return;
        }

        if (target instanceof Element) {
            this.editor.setSelection([target]);
            target.focus();
        } else if (target instanceof Link) {
            this.editor.setSelection([target]);
        } else if (target instanceof LinkVertex) {
            this.editor.setSelection([target.link]);
        } else if (!target && triggerAsClick) {
            this.editor.setSelection([]);
            this.hideDialog();
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
        }
    }

    private updateElementDecorator() {
        this.view._setElementDecorator(
            this.editor.inAuthoringMode ? this.authoringStateDecorator : undefined
        );
    };

    setSpinner(props: SpinnerProps | undefined) {
        this.view.setCanvasWidget('loadingWidget', props ? {
            element: <LoadingWidget spinnerProps={props} />,
            attachment: 'viewport',
        } : null);
    }

    showSpinnerWhile(operation: Promise<unknown>): void {
        this.setSpinner({});
        operation.then(() => {
            this.setSpinner(undefined);
        }).catch(error => {
            // tslint:disable-next-line:no-console
            console.error(error);
            this.setSpinner({statusText: 'Unknown error occurred', errorOccurred: true});
        });
    }

    showDialog(params: {
        target: Element | Link;
        dialogType?: KnownDialogType;
        content: React.ReactElement<any>;
        size?: { width: number; height: number };
        caption?: string;
        offset?: Vector;
        calculatePosition?: (canvas: CanvasApi) => Vector | undefined;
        holdSelection?: boolean;
        onClose: () => void;
    }) {
        const {
            target, dialogType, content, size, caption, offset, calculatePosition, onClose,
            holdSelection = false,
        } = params;
        if (this._openedDialog && this._openedDialog.target !== target) {
            this.hideDialog();
        }

        const previousDialog = this._openedDialog;
        this._openedDialog = {
            target,
            knownType: dialogType,
            holdSelection,
        };

        const dialog = (
            <Dialog target={target}
                size={size}
                caption={caption}
                offset={offset}
                calculatePosition={calculatePosition}
                onClose={onClose}>
                {content}
            </Dialog>
        );
        this.view.setCanvasWidget('dialog', {element: dialog, attachment: 'overElements'});
        this.source.trigger('changeOpenedDialog', {
            source: this,
            previous: previousDialog,
        });
    }

    hideDialog() {
        if (this._openedDialog) {
            this.editor.removeTemporaryCells([this._openedDialog.target]);
            const previous = this._openedDialog;
            this._openedDialog = undefined;
            this.view.setCanvasWidget('dialog', null);
            this.source.trigger('changeOpenedDialog', {source: this, previous});
        }
    }

    startEditing(params: { target: Element | Link; mode: EditLayerMode; point: Vector }) {
        const {target, mode, point} = params;
        const onFinishEditing = () => {
            this.view.setCanvasWidget('editLayer', null);
        };
        const editLayer = (
            <EditLayer mode={mode}
                target={target}
                point={point}
                onFinishEditing={onFinishEditing}
            />
        );
        this.view.setCanvasWidget('editLayer', {element: editLayer, attachment: 'overElements'});
    }

    showEditEntityForm(target: Element) {
        const {propertyEditor} = this.options;
        const onSubmit = (newData: ElementModel) => {
            this.hideDialog();
            this.editor.changeEntityData(target.data.id, newData);
        };
        let modelToEdit = target.data;
        const event = this.editor.authoringState.elements.get(target.data.id);
        if (event && event.newIri) {
            modelToEdit = {...target.data, id: event.newIri};
        }
        const onCancel = () => this.hideDialog();
        const content = propertyEditor ? propertyEditor({elementData: target.data, onSubmit, onCancel}) : (
            <EditEntityForm
                view={this.view}
                entity={modelToEdit}
                onApply={onSubmit}
                onCancel={onCancel}
            />
        );
        this.showDialog({
            target,
            dialogType: 'editEntity',
            content,
            holdSelection: true,
            onClose: onCancel,
        });
    }

    showEditElementTypeForm({link, source, target, targetIsNew}: {
        link: Link;
        source: Element;
        target: Element;
        targetIsNew: boolean;
    }) {
        const onCancel = () => {
            this.editor.removeTemporaryCells([target, link]);
            this.hideDialog();
        };
        const content = (
            <EditElementTypeForm editor={this.editor}
                view={this.view}
                metadataApi={this.editor.metadataApi}
                link={link.data}
                source={source.data}
                target={{value: target.data, isNew: targetIsNew}}
                onChangeElement={(data: ElementModel) => {
                    const previous = target.data;
                    this.editor.setTemporaryState(TemporaryState.deleteElement(this.editor.temporaryState, previous));
                    target.setData(data);
                    this.editor.setTemporaryState(TemporaryState.addElement(this.editor.temporaryState, data));
                }}
                onChangeLink={(data: LinkModel) => {
                    this.editor.removeTemporaryCells([link]);
                    const newLink = makeLinkWithDirection(
                        new Link({
                            sourceId: source.id,
                            targetId: target.id,
                            data: {
                                ...data,
                                sourceId: source.iri,
                                targetId: target.iri,
                            }
                        }),
                        data
                    );
                    link = this.editor.createNewLink({link: newLink, temporary: true});
                }}
                onApply={(elementData: ElementModel, isNewElement: boolean, linkData: LinkModel) => {
                    this.editor.removeTemporaryCells([target, link]);

                    const batch = this.model.history.startBatch(
                        isNewElement ? 'Create new entity' : 'Link to entity'
                    );

                    this.model.addElement(target);
                    if (isNewElement) {
                        target.setExpanded(true);
                        this.editor.setAuthoringState(
                            AuthoringState.addElement(this.editor.authoringState, target.data)
                        );
                    } else {
                        this.model.requestLinksOfType();
                    }

                    const newLink = makeLinkWithDirection(
                        new Link({
                            sourceId: source.id,
                            targetId: target.id,
                            data: {
                                ...link.data,
                                sourceId: source.iri,
                                targetId: target.iri,
                            }
                        }),
                        linkData
                    );
                    this.editor.createNewLink({link: newLink});

                    batch.store();

                    this.hideDialog();
                    if (isNewElement) {
                        this.showEditEntityForm(target);
                    }
                }}
                onCancel={onCancel}
            />
        );
        this.showDialog({
            target,
            dialogType: 'editEntityType',
            content,
            caption: 'Establish New Connection',
            onClose: onCancel,
        });
    }

    showEditLinkForm(link: Link) {
        const source = this.model.getElement(link.sourceId)!.data;
        const target = this.model.getElement(link.targetId)!.data;
        const onCancel = () => {
            this.editor.removeTemporaryCells([link]);
            this.hideDialog();
        };
        const content = (
            <EditLinkForm editor={this.editor}
                view={this.view}
                metadataApi={this.editor.metadataApi}
                link={link.data}
                source={source}
                target={target}
                onChange={(data: LinkModel) => {
                    if (this.editor.temporaryState.links.has(link.data)) {
                        this.editor.removeTemporaryCells([link]);
                        const newLink = makeLinkWithDirection(link, data);
                        this.showEditLinkForm(
                            this.editor.createNewLink({link: newLink, temporary: true})
                        );
                    }
                }}
                onApply={(data: LinkModel) => {
                    if (this.editor.temporaryState.links.has(link.data)) {
                        this.editor.removeTemporaryCells([link]);
                        const newLink = makeLinkWithDirection(link, data);
                        this.editor.createNewLink({link: newLink});
                    } else {
                        this.editor.changeLink(link.data, data);
                    }
                    this.hideDialog();
                }}
                onCancel={onCancel}/>
        );
        const caption = this.editor.temporaryState.links.has(link.data)
            ? 'Establish New Connection'
            : 'Edit Connection';
        this.showDialog({
            target: link,
            dialogType: 'editLink',
            content,
            size: {width: 300, height: 160},
            caption,
            onClose: onCancel,
        });
    }

    showEditLinkLabelForm(link: Link) {
        const size = {width: 300, height: 145};
        const onFinish = () => this.hideDialog();
        this.showDialog({
            target: link,
            dialogType: 'editLinkLabel',
            content: (
                <EditLinkLabelForm link={link}
                    onFinish={onFinish}
                />
            ),
            size,
            caption: 'Edit Link Label',
            offset: {x: 25, y: - size.height / 2},
            calculatePosition: canvas => {
                const bounds = canvas.renderingState.getLinkLabelBounds(link);
                if (bounds) {
                    const {x, y, width, height} = bounds;
                    return {x: x + width, y: y + height / 2};
                } else {
                    return undefined;
                }
            },
            onClose: onFinish,
        });
    }
}

function LoadingWidget(props: { spinnerProps: SpinnerProps }) {
    const {spinnerProps} = props;
    const {canvas} = React.useContext(CanvasContext)!;
    const {clientWidth, clientHeight} = canvas.metrics.area;
    const x = spinnerProps.statusText ? clientWidth / 3 : clientHeight / 2;
    const position = {x, y: clientHeight / 2};
    return (
        <div className='ontodia-loading-widget'>
            <svg width={clientWidth} height={clientHeight}>
                <Spinner position={position} {...spinnerProps} />
            </svg>
        </div>
    );
}

function CanvasOverlayHandler(props: {
    onCanvasPointerUp: (event: CanvasPointerUpEvent) => void;
}) {
    const {onCanvasPointerUp} = props;
    const {canvas} = React.useContext(CanvasContext)!;
    React.useEffect(() => {
        const listener = new EventObserver();
        listener.listen(canvas.events, 'pointerUp', onCanvasPointerUp);
        return () => listener.stopListening();
    }, [onCanvasPointerUp]);
    return null;
}

function makeLinkWithDirection(original: Link, data: LinkModel): Link {
    if (!(data.sourceId === original.data.sourceId || data.sourceId === original.data.targetId)) {
        throw new Error('New link source IRI is unrelated to original link');
    }
    if (!(data.targetId === original.data.sourceId || data.targetId === original.data.targetId)) {
        throw new Error('New link target IRI is unrelated to original link');
    }
    const sourceId = data.sourceId === original.data.sourceId
        ? original.sourceId : original.targetId;
    const targetId = data.targetId === original.data.targetId
        ? original.targetId : original.sourceId;
    return new Link({sourceId, targetId, data});
}
