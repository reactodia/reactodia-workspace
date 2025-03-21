import cx from 'clsx';
import * as React from 'react';

import { EventObserver, Unsubscribe } from '../coreUtils/events';

import { CanvasContext } from '../diagram/canvasApi';
import { Element, Link } from '../diagram/elements';
import {
    Rect, Size, Vector, boundsOf, computePolyline, computePolylineLength, getPointAlongPolyline,
} from '../diagram/geometry';

import { DraggableHandle } from './utility/draggableHandle';

export interface DialogProps extends DialogStyleProps {
    target?: DialogTarget;
    onHide: () => void;
    centered?: boolean;
    children: React.ReactNode;
}

/**
 * Dialog style, placement and sizing options.
 */
export interface DialogStyleProps {
    /**
     * Default size for the dialog.
     *
     * @default {width: 300, height: 320}
     */
    defaultSize?: Size;
    /**
     * Minimum size for the dialog when resizing.
     *
     * @default {width: 250, height: 250}
     */
    minSize?: Size;
    /**
     * Maximum size for the dialog when resizing.
     *
     * @default {width: 800, height: 800}
     */
    maxSize?: Size;
    /**
     * Allowed directions to resize the dialog:
     *  - `none` - disallow resize;
     *  - `x` - allow only horizontal resize;
     *  - `y` - allow only vertical resize;
     *  - `all` - allow both horizontal and vertical resize.
     *
     * @default "all"
     */
    resizableBy?: 'none' | 'x' | 'y' | 'all';
    /**
     * Dialog caption which is displayed in its header.
     */
    caption: string;
    /**
     * Whether the dialog should display a close button in the header.
     *
     * @default true
     */
    closable?: boolean;
    /**
     * Dock direction for the dialog from the {@link DialogProps.target target}
     * point of view:
     *  - `n`: north (top)
     *  - `e`: east (right)
     *  - `s`: south (bottom)
     *  - `w`: west (left)
     *
     * Only applicable if the {@link DialogProps.target target} is provided.
     *
     * @default "e"
     */
    dock?: 'n' | 'e' | 's' | 'w';
    /**
     * Margin between the dialog and the target.
     *
     * @default 40
     */
    dockMargin?: number;
}

interface State {
    width?: number;
    height?: number;
}

const CLASS_NAME = 'reactodia-dialog';

const DEFAULT_SIZE: Size = {width: 300, height: 320};
const MIN_SIZE: Size = {width: 250, height: 250};
const MAX_SIZE: Size = {width: 800, height: 800};

const DEFAULT_DOCK = 'e';
const DEFAULT_DOCK_MARGIN = 40;
const FOCUS_MARGIN = 20;

export class Dialog extends React.Component<DialogProps, State> {
    static contextType = CanvasContext;
    declare readonly context: CanvasContext;

    private unsubscribeFromTarget: Unsubscribe | undefined = undefined;
    private readonly handler = new EventObserver();

    private updateAll = () => this.forceUpdate();

    private startSize: Vector | undefined;

    constructor(props: DialogProps) {
        super(props);
        this.state = {};
    }

    componentDidMount() {
        this.listenToTarget(this.props.target);
        if (this.props.target) {
            this.focusOn();
        }
    }

    componentDidUpdate(prevProps: DialogProps) {
        if (this.props.target !== prevProps.target) {
            this.listenToTarget(this.props.target);
        }
    }

    componentWillUnmount() {
        this.listenToTarget(undefined);
    }

    private listenToTarget(target: DialogTarget | undefined) {
        if (this.unsubscribeFromTarget) {
            this.unsubscribeFromTarget();
            this.unsubscribeFromTarget = undefined;
        }

        if (target) {
            const {model} = this.context;

            const unsubscribeFromStore = target.subscribe(this.updateAll, this.context);
            this.handler.listen(model.events, 'changeLanguage', this.updateAll);

            this.unsubscribeFromTarget = () => {
                unsubscribeFromStore();
                this.handler.stopListening();
            };
        }
    }

    private calculatePosition(currentSize: Size): Vector | undefined {
        const {
            target,
            defaultSize = DEFAULT_SIZE,
            dock = DEFAULT_DOCK,
            dockMargin = DEFAULT_DOCK_MARGIN,
        } = this.props;
        const {canvas} = this.context;

        if (target) {
            const bounds = target.getBounds(this.context);
            const paneMin = canvas.metrics.paperToScrollablePaneCoords(bounds.x, bounds.y);
            const paneMax = canvas.metrics.paperToScrollablePaneCoords(
                bounds.x + bounds.width,
                bounds.y + bounds.height
            );
            return computeDockedPosition(
                paneMin,
                paneMax,
                dock,
                dockMargin,
                defaultSize,
                currentSize
            );
        }

        return undefined;
    }

    private getViewPortScrollablePoints(): {min: Vector; max: Vector} {
        const {canvas} = this.context;
        const {clientWidth, clientHeight} = canvas.metrics.area;
        const min = canvas.metrics.clientToScrollablePaneCoords(0, 0);
        const max = canvas.metrics.clientToScrollablePaneCoords(clientWidth, clientHeight);
        return {min, max};
    }

    private getDialogScrollableBounds(): { min: Vector; max: Vector } {
        const size = this.getCurrentSize();
        const {x, y} = this.calculatePosition(size) ?? {x: 0, y: 0};
        const min = {
            x: x - FOCUS_MARGIN,
            y: y - FOCUS_MARGIN,
        };
        const max = {
            x: min.x + size.width + FOCUS_MARGIN * 2,
            y: min.y + size.height + FOCUS_MARGIN * 2,
        };
        return {min, max};
    }

    private focusOn() {
        const {canvas} = this.context;
        const {min: viewPortMin, max: viewPortMax} = this.getViewPortScrollablePoints();
        const {min, max} = this.getDialogScrollableBounds();

        let xOffset = 0;
        if (min.x < viewPortMin.x) {
            xOffset = min.x - viewPortMin.x;
        } else if (max.x > viewPortMax.x) {
            xOffset = max.x - viewPortMax.x;
        }

        let yOffset = 0;
        if (min.y < viewPortMin.y) {
            yOffset = min.y - viewPortMin.y;
        } else if (max.y > viewPortMax.y) {
            yOffset = max.y - viewPortMax.y;
        }

        const curScrollableCenter = {
            x: viewPortMin.x + (viewPortMax.x - viewPortMin.x) / 2,
            y: viewPortMin.y + (viewPortMax.y - viewPortMin.y) / 2,
        };
        const newScrollableCenter = {
            x: curScrollableCenter.x + xOffset,
            y: curScrollableCenter.y + yOffset,
        };
        const paperCenter = canvas.metrics.scrollablePaneToPaperCoords(
            newScrollableCenter.x, newScrollableCenter.y,
        );
        canvas.centerTo(paperCenter);
    }

    private onStartDragging = (e: React.MouseEvent<HTMLDivElement>) => {
        const {defaultSize = DEFAULT_SIZE, maxSize = MAX_SIZE} = this.props;
        this.startSize = {
            x: Math.min(this.state.width || defaultSize.width, maxSize.width),
            y: Math.min(this.state.height || defaultSize.height, maxSize.height),
        };
    };

    private calculateHeight(height: number) {
        const {
            defaultSize = DEFAULT_SIZE,
            minSize = MIN_SIZE,
            maxSize = MAX_SIZE,
        } = this.props;
        const minHeight = Math.min(defaultSize.height, minSize.height);
        const maxHeight = Math.max(defaultSize.height, maxSize.height);
        return Math.max(minHeight, Math.min(maxHeight, height));
    }

    private calculateWidth(width: number) {
        const {
            defaultSize = DEFAULT_SIZE,
            minSize = MIN_SIZE,
            maxSize = MAX_SIZE
        } = this.props;
        const minWidth = Math.min(defaultSize.width, minSize.width);
        const maxWidth = Math.max(defaultSize.width, maxSize.width);
        return Math.max(minWidth, Math.min(maxWidth, width));
    }

    private onDragHandle = (e: MouseEvent, dx: number, dy: number) => {
        const {dock = DEFAULT_DOCK, centered} = this.props;
        let factorX = centered ? 2 : 1;
        let factorY = centered ? 2 : 1;
        switch (dock) {
            case 'n': {
                factorY *= -1;
                break;
            }
            case 'w': {
                factorX *= -1;
                break;
            }
        }
        const width = dx ? this.calculateWidth(this.startSize!.x + dx * factorX) : undefined;
        const height = dy ? this.calculateHeight(this.startSize!.y + dy * factorY) : undefined;
        this.setState(state => ({
            width: width ?? state.width,
            height: height ?? state.height,
        }));
    };

    render() {
        const {
            dock = DEFAULT_DOCK,
            caption,
            resizableBy = 'all',
            closable = true,
        } = this.props;

        const size = this.getCurrentSize();
        const position = this.calculatePosition(size);
        const style: React.CSSProperties = {
            left: position?.x,
            top: position?.y,
            width: size.width,
            height: size.height,
        };

        return (
            <div className={CLASS_NAME}
                role='dialog'
                aria-labelledby={caption ? 'reactodia-dialog-caption' : undefined}
                style={style}>
                <div className={`${CLASS_NAME}__header`}>
                    <div id='reactodia-dialog-caption'
                        className={`${CLASS_NAME}__caption`}
                        title={caption}>
                        {caption}
                    </div>
                    {closable ? (
                        <button title='Close'
                            className={cx(
                                'reactodia-btn',
                                `${CLASS_NAME}__close-button`
                            )}
                            onClick={this.onClose}
                        />
                    ) : null}
                </div>
                {this.props.children}
                {resizableBy === 'y' || resizableBy === 'all' ? (
                    <DraggableHandle
                        dock={dock === 'n' ? 'n' : 's'}
                        axis='y'
                        onBeginDragHandle={this.onStartDragging}
                        onDragHandle={this.onDragHandle}>
                    </DraggableHandle>
                ) : null}
                {resizableBy === 'x' || resizableBy === 'all' ? (
                    <DraggableHandle
                        dock={dock === 'w' ? 'w' : 'e'}
                        axis='x'
                        onBeginDragHandle={this.onStartDragging}
                        onDragHandle={this.onDragHandle}>
                    </DraggableHandle>
                ): null}
                {resizableBy === 'none' ? null : (
                    <DraggableHandle
                        dock={
                            dock === 'n' ? 'ne' :
                            dock === 'w' ? 'sw' :
                            'se'
                        }
                        axis={resizableBy}
                        onBeginDragHandle={this.onStartDragging}
                        onDragHandle={this.onDragHandle}>
                    </DraggableHandle>
                )}
            </div>
        );
    }

    private getCurrentSize(): Size {
        const {defaultSize = DEFAULT_SIZE, maxSize = MAX_SIZE} = this.props;
        return {
            width: Math.min(this.state.width ?? defaultSize.width, maxSize.width),
            height: Math.min(this.state.height ?? defaultSize.height, maxSize.height),
        };
    }

    private onClose = () => {
        const {canvas} = this.context;
        const {onHide} = this.props;
        canvas.focus();
        onHide();
    };
}

export interface DialogTarget {
    readonly subscribe: (onChange: () => void, context: CanvasContext) => () => void;
    readonly getBounds: (context: CanvasContext) => Rect;
}

export const DialogTarget = {
    forElement(element: Element): DialogTarget {
        return {
            subscribe: (onChange, { canvas }) => {
                const listener = new EventObserver();
                listener.listen(element.events, 'changePosition', onChange);
                listener.listen(canvas.renderingState.events, 'changeElementSize', e => {
                    if (e.source === element) {
                        onChange();
                    }
                });
                return () => listener.stopListening();
            },
            getBounds: ({ canvas }) => boundsOf(element, canvas.renderingState),
        };
    },
    forLink(link: Link): DialogTarget {
        return {
            subscribe: (onChange, { model, canvas }) => {
                const source = model.getElement(link.sourceId);
                const target = model.getElement(link.targetId);

                if (!source || !target) {
                    throw new Error('Source and target are not specified');
                }

                const listener = new EventObserver();
                listener.listen(source.events, 'changePosition', onChange);
                listener.listen(target.events, 'changePosition', onChange);
                listener.listen(canvas.renderingState.events, 'changeElementSize', e => {
                    if (e.source === source || e.source === target) {
                        onChange();
                    }
                });
                listener.listen(link.events, 'changeVertices', onChange);
                listener.listen(canvas.renderingState.events, 'changeLinkLabelBounds', e => {
                    if (e.source === link) {
                        onChange();
                    }
                });
                return () => listener.stopListening();
            },
            getBounds: ({ model, canvas }) => {
                const labelBounds = canvas.renderingState.getLinkLabelBounds(link);
                if (labelBounds) {
                    return labelBounds;
                }

                const source = model.getElement(link.sourceId);
                const target = model.getElement(link.targetId);

                if (!source || !target) {
                    throw new Error('Source and target are not specified');
                }

                const route = canvas.renderingState.getRouting(link.id);
                const verticesDefinedByUser = link.vertices || [];
                const vertices = route ? route.vertices : verticesDefinedByUser;
    
                const polyline = computePolyline(
                    canvas.renderingState.getElementShape(source),
                    canvas.renderingState.getElementShape(target),
                    vertices
                );
                const polylineLength = computePolylineLength(polyline);
                const {x, y} = getPointAlongPolyline(polyline, polylineLength / 2);

                return {x, y, width: 0, height: 0};
            },
        };
    },
} as const;

function computeDockedPosition(
    targetMin: Vector,
    targetMax: Vector,
    dock: 'n' | 'e' | 's' | 'w',
    dockMargin: number,
    defaultSize: Size,
    currentSize: Size
): Vector {
    let x: number;
    switch (dock) {
        case 'w': {
            x = targetMin.x - currentSize.width - dockMargin;
            break;
        }
        case 'e': {
            x = targetMax.x + dockMargin;
            break;
        }
        default: {
            x = (targetMin.x + targetMax.x - defaultSize.width) / 2;
            break;
        }
    }

    let y: number;
    switch (dock) {
        case 'n': {
            y = targetMin.y - currentSize.height - dockMargin;
            break;
        }
        case 's': {
            y = targetMax.y + dockMargin;
            break;
        }
        default: {
            y = (targetMin.y + targetMax.y - defaultSize.height) / 2;
            break;
        }
    }

    return {x, y};
}
