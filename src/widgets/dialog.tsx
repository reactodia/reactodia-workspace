import cx from 'clsx';
import * as React from 'react';

import { EventObserver, Unsubscribe } from '../coreUtils/events';

import { CanvasApi, CanvasContext } from '../diagram/canvasApi';
import { Element, Link } from '../diagram/elements';
import {
    Size, Vector, boundsOf, computePolyline, computePolylineLength, getPointAlongPolyline,
} from '../diagram/geometry';

import { DraggableHandle } from '../workspace/draggableHandle';

export interface DialogProps extends DialogStyleProps {
    target?: Element | Link;
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
    offset?: Vector;
    calculatePosition?: (canvas: CanvasApi) => Vector | undefined;
}

interface State {
    width?: number;
    height?: number;
}

const CLASS_NAME = 'reactodia-dialog';

const DEFAULT_SIZE: Size = {width: 300, height: 320};
const MIN_SIZE: Size = {width: 250, height: 250};
const MAX_SIZE: Size = {width: 800, height: 800};

const ELEMENT_OFFSET = 40;
const LINK_OFFSET = 20;
const FOCUS_OFFSET = 20;

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

    private listenToTarget(target?: Element | Link) {
        if (this.unsubscribeFromTarget) {
            this.unsubscribeFromTarget();
            this.unsubscribeFromTarget = undefined;
        }

        if (target) {
            const {model} = this.context;

            if (target instanceof Element) {
                this.listenToElement(target);
            } else if (target instanceof Link) {
                this.listenToLink(target);
            }

            this.handler.listen(model.events, 'changeLanguage', this.updateAll);

            this.unsubscribeFromTarget = () => { this.handler.stopListening(); };
        }
    }

    private listenToElement(element: Element) {
        const {canvas} = this.context;
        this.handler.listen(element.events, 'changePosition', this.updateAll);
        this.handler.listen(canvas.renderingState.events, 'changeElementSize', e => {
            if (e.source === element) {
                this.updateAll();
            }
        });
    }

    private listenToLink(link: Link) {
        const {canvas, model} = this.context;

        const source = model.getElement(link.sourceId)!;
        const target = model.getElement(link.targetId)!;

        this.listenToElement(source);
        this.listenToElement(target);

        this.handler.listen(link.events, 'changeVertices', this.updateAll);
        this.handler.listen(canvas.renderingState.events, 'changeLinkLabelBounds', e => {
            if (e.source === link) {
                this.updateAll();
            }
        });
    }

    private calculatePositionForElement(element: Element): Vector {
        const {defaultSize = DEFAULT_SIZE} = this.props;
        const {canvas} = this.context;

        const bbox = boundsOf(element, canvas.renderingState);
        const {y: y0} = canvas.metrics.paperToScrollablePaneCoords(bbox.x, bbox.y);
        const {x: x1, y: y1} = canvas.metrics.paperToScrollablePaneCoords(
            bbox.x + bbox.width,
            bbox.y + bbox.height,
        );

        return {
            x: x1 + ELEMENT_OFFSET,
            y: (y0 + y1) / 2 - (defaultSize.height / 2),
        };
    }

    private calculatePositionForLink(link: Link): Vector {
        const {canvas, model} = this.context;

        const source = model.getElement(link.sourceId);
        const target = model.getElement(link.targetId);

        if (!source || !target) {
            throw new Error('Source and target are not specified');
        }

        const route = canvas.renderingState.getRouting(link.id);
        const verticesDefinedByUser = link.vertices || [];
        const vertices = route ? route.vertices : verticesDefinedByUser;

        const polyline = computePolyline(
            boundsOf(source, canvas.renderingState),
            boundsOf(target, canvas.renderingState),
            vertices
        );
        const polylineLength = computePolylineLength(polyline);
        const targetPoint = getPointAlongPolyline(polyline, polylineLength / 2);

        const {x, y} = canvas.metrics.paperToScrollablePaneCoords(targetPoint.x, targetPoint.y);

        return {y: y + LINK_OFFSET, x: x + LINK_OFFSET};
    }

    private calculatePosition(): Vector | undefined {
        const {target, offset = {x: 0, y: 0}, calculatePosition} = this.props;
        const {canvas} = this.context;

        if (calculatePosition) {
            const position = calculatePosition(canvas);
            if (position) {
                const {x, y} = canvas.metrics.paperToScrollablePaneCoords(position.x, position.y);
                return {x: x + offset.x, y: y + offset.y};
            }
        }

        if (target instanceof Element) {
            return this.calculatePositionForElement(target);
        } else if (target instanceof Link) {
            return this.calculatePositionForLink(target);
        } else {
            return undefined;
        }
    }

    private getViewPortScrollablePoints(): {min: Vector; max: Vector} {
        const {canvas} = this.context;
        const {clientWidth, clientHeight} = canvas.metrics.area;
        const min = canvas.metrics.clientToScrollablePaneCoords(0, 0);
        const max = canvas.metrics.clientToScrollablePaneCoords(clientWidth, clientHeight);
        return {min, max};
    }

    private getDialogScrollablePoints(): {min: Vector; max: Vector} {
        const {defaultSize = DEFAULT_SIZE} = this.props;
        const {x, y} = this.calculatePosition() ?? {x: 0, y: 0};
        const min = {
            x: x - FOCUS_OFFSET,
            y: y - FOCUS_OFFSET,
        };
        const max = {
            x: min.x + defaultSize.width + FOCUS_OFFSET * 2,
            y: min.y + defaultSize.height + FOCUS_OFFSET * 2,
        };
        return {min, max};
    }

    private focusOn() {
        const {canvas} = this.context;
        const {min: viewPortMin, max: viewPortMax} = this.getViewPortScrollablePoints();
        const {min, max} = this.getDialogScrollablePoints();

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
        const factor = this.props.centered ? 2 : 1;
        const width = dx ? this.calculateWidth(this.startSize!.x + dx * factor) : undefined;
        const height = dy ? this.calculateHeight(this.startSize!.y + dy * factor) : undefined;
        this.setState(state => ({
            width: width ?? state.width,
            height: height ?? state.height,
        }));
    };

    render() {
        const {
            defaultSize = DEFAULT_SIZE,
            maxSize = MAX_SIZE,
            caption,
            onHide,
            resizableBy = 'all',
            closable = true,
        } = this.props;
        const position = this.calculatePosition();
        const width = this.state.width ?? defaultSize.width;
        const height = this.state.height ?? defaultSize.height;
        const style: React.CSSProperties = {
            left: position?.x,
            top: position?.y,
            width: Math.min(width, maxSize.width),
            height: Math.min(height, maxSize.height),
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
                            onClick={onHide}
                        />
                    ) : null}
                </div>
                {this.props.children}
                {resizableBy === 'y' || resizableBy === 'all' ? (
                    <DraggableHandle
                        className={`${CLASS_NAME}__bottom-handle`}
                        axis='y'
                        onBeginDragHandle={this.onStartDragging}
                        onDragHandle={this.onDragHandle}>
                    </DraggableHandle>
                ) : null}
                {resizableBy === 'x' || resizableBy === 'all' ? (
                    <DraggableHandle
                        className={`${CLASS_NAME}__right-handle`}
                        axis='x'
                        onBeginDragHandle={this.onStartDragging}
                        onDragHandle={this.onDragHandle}>
                    </DraggableHandle>
                ): null}
                {resizableBy === 'none' ? null : (
                    <DraggableHandle
                        className={`${CLASS_NAME}__bottom-right-handle`}
                        axis={resizableBy}
                        onBeginDragHandle={this.onStartDragging}
                        onDragHandle={this.onDragHandle}>
                    </DraggableHandle>
                )}
            </div>
        );
    }
}
