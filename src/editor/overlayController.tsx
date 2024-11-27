import * as React from 'react';

import { delay } from '../coreUtils/async';
import { Events, EventObserver, EventSource, PropertyChange } from '../coreUtils/events';
import {
    useEventStore, useFrameDebouncedStore, useSyncStoreWithComparator,
} from '../coreUtils/hooks';

import { ElementModel, LinkModel } from '../data/model';

import { CanvasPointerUpEvent, useCanvas } from '../diagram/canvasApi';
import { Element, Link, LinkVertex } from '../diagram/elements';
import { Size, Vector } from '../diagram/geometry';
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

/** @hidden */
export interface OverlayControllerProps {
    readonly model: DataDiagramModel;
    readonly view: SharedCanvasState;
    readonly editor: EditorController;

    readonly propertyEditor: PropertyEditor | undefined;
}

/**
 * Provides custom editor for the entity data.
 */
export type PropertyEditor = (options: PropertyEditorOptions) => React.ReactElement;
/**
 * Parameters for `PropertyEditor`.
 */
export interface PropertyEditorOptions {
    /**
     * Target entity data to edit.
     */
    elementData: ElementModel;
    /**
     * Handler to submit changed entity data.
     *
     * Changed data may have a different entity IRI (`ElementModel.id`)
     * in case when the entity identity needs to be changed.
     */
    onSubmit: (newData: ElementModel) => void;
    /**
     * Handler to abort changing the entity, discarding the operation.
     */
    onCancel?: () => void;
}

/**
 * Event data for `OverlayController` events.
 *
 * @see OverlayController
 */
export interface OverlayControllerEvents {
    /**
     * Triggered on `openedDialog` property change.
     */
    changeOpenedDialog: PropertyChange<OverlayController, OpenedDialog | undefined>;
}

/** @hidden */
export type KnownDialogType =
    | 'connectionsMenu'
    | 'editEntity'
    | 'editLink'
    | 'findOrCreateEntity'
    | 'renameLink';

/**
 * Describes a dialog opened as an overlay for the canvas.
 */
export interface OpenedDialog {
    /**
     * Dialog target (anchor).
     */
    readonly target: Element | Link;
    /** @hidden */
    readonly knownType: KnownDialogType | undefined;
    /**
     * Whether the diagram should not change selection
     * while the dialog is opened.
     */
    readonly holdSelection: boolean;
    /**
     * Handler which will be called when dialog is closed.
     */
    readonly onClose: () => void;
}

/**
 * Controls UI overlays for the canvases, including dialogs and tasks.
 *
 * @category Core
 */
export class OverlayController {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<OverlayControllerEvents>();
    readonly events: Events<OverlayControllerEvents> = this.source;

    private readonly model: DataDiagramModel;
    private readonly view: SharedCanvasState;
    private readonly editor: EditorController;

    private readonly propertyEditor: PropertyEditor | undefined;
    private readonly authoringStateDecorator: ElementDecoratorResolver;

    private _openedDialog: OpenedDialog | undefined;
    private _tasks = new Set<ExtendedOverlayTask>();
    private _taskError: { error: unknown } | undefined;

    /** @hidden */
    constructor(props: OverlayControllerProps) {
        const {model, view, editor, propertyEditor} = props;
        this.model = model;
        this.view = view;
        this.editor = editor;

        this.propertyEditor = propertyEditor;

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

    /**
     * Currently open dialog.
     *
     * Returns `undefined` if no dialog is opened.
     */
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

    /**
     * Starts a new foreground task which blocks canvas interaction and
     * displays a loading indicator until the task has ended.
     *
     * If multiple tasks are started at any given time, an indicator will be shown
     * while at least one of them is still active.
     */
    startTask(params: {
        /**
         * Task title to display.
         */
        title?: string;
        /**
         * Delay in milliseconds before displaying loading indicator to avoid showing it
         * in case the task ends quickly.
         *
         * @default 0
         */
        delay?: number;
    } = {}): OverlayTask {
        const {title, delay: delayMs = 0} = params;

        if (this._tasks.size === 0 && this._taskError) {
            // Clear the error
            this._taskError = undefined;
        }

        const delayed = delayMs > 0 && this._tasks.size === 0;
        const createdTask: ExtendedOverlayTask = {
            title,
            setError: (error: unknown) => {
                this._taskError = {error};
            },
            end: () => {
                this._tasks.delete(createdTask);
                this.updateTaskSpinner();
            },
            [OverlayTaskActive]: !delayed,
        };
        this._tasks.add(createdTask);
        this.updateTaskSpinner();

        if (delayed) {
            delay(delayMs).then(() => {
                if (this._tasks.has(createdTask)) {
                    // Activate all tasks if any activates
                    for (const task of this._tasks) {
                        task[OverlayTaskActive] = true;
                    }
                    this.updateTaskSpinner();
                }
            });
        }

        return createdTask;
    }

    /**
     * Creates a task via `startTask()` for the operation defined by a Promise.
     *
     * @see startTask()
     */
    showSpinnerWhile(operation: Promise<unknown>): void {
        const task = this.startTask();
        (async () => {
            try {
                await operation;
            } catch (err) {
                console.error(err);
                task.setError(new Error('Unknown error occurred', {cause: err}));
            } finally {
                task.end();
            }
        })();
    }

    private updateTaskSpinner(): void {
        if (this._taskError) {
            const statusText = getErrorMessage(this._taskError.error);
            this.setSpinner({statusText, errorOccurred: true});
        } else {
            let hasActiveTask = false;
            let title: string | undefined;
            for (const task of this._tasks) {
                if (task[OverlayTaskActive]) {
                    hasActiveTask = true;
                }

                if (task.title) {
                    if (title === undefined) {
                        title = task.title;
                    } else {
                        title = 'Multiple tasks are in progress';
                        break;
                    }
                }
            }

            if (hasActiveTask) {
                this.setSpinner({statusText: title});
            } else {
                this.setSpinner(undefined);
            }
        }
    }

    private setSpinner(props: SpinnerProps | undefined) {
        this.view.setCanvasWidget('loadingWidget', props ? {
            element: <LoadingWidget spinnerProps={props} />,
            attachment: 'viewport',
        } : null);
    }

    /**
     * Shows on-canvas dialog anchored to the target element or link.
     *
     * @see hideDialog()
     */
    showDialog(params: {
        /**
         * Element or link to anchor dialog to.
         */
        target: Element | Link;
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
        /** @hidden */
        dialogType?: KnownDialogType;
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

    /**
     * Closes currently open dialog if any is active.
     *
     * @see showDialog()
     */
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
        const {propertyEditor} = this;
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

/**
 * Represents a foreground canvas task.
 */
export interface OverlayTask {
    /**
     * Task title to display.
     */
    readonly title: string | undefined;
    /**
     * Marks the task as failed with the specified error.
     *
     * If set, the error will be displayed until another task
     * will be started later.
     *
     * This method can be called multiple times and will not
     * complete the task (i.e. `end()` method call is required).
     */
    setError(error: unknown): void;
    /**
     * Completes the task and removes its representation from the overlay.
     *
     * If the task is marked with error via `setError()`, that error
     * will be kept displaying until another task is started later.
     */
    end(): void;
}

const OverlayTaskActive: unique symbol = Symbol('OverlayTask.active');

interface ExtendedOverlayTask extends OverlayTask {
    [OverlayTaskActive]: boolean;
}

function LoadingWidget(props: { spinnerProps: SpinnerProps }) {
    const {spinnerProps} = props;
    const size = useViewportSize();
    const position: Vector = {
        x: spinnerProps.statusText ? size.width / 3 : size.width / 2,
        y: size.height / 2,
    };
    return (
        <div className='reactodia-loading-widget'>
            <svg width={size.width} height={size.height}>
                <Spinner position={position} {...spinnerProps} />
            </svg>
        </div>
    );
}

function useViewportSize() {
    const {canvas} = useCanvas();
    const resizeStore = useFrameDebouncedStore(
        useEventStore(canvas.events, 'resize')
    );
    const size = useSyncStoreWithComparator(
        resizeStore,
        (): Size => {
            const {clientWidth, clientHeight} = canvas.metrics.area;
            return {width: clientWidth, height: clientHeight};
        },
        (a, b) => a.width === b.width && a.height === b.height
    );
    return size;
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

function getErrorMessage(error: unknown): string | undefined {
    if (error && typeof error === 'object' && 'message' in error) {
        const message = error.message;
        if (typeof message === 'string') {
            return message;
        }
    }
    return undefined;
}
