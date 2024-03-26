import * as React from 'react';

import { Events, EventObserver, EventSource, PropertyChange } from '../coreUtils/events';

import { ElementModel, LinkModel } from '../data/model';

import { CanvasApi, CanvasPointerUpEvent, useCanvas } from '../diagram/canvasApi';
import { Element, Link, LinkVertex, makeLinkWithDirection } from '../diagram/elements';
import { Vector } from '../diagram/geometry';
import { calculateLayout, applyLayout } from '../diagram/layout';
import { SharedCanvasState, ElementDecoratorResolver } from '../diagram/sharedCanvasState';
import { Spinner, SpinnerProps } from '../diagram/spinner';

import { Dialog } from '../widgets/dialog';

import { EditEntityForm } from '../forms/editEntityForm';
import { EditLinkForm } from '../forms/editLinkForm';
import { FindOrCreateEntityForm } from '../forms/findOrCreateEntityForm';
import { RenameLinkForm } from '../forms/renameLinkForm';

import { AsyncModel } from './asyncModel';
import { AuthoringState } from './authoringState';
import { EditorController } from './editorController';
import { EditLayer, EditLayerMode } from './editLayer';
import { ElementDecorator } from './elementDecorator';
import { LinkStateWidget } from './linkStateWidget';

export interface OverlayControllerProps extends OverlayControllerOptions {
    readonly model: AsyncModel;
    readonly view: SharedCanvasState;
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
    | 'findOrCreateEntity'
    | 'renameLink';

export interface OpenedDialog {
    readonly target: Element | Link;
    readonly knownType: KnownDialogType | undefined;
    readonly holdSelection: boolean;
    readonly onClose: () => void;
}

export class OverlayController {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<OverlayControllerEvents>();
    readonly events: Events<OverlayControllerEvents> = this.source;

    private readonly model: AsyncModel;
    private readonly view: SharedCanvasState;
    private readonly editor: EditorController;
    private readonly options: OverlayControllerOptions;

    private readonly authoringStateDecorator: ElementDecoratorResolver;

    private _openedDialog: OpenedDialog | undefined;

    /** @hidden */
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
            let statusText: string | undefined;
            if (error && typeof error === 'object' && 'message' in error) {
                const message = error.message;
                if (typeof message === 'string') {
                    statusText = message;
                }
            }
            this.setSpinner({statusText, errorOccurred: true});
        });
        const finishGroupLayout = async (group: string) => {
            const canvas = this.view.findAnyCanvas();
            if (canvas) {
                canvas.renderingState.syncUpdate();
                const layout = await calculateLayout({
                    layoutFunction: this.view.defaultLayout,
                    model: this.model,
                    sizeProvider: canvas.renderingState,
                    group,
                });
                applyLayout(layout, this.model);
                this.model._triggerChangeGroupContent(group, {layoutComplete: true});
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

    /** @hidden */
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
    };

    private updateElementDecorator() {
        this.view._setElementDecorator(
            this.editor.inAuthoringMode ? this.authoringStateDecorator : undefined
        );
    }

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
            onClose,
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
            const previous = this._openedDialog;
            this._openedDialog = undefined;
            previous.onClose();
            this.editor.removeTemporaryCells([previous.target]);
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

    showFindOrCreateEntityForm({link, source, target, targetIsNew}: {
        link: Link;
        source: Element;
        target: Element;
        targetIsNew: boolean;
    }) {
        const onCancel = () => {
            this.editor.removeAllTemporaryCells();
            this.hideDialog();
        };
        const content = (
            <FindOrCreateEntityForm source={source}
                target={target}
                initialTargetIsNew={targetIsNew}
                originalLink={link}
                onAfterApply={() => {
                    this.hideDialog();
                    if (AuthoringState.isNewElement(this.editor.authoringState, target.iri)) {
                        this.showEditEntityForm(target);
                    }
                }}
                onCancel={onCancel}
            />
        );
        this.showDialog({
            target,
            dialogType: 'findOrCreateEntity',
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
            <EditLinkForm link={link.data}
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

    showRenameLinkForm(link: Link): void {
        const size = {width: 300, height: 145};
        const onFinish = () => this.hideDialog();
        this.showDialog({
            target: link,
            dialogType: 'renameLink',
            content: (
                <RenameLinkForm link={link}
                    onFinish={onFinish}
                />
            ),
            size,
            caption: 'Rename Link',
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
    const {canvas} = useCanvas();
    const {clientWidth, clientHeight} = canvas.metrics.area;
    const x = spinnerProps.statusText ? clientWidth / 3 : clientHeight / 2;
    const position = {x, y: clientHeight / 2};
    return (
        <div className='reactodia-loading-widget'>
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
    const {canvas} = useCanvas();
    React.useEffect(() => {
        const listener = new EventObserver();
        listener.listen(canvas.events, 'pointerUp', onCanvasPointerUp);
        return () => listener.stopListening();
    }, [onCanvasPointerUp]);
    return null;
}
