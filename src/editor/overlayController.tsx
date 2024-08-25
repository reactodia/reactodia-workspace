import * as React from 'react';

import { Events, EventObserver, EventSource, PropertyChange } from '../coreUtils/events';

import { ElementModel, LinkModel } from '../data/model';

import { CanvasPointerUpEvent, useCanvas } from '../diagram/canvasApi';
import { Element, Link, LinkVertex } from '../diagram/elements';
import { Size } from '../diagram/geometry';
import { SharedCanvasState, ElementDecoratorResolver } from '../diagram/sharedCanvasState';
import { Spinner, SpinnerProps } from '../diagram/spinner';

import { Dialog, DialogStyleProps } from '../widgets/dialog';

import { EditEntityForm } from '../forms/editEntityForm';
import { EditLinkForm } from '../forms/editLinkForm';
import { FindOrCreateEntityForm } from '../forms/findOrCreateEntityForm';
import { RenameLinkForm } from '../forms/renameLinkForm';

import { AuthoringState } from './authoringState';
import { DataDiagramModel } from './dataDiagramModel';
import { EntityElement, RelationLink } from './dataElements';
import { EditorController } from './editorController';
import { EditLayer, DragEditOperation } from './editLayer';
import { ElementDecorator } from './elementDecorator';
import { LinkStateWidget } from './linkStateWidget';

export interface OverlayControllerProps extends OverlayControllerOptions {
    readonly model: DataDiagramModel;
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

    private readonly model: DataDiagramModel;
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

        this.listener.listen(this.model.events, 'loadingSuccess', () => {
            this.view.setCanvasWidget('states', {
                element: <LinkStateWidget />,
                attachment: 'overLinks',
            });
        });
        this.listener.listen(this.model.events, 'changeSelection', () => {
            const target = this.model.selection.length === 1 ? this.model.selection[0] : undefined;
            if (this.openedDialog && this.openedDialog.target !== target) {
                this.hideDialog();
            }
        });

        view.setCanvasWidget('selectionHandler', {
            element: <CanvasOverlayHandler onCanvasPointerUp={this.onAnyCanvasPointerUp} />,
            attachment: 'viewport',
        });
        this.authoringStateDecorator = (element: Element) => {
            if (element instanceof EntityElement) {
                return (
                    <ElementDecorator target={element}
                        position={element.position}
                    />
                );
            }
            return undefined;
        };
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
            this.model.setSelection([target]);
            target.focus();
        } else if (target instanceof Link) {
            this.model.setSelection([target]);
        } else if (target instanceof LinkVertex) {
            this.model.setSelection([target.link]);
        } else if (!target && triggerAsClick) {
            this.model.setSelection([]);
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

    /** @hidden */
    _startTask(): OverlayTask {
        let hasError = false;
        let error: unknown;

        this.setSpinner({});
        return {
            setError: (taskError: unknown) => {
                hasError = true;
                error = taskError;
            },
            end: () => {
                if (hasError) {
                    let statusText: string | undefined;
                    if (error && typeof error === 'object' && 'message' in error) {
                        const message = error.message;
                        if (typeof message === 'string') {
                            statusText = message;
                        }
                    }
                    this.setSpinner({statusText, errorOccurred: true});
                } else {
                    this.setSpinner(undefined);
                }
            },
        };
    }

    private setSpinner(props: SpinnerProps | undefined) {
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
        /**
         * Element or link to anchor dialog to.
         */
        target: Element | Link;
        dialogType?: KnownDialogType;
        /**
         * Dialog style, placement and sizing options.
         */
        style?: DialogStyleProps;
        /**
         * Dialog content.
         */
        content: React.ReactElement<any>;
        /**
         * Whether to prevent selection changes while dialog is open.
         *
         * @default false
         */
        holdSelection?: boolean;
        /**
         * Callback which is called when dialog is closed for any reason
         * (e.g. when another dialog is opened).
         */
        onClose: () => void;
    }): void {
        const {target, style, dialogType, content, holdSelection = false, onClose} = params;
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
            <Dialog {...style}
                target={target}
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

    startEditing(operation: DragEditOperation): void {
        const onFinishEditing = () => {
            this.view.setCanvasWidget('editLayer', null);
        };
        const editLayer = (
            <EditLayer operation={operation}
                onFinishEditing={onFinishEditing}
            />
        );
        this.view.setCanvasWidget('editLayer', {element: editLayer, attachment: 'overElements'});
    }

    showEditEntityForm(target: EntityElement): void {
        const {propertyEditor} = this.options;
        const onSubmit = (newData: ElementModel) => {
            this.hideDialog();
            this.editor.changeEntity(target.data.id, newData);
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

    showFindOrCreateEntityForm(params: {
        link: RelationLink;
        source: EntityElement;
        target: EntityElement;
        targetIsNew: boolean;
    }): void {
        const {link, source, target, targetIsNew} = params;
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
            style: {
                caption: 'Establish New Connection',
            },
            content,
            onClose: onCancel,
        });
    }

    showEditLinkForm(link: RelationLink): void {
        const source = (this.model.getElement(link.sourceId) as EntityElement).data;
        const target = (this.model.getElement(link.targetId) as EntityElement).data;
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
                        const newLink = link.withDirection(data);
                        this.showEditLinkForm(
                            this.editor.createRelation(newLink, {temporary: true})
                        );
                    }
                }}
                onApply={(data: LinkModel) => {
                    if (this.editor.temporaryState.links.has(link.data)) {
                        this.editor.removeTemporaryCells([link]);
                        const newLink = link.withDirection(data);
                        this.editor.createRelation(newLink);
                    } else {
                        this.editor.changeRelation(link.data, data);
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
            style: {
                defaultSize: {width: 300, height: 160},
                caption,
            },
            content,
            onClose: onCancel,
        });
    }

    showRenameLinkForm(link: Link): void {
        const defaultSize: Size = {width: 300, height: 145};
        const onFinish = () => this.hideDialog();
        this.showDialog({
            target: link,
            dialogType: 'renameLink',
            style: {
                defaultSize,
                caption: 'Rename Link',
                offset: {x: 25, y: - defaultSize.height / 2},
                calculatePosition: canvas => {
                    const bounds = canvas.renderingState.getLinkLabelBounds(link);
                    if (bounds) {
                        const {x, y, width, height} = bounds;
                        return {x: x + width, y: y + height / 2};
                    } else {
                        return undefined;
                    }
                },
            },
            content: (
                <RenameLinkForm link={link}
                    onFinish={onFinish}
                />
            ),
            onClose: onFinish,
        });
    }
}

interface OverlayTask {
    setError(error: unknown): void;
    end(): void;
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
