import * as React from 'react';

import { delay } from '../coreUtils/async';
import { Events, EventObserver, EventSource, PropertyChange } from '../coreUtils/events';
import {
    useEventStore, useFrameDebouncedStore, useSyncStoreWithComparator,
} from '../coreUtils/hooks';
import type { Translation } from '../coreUtils/i18n';

import { CanvasPointerUpEvent, useCanvas } from '../diagram/canvasApi';
import { Element, Link, LinkVertex } from '../diagram/elements';
import { Size, Vector } from '../diagram/geometry';
import { DiagramModel } from '../diagram/model';
import { SharedCanvasState } from '../diagram/sharedCanvasState';
import { Spinner, SpinnerProps } from '../diagram/spinner';

import { Dialog, DialogProps, DialogStyleProps } from '../widgets/dialog';

/** @hidden */
export interface OverlayControllerProps {
    readonly model: DiagramModel;
    readonly view: SharedCanvasState;
    readonly translation: Translation;
}

/**
 * Event data for {@link OverlayController} events.
 *
 * @see {@link OverlayController}
 */
export interface OverlayControllerEvents {
    /**
     * Triggered on {@link OverlayController.openedDialog} property change.
     */
    changeOpenedDialog: PropertyChange<OverlayController, OpenedDialog | undefined>;
}

/**
 * Describes a dialog opened as an overlay for the canvas.
 */
export interface OpenedDialog {
    /**
     * Dialog target (anchor).
     */
    readonly target?: Element | Link;
    /**
     * Well-known dialog type to check if a specific dialog is currently open.
     */
    readonly knownType: OverlayDialogType | undefined;
    /**
     * Whether the diagram should not change selection
     * while the dialog is opened.
     */
    readonly holdSelection: boolean;
    /**
     * Handler which will be called when dialog is closed.
     */
    readonly onClose: (() => void) | undefined;
}

/**
 * Nominal (branded) type for known overlay dialog type.
 *
 * @see {@link OpenedDialog.knownType}
 */
export type OverlayDialogType = string & { overlayDialogTypeBrand: void };

/**
 * Controls UI overlays for the canvases, including dialogs and tasks.
 *
 * @category Core
 */
export class OverlayController {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<OverlayControllerEvents>();
    readonly events: Events<OverlayControllerEvents> = this.source;

    private readonly model: DiagramModel;
    private readonly view: SharedCanvasState;
    private readonly translation: Translation;

    private _openedDialog: OpenedDialog | undefined;
    private _tasks = new Set<ExtendedOverlayTask>();
    private _taskError: { error: unknown } | undefined;

    /** @hidden */
    constructor(props: OverlayControllerProps) {
        const {model, view, translation} = props;
        this.model = model;
        this.view = view;
        this.translation = translation;

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
     * Creates a task via {@link startTask} for the operation defined by a `Promise`.
     *
     * @see {@link startTask}
     */
    showSpinnerWhile(operation: Promise<unknown>): void {
        const {translation: t} = this;
        const task = this.startTask();
        (async () => {
            try {
                await operation;
            } catch (err) {
                console.error(err);
                task.setError(new Error(
                    t.text('overlay_controller.unknown_error'),
                    {cause: err}
                ));
            } finally {
                task.end();
            }
        })();
    }

    private updateTaskSpinner(): void {
        const {translation: t} = this;
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
                        title = t.text('overlay_controller.multiple_tasks_in_progress');
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
     * @see {@link hideDialog}
     */
    showDialog(params: {
        /**
         * Element or link to anchor dialog to.
         */
        target?: Element | Link;
        /**
         * Dialog style, placement and sizing options.
         */
        style: DialogStyleProps;
        /**
         * Dialog content.
         */
        content: React.ReactElement<any>;
        /**
         * Well-known dialog type to check later if a specific dialog is currently open.
         */
        dialogType?: OverlayDialogType;
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
        onClose?: () => void;
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

        const onHide = () => this.hideDialog();
        if (target) {
            this.view.setCanvasWidget('dialog', {
                element: (
                    <Dialog {...style}
                        target={target}
                        onHide={onHide}>
                        {content}
                    </Dialog>
                ),
                attachment: 'overElements'
            });
        } else {
            this.view.setCanvasWidget('dialog', {
                element: (
                    <ViewportDialog {...style}
                        onHide={onHide}>
                        {content}
                    </ViewportDialog>
                ),
                attachment: 'viewport',
            });
        }
        
        this.source.trigger('changeOpenedDialog', {
            source: this,
            previous: previousDialog,
        });
    }

    /**
     * Closes currently open dialog if any is active.
     *
     * @see {@link showDialog}
     */
    hideDialog() {
        if (this._openedDialog) {
            const previous = this._openedDialog;
            this._openedDialog = undefined;
            previous.onClose?.();
            this.view.setCanvasWidget('dialog', null);
            this.source.trigger('changeOpenedDialog', {source: this, previous});
        }
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
     * complete the task (i.e. {@link end end()} method call is required).
     */
    setError(error: unknown): void;
    /**
     * Completes the task and removes its representation from the overlay.
     *
     * If the task is marked with error via {@link setError setError()}, that error
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

function ViewportDialog(props: DialogProps) {
    const {...dialogProps} = props;
    const viewportSize = useViewportSize();
    // TODO: somehow use --reactodia-viewport-dock-margin
    const margin = 10;
    const maxSize = React.useMemo(
        (): Size => ({
            width: viewportSize.width - margin * 2,
            height: viewportSize.height - margin * 2,
        }),
        [viewportSize, margin]
    );
    return (
        <div className='reactodia-viewport-dialog-overlay'>
            <Dialog {...dialogProps}
                centered={true}
                maxSize={maxSize}
            />
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
