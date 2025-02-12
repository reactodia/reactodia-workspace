import * as React from 'react';

import { Debouncer } from '../coreUtils/scheduler';
import { EventObserver } from '../coreUtils/events';

import { CanvasApi, useCanvas } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';
import { Element } from '../diagram/elements';
import { Rect, Vector, boundsOf, getContentFittingBox } from '../diagram/geometry';
import {
    PaperTransform, totalPaneSize, paneTopLeft, paneFromPaperCoords, paperFromPaneCoords
} from '../diagram/paper';
import { type WorkspaceContext, useWorkspace } from '../workspace/workspaceContext';

import { DockDirection, ViewportDock } from './utility/viewportDock';

/**
 * Props for {@link Navigator} component.
 *
 * @see {@link Navigator}
 */
export interface NavigatorProps {
    /**
     * Dock direction on the canvas viewport.
     */
    dock: DockDirection;
    /**
     * Horizontal offset from the dock direction.
     *
     * @default 0
     */
    dockOffsetX?: number;
    /**
     * Vertical offset from the dock direction.
     *
     * @default 0
     */
    dockOffsetY?: number;
    /**
     * Whether the navigator should be initially expanded.
     *
     * If specified as `auto` the navigator will expand or collapse
     * when the canvas is resized depending on {@link autoCollapseFraction}
     * property until manually expanded or collapsed.
     *
     * @default "auto"
     */
    expanded?: boolean | 'auto';
    /**
     * Specifies a maximum allowed fraction of occupied canvas width or height
     * by the navigator before it will auto-collapse.
     *
     * Only applicable if {@link expanded} is set to `auto`.
     *
     * @default 0.4
     */
    autoCollapseFraction?: number;
    /**
     * Horizontal size of the navigator in px.
     * 
     * @default 300
     */
    width?: number;
    /**
     * Vertical size of the navigator in px.
     *
     * @default 160
     */
    height?: number;
    /**
     * Fraction of the diagram content size to add as padding to the minimap.
     *
     * @default 0.2
     */
    scalePadding?: number;
    /**
     * CSS color for the minimap underlying background.
     *
     * @default "#F5F5F5"
     */
    backgroundFill?: string;
    /**
     * CSS color for the scrollable pane background.
     *
     * @default "#F5F5F5"
     */
    scrollablePaneFill?: string;
    /**
     * CSS color for the viewport area background.
     *
     * @default "#FFFFFF"
     */
    viewportFill?: string;
    /**
     * Stroke style for the viewport area border.
     *
     * @default {color: "#EEEEEE", width: 2}
     */
    viewportStroke?: NavigatorStrokeStyle;
    /**
     * Stroke style for the viewport area overflow border
     * (displayed when the viewport is cutoff at the minimap border).
     *
     * @default {color: "#EEEEEE", width: 2, dash: [5, 5]}
     */
    overflowStroke?: NavigatorStrokeStyle;
}

/**
 * Stroke style for the lines drawn in the navigator.
 */
export interface NavigatorStrokeStyle {
    /**
     * Stroke color.
     *
     * @default "transparent"
     */
    readonly color?: string;
    /**
     * Stroke thickness in px.
     *
     * @default 1
     */
    readonly width?: number;
    /**
     * Stroke [dash array](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dasharray).
     *
     * @default []
     */
    readonly dash?: ReadonlyArray<number>;
}

/**
 * Canvas widget component to display a minimap of the diagram contents.
 *
 * @category Components
 */
export function Navigator(props: NavigatorProps) {
    const {canvas} = useCanvas();
    const workspace = useWorkspace();
    return (
        <NavigatorInner {...props}
            canvas={canvas}
            workspace={workspace}
        />
    );
}

interface NavigatorInnerProps extends NavigatorProps {
    canvas: CanvasApi;
    workspace: WorkspaceContext;
}

interface State {
    expanded: boolean;
    autoToggle: boolean;
    allowExpand: boolean;
}

interface NavigatorTransform {
    scale: number;
    canvasOffset: Vector;
    paneOffset: Vector;
}

const CLASS_NAME = 'reactodia-navigator';
const MIN_SCALE = 0.25;
const MAX_SIZE_FRACTION = 0.9;

const DEFAULT_EXPANDED: boolean | 'auto' = 'auto';
const DEFAULT_AUTO_COLLAPSE_FRACTION = 0.4;
const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 160;
const DEFAULT_SCALE_PADDING = 0.2;
const DEFAULT_BACKGROUND_FILL = '#F5F5F5';
const DEFAULT_SCROLLABLE_PANE_FILL = '#F5F5F5';
const DEFAULT_VIEWPORT_FILL = '#FFFFFF';
const DEFAULT_VIEWPORT_STROKE: NavigatorStrokeStyle = {
    color: '#EEEEEE',
    width: 2,
};
const DEFAULT_OVERFLOW_STROKE: NavigatorStrokeStyle = {
    color: '#EEEEEE',
    width: 2,
    dash: [5, 5],
};

class NavigatorInner extends React.Component<NavigatorInnerProps, State> {
    private readonly delayedRedraw = new Debouncer();
    private readonly delayedSizeCheck = new Debouncer();
    private readonly listener = new EventObserver();
    private canvas!: HTMLCanvasElement;

    private transform!: NavigatorTransform;
    private isDraggingViewport = false;

    constructor(props: NavigatorInnerProps) {
        super(props);
        const {expanded = DEFAULT_EXPANDED} = this.props;
        this.state = {
            expanded: Boolean(expanded),
            autoToggle: expanded === 'auto',
            allowExpand: true,
        };
    }

    componentDidMount() {
        const {canvas, workspace: {model}} = this.props;
        const {renderingState} = canvas;
        this.listener.listen(model.events, 'changeCells', this.scheduleRedraw);
        this.listener.listen(model.events, 'elementEvent', this.scheduleRedraw);
        this.listener.listen(canvas.events, 'pointerMove', this.scheduleRedraw);
        this.listener.listen(canvas.events, 'scroll', this.scheduleRedraw);
        this.listener.listen(canvas.events, 'resize', () => {
            this.delayedSizeCheck.call(this.onCheckSize);
        });
        this.listener.listen(renderingState.shared.events, 'changeHighlight', this.scheduleRedraw);
        this.listener.listen(renderingState.events, 'changeElementSize', this.scheduleRedraw);

        this.onCheckSize();
    }

    shouldComponentUpdate(nextProps: NavigatorProps, nextState: State) {
        return !(
            nextProps.dock === this.props.dock &&
            nextProps.dockOffsetX === this.props.dockOffsetX &&
            nextProps.dockOffsetY === this.props.dockOffsetY &&
            nextProps.width === this.props.width &&
            nextProps.height === this.props.height &&
            nextState === this.state
        );
    }

    componentWillUnmount() {
        this.delayedRedraw.dispose();
        this.delayedSizeCheck.dispose();
        this.listener.stopListening();
        this.stopDragViewport();
    }

    private scheduleRedraw = () => {
        if (this.state.expanded) {
            this.delayedRedraw.call(this.draw);
        }
    };

    private draw = () => {
        const {
            canvas,
            workspace: {model},
            width = DEFAULT_WIDTH,
            height = DEFAULT_HEIGHT,
            backgroundFill = DEFAULT_BACKGROUND_FILL,
            scrollablePaneFill = DEFAULT_SCROLLABLE_PANE_FILL,
        } = this.props;
        const pt = canvas.metrics.getTransform();

        this.calculateTransform(pt);

        const ctx = this.canvas.getContext('2d')!;
        ctx.fillStyle = backgroundFill;
        ctx.clearRect(0, 0, width, height);
        ctx.fillRect(0, 0, width, height);

        if (model.elements.length === 0) {
            // Avoid drawing empty scrollable pane
            return;
        }

        const paneStart = paneTopLeft(pt);
        const paneEnd = Vector.add(paneStart, totalPaneSize(pt));

        const start = canvasFromPaneCoords(paneStart, pt, this.transform);
        const end = canvasFromPaneCoords(paneEnd, pt, this.transform);
        ctx.fillStyle = scrollablePaneFill;
        ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);

        ctx.save();

        const {clientWidth, clientHeight} = canvas.metrics.area;
        const viewportStart = canvas.metrics.clientToScrollablePaneCoords(0, 0);
        const viewportEnd = canvas.metrics.clientToScrollablePaneCoords(clientWidth, clientHeight);

        const {x: x0, y: y0} = canvasFromPaneCoords(viewportStart, pt, this.transform);
        const {x: x1, y: y1} = canvasFromPaneCoords(viewportEnd, pt, this.transform);
        const viewportRect: Rect = {
            x: x0,
            y: y0,
            width: x1 - x0,
            height: y1 - y0,
        };

        this.fillViewport(ctx, viewportRect);
        this.drawElements(ctx, pt);
        this.strokeViewport(ctx, viewportRect);

        ctx.restore();
    };

    private drawElements(ctx: CanvasRenderingContext2D, pt: PaperTransform) {
        const {canvas, workspace: {model}} = this.props;
        model.elements.forEach(element => {
            const {x, y, width, height} = boundsOf(element, canvas.renderingState);
            ctx.fillStyle = this.chooseElementColor(element);

            const {x: x1, y: y1} = canvasFromPaperCoords({x, y}, pt, this.transform);
            const {x: x2, y: y2} = canvasFromPaperCoords({
                x: x + width,
                y: y + height,
            }, pt, this.transform);

            ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        });
    }

    private chooseElementColor(element: Element): string {
        const {canvas, workspace: {getElementStyle}} = this.props;
        const {highlighter} = canvas.renderingState.shared;
        const isBlurred = highlighter && !highlighter(element);
        if (isBlurred) {
            return 'lightgray';
        }
        const {color} = getElementStyle(element);
        return color;
    }

    private fillViewport(ctx: CanvasRenderingContext2D, viewportRect: Rect): void {
        const {
            viewportFill = DEFAULT_VIEWPORT_FILL
        } = this.props;

        ctx.fillStyle = viewportFill;
        ctx.fillRect(
            viewportRect.x,
            viewportRect.y,
            viewportRect.width,
            viewportRect.height
        );
    }

    private strokeViewport(ctx: CanvasRenderingContext2D, viewportRect: Rect): void {
        const {
            width = DEFAULT_WIDTH,
            height = DEFAULT_HEIGHT,
            viewportStroke = DEFAULT_VIEWPORT_STROKE,
            overflowStroke = DEFAULT_OVERFLOW_STROKE,
        } = this.props;

        const {x: x1, y: y1} = viewportRect;
        const x2 = x1 + viewportRect.width;
        const y2 = y1 + viewportRect.height;

        // draw visible viewport rectangle
        setCanvasStroke(ctx, viewportStroke);
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        // draw "out of area" viewport borders
        ctx.beginPath();
        if (x1 < 0) {
            const startX = ctx.lineWidth;
            ctx.moveTo(startX, y1);
            ctx.lineTo(startX, y2);
        }
        if (y1 < 0) {
            const startY = ctx.lineWidth;
            ctx.moveTo(x1, startY);
            ctx.lineTo(x2, startY);
        }
        if (x2 > width) {
            const endX = width - ctx.lineWidth;
            ctx.moveTo(endX, y1);
            ctx.lineTo(endX, y2);
        }
        if (y2 > height) {
            const endY = height - ctx.lineWidth;
            ctx.moveTo(x1, endY);
            ctx.lineTo(x2, endY);
        }

        setCanvasStroke(ctx, overflowStroke);
        ctx.stroke();
    }

    private calculateTransform(pt: PaperTransform) {
        const {
            canvas,
            workspace: {model},
            width = DEFAULT_WIDTH,
            height = DEFAULT_HEIGHT,
            scalePadding = DEFAULT_SCALE_PADDING,
        } = this.props;

        const box = getContentFittingBox(model.elements, model.links, canvas.renderingState);
        const displayPadding: Vector = {
            x: Math.max(box.width, width / MIN_SCALE) * scalePadding,
            y: Math.max(box.height, height / MIN_SCALE) * scalePadding,
        };
        const displayStart = paneFromPaperCoords({
            x: box.x - displayPadding.x,
            y: box.y - displayPadding.y,
        }, pt);
        const displayEnd = paneFromPaperCoords({
            x: box.x + box.width + displayPadding.x,
            y: box.y + box.height + displayPadding.y,
        }, pt);
        const displaySize: Vector = {
            x: displayEnd.x - displayStart.x,
            y: displayEnd.y - displayStart.y,
        };

        const scale = Math.min(width / displaySize.x, height / displaySize.y);
        const canvasOffset: Vector = {
            x: (width - displaySize.x * scale) / 2,
            y: (height - displaySize.y * scale) / 2,
        };
        this.transform = {scale, canvasOffset, paneOffset: displayStart};
    }

    private canvasFromPageCoords(pageX: number, pageY: number): Vector {
        const {top, left} = this.canvas.getBoundingClientRect();
        return {
            x: pageX - left - window.scrollX,
            y: pageY - top - window.scrollY,
        };
    }

    private onCheckSize = () => {
        const {
            canvas,
            autoCollapseFraction = DEFAULT_AUTO_COLLAPSE_FRACTION,
            width = DEFAULT_WIDTH,
            height = DEFAULT_HEIGHT,
        } = this.props;
        const {expanded, autoToggle, allowExpand} = this.state;
        const {clientWidth, clientHeight} = canvas.metrics.area;
        const strictExpanded = (
            width < clientWidth * MAX_SIZE_FRACTION &&
            height < clientHeight * MAX_SIZE_FRACTION
        );
        const autoExpanded = strictExpanded && (
            width < clientWidth * autoCollapseFraction &&
            height < clientHeight * autoCollapseFraction
        );
        if (autoToggle && expanded !== autoExpanded) {
            this.setState({
                expanded: autoExpanded,
                allowExpand: strictExpanded,
            }, this.scheduleRedraw);
        } else if (strictExpanded !== allowExpand) {
            this.setState({allowExpand: strictExpanded});
        }
    };

    render() {
        const {
            dock = 'se', dockOffsetX, dockOffsetY,
            width = DEFAULT_WIDTH,
            height = DEFAULT_HEIGHT,
            workspace: {translation: t}
        } = this.props;
        const {expanded, allowExpand} = this.state;
        const expandedWhenAllowed = expanded && allowExpand;
        return (
            <ViewportDock dock={dock}
                dockOffsetX={dockOffsetX}
                dockOffsetY={dockOffsetY}>
                <div className={`${CLASS_NAME} ${CLASS_NAME}--${expandedWhenAllowed ? 'expanded' : 'collapsed'}`}
                    style={expandedWhenAllowed ? {width, height} : undefined}>
                    <canvas ref={this.onCanvasMount}
                        width={width}
                        height={height}
                        onMouseDown={e => {
                            this.startDragViewport();
                            this.onDragViewport(e);
                        }}
                        onWheel={this.onWheel}
                    />
                    <button type='button'
                        className={`${CLASS_NAME}__toggle`}
                        title={
                            expanded
                                ? t.text('navigator.toggle_collapse.title')
                                : t.text('navigator.toggle_expand.title')
                        }
                        disabled={!allowExpand}
                        onClick={this.onToggleClick}>
                        <div className={`${CLASS_NAME}__toggle-icon`} />
                    </button>
                </div>
            </ViewportDock>
        );
    }

    private onCanvasMount = (canvas: HTMLCanvasElement | null) => {
        this.canvas = canvas!;
    };

    private startDragViewport() {
        if (!this.isDraggingViewport) {
            this.isDraggingViewport = true;
            document.addEventListener('mousemove', this.onDragViewport);
            document.addEventListener('mouseup', this.onMouseUp);
        }
    }

    private stopDragViewport() {
        if (this.isDraggingViewport) {
            this.isDraggingViewport = false;
            document.removeEventListener('mousemove', this.onDragViewport);
            document.removeEventListener('mouseup', this.onMouseUp);
        }
    }

    private onDragViewport = (e: MouseEvent | React.MouseEvent) => {
        e.preventDefault();
        if (this.isDraggingViewport) {
            const {canvas} = this.props;
            const canvasCoords = this.canvasFromPageCoords(e.pageX, e.pageY);
            const paperTransform = canvas.metrics.getTransform();
            const paperCoords = paperFromCanvasCoords(canvasCoords, paperTransform, this.transform);
            canvas.centerTo(paperCoords);
        }
    };

    private onMouseUp = () => {
        this.stopDragViewport();
    };

    private onWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const {canvas} = this.props;
        const delta = Math.max(-1, Math.min(1, e.deltaY || e.deltaX));
        canvas.zoomBy(-delta * 0.1);
    };

    private onToggleClick = () => {
        this.setState(
            state => ({expanded: !state.expanded, autoToggle: false}),
            this.scheduleRedraw
        );
    };
}

defineCanvasWidget(Navigator, element => ({element, attachment: 'viewport'}));

function setCanvasStroke(canvas: CanvasRenderingContext2D, stroke: NavigatorStrokeStyle): void {
    const {color = 'transparent', width = 1, dash = []} = stroke;
    canvas.strokeStyle = color;
    canvas.lineWidth = width;
    canvas.setLineDash(dash);
}

function canvasFromPaneCoords(pane: Vector, pt: PaperTransform, nt: NavigatorTransform): Vector {
    return {
        x: nt.canvasOffset.x + (pane.x - nt.paneOffset.x) * nt.scale,
        y: nt.canvasOffset.y + (pane.y - nt.paneOffset.y) * nt.scale,
    };
}

function canvasFromPaperCoords(paper: Vector, pt: PaperTransform, nt: NavigatorTransform): Vector {
    const pane = paneFromPaperCoords(paper, pt);
    return canvasFromPaneCoords(pane, pt, nt);
}

function paperFromCanvasCoords(canvas: Vector, pt: PaperTransform, nt: NavigatorTransform): Vector {
    const pane = {
        x: nt.paneOffset.x + (canvas.x - nt.canvasOffset.x) / nt.scale,
        y: nt.paneOffset.y + (canvas.y - nt.canvasOffset.y) / nt.scale,
    };
    return paperFromPaneCoords(pane, pt);
}
