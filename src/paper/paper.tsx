import cx from 'clsx';
import * as React from 'react';

import { animateInterval, easeInOutBezier } from './animateInterval';
import {
    CanvasMetrics, CanvasPaneMetrics, CenterToOptions, ScaleOptions, ViewportOptions,
} from './paperApi';
import { Vector, Rect, Size, fitRectKeepingAspectRatio } from './baseGeometry';
import {
    PaperTransform, emptyPane, adjustPane, equalTransforms, paneFromPaperCoords, paperFromPaneCoords,
} from './paperLayers';

export interface PaperProps {
    className?: string;
    style?: React.CSSProperties;
    /** @default true */
    panOnTouch?: boolean;
    /** @default false */
    showScrollbars?: boolean;

    scaleDefaults: ScaleDefaults;
    viewportDefaults: Required<Pick<ViewportOptions, 'duration'>>;

    onChangeTransform?: (previous: PaperTransform) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    onDragOver?: (e: DragEvent, clientCoords: Vector) => boolean;
    onDragDrop?: (e: DragEvent, clientCoords: Vector) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    onKeyUp?: (e: React.KeyboardEvent) => void;
    onPointerOperation?: (e: React.PointerEvent) => PaperPointerOperation | undefined;
    onResize?: () => void;
    onScrollPassive?: (e: Event) => void;

    pageSize: Size;
    contentBounds: Rect;
    renderLayers: (transform: PaperTransform) => React.ReactNode;
    watermark?: React.ReactNode;
    children?: React.ReactNode;
}

export interface ScaleDefaults {
    min: number;
    max: number;
    maxFit: number;
    wheelToScaleDelta: (e: WheelEvent) => number | undefined;
}

export interface PaperPointerOperation {
    readonly action?: 'panning' | 'move' | undefined;
    hasSameTarget(e: React.UIEvent<HTMLElement>): boolean;
    onPointerDown(e: React.PointerEvent): void;
    onPointerMove(e: PointerEvent): void;
    onPointerUp(e: PointerEvent, options: { triggerAsClick: boolean }): void;
    onPointerCancel(e: PointerEvent | undefined): void;
}

interface State {
    readonly paneRef: React.RefObject<HTMLDivElement | null>;
    readonly contentBounds: Rect;
    readonly pageSize: Size;
    readonly transform: PaperTransform;
    readonly mounted: boolean;
}

interface PointerMoveState {
    readonly operation: PaperPointerOperation;
    pointers: Map<number, Vector>;
    pointerMoved: boolean;
    originPointerId: number;
    origin: {
        readonly pageX: number;
        readonly pageY: number;
    };
    panningOrigin: {
        readonly scrollLeft: number;
        readonly scrollTop: number;
    } | undefined;
    pinchOrigin: {
        readonly pointers: ReadonlyMap<number, Vector>;
        readonly metrics: CanvasMetrics;
    } | undefined;
}

interface ViewportState {
    /** Center of the viewport in paper coordinates. */
    readonly center: Vector;
    readonly scale: Vector;
}

interface ViewportAnimation {
    readonly from: ViewportState;
    readonly to: ViewportState;
    readonly cancellation: AbortController;
}

interface SnapshotBeforeUpdate {
    readonly scroll?: {
        readonly left: number;
        readonly top: number;
    };
}

const CLASS_NAME = 'reactodia-paper';

export class Paper extends React.Component<PaperProps, State> {
    private readonly rootRef = React.createRef<HTMLDivElement>();
    private readonly paneRef = React.createRef<HTMLDivElement>();

    private resizeObserver: ResizeObserver;
    private viewportAnimation: ViewportAnimation | undefined;
    private movingState: PointerMoveState | undefined;

    readonly metrics: CanvasMetrics;

    constructor(props: PaperProps) {
        super(props);
        this.state = {
            paneRef: this.paneRef,
            contentBounds: this.props.contentBounds,
            pageSize: this.props.pageSize,
            transform: emptyPane(this.props.pageSize),
            mounted: false,
        };
        this.resizeObserver = new ResizeObserver(this.onResize);
        this.metrics = new (class extends BasePaperMetrics {
            constructor(private readonly paper: Paper) {
                super();
            }
            get pane() {
                return this.paper.pane ?? EMPTY_PANE;
            }
            get transform(): PaperTransform {
                return this.paper.state.transform;
            }
            protected getClientRect(): PaneClientRect {
                return this.paper.pane?.getBoundingClientRect() ?? EMPTY_PANE_RECT;
            }
        })(this);
    }

    get root(): HTMLDivElement | null {
        return this.rootRef.current;
    }

    get pane(): HTMLDivElement | null {
        return this.paneRef.current;
    }

    render() {
        const {
            className, style, showScrollbars, panOnTouch = true,
            onContextMenu, onKeyDown, onKeyUp, renderLayers, watermark, children,
        } = this.props;
        const {transform, mounted} = this.state;
        const {width, height, scale, paddingX, paddingY} = transform;

        const scaledWidth = width * scale;
        const scaledHeight = height * scale;
        // using padding instead of margin in combination with setting width and height
        // on .paper element to avoid "over-constrained" margins, see an explanation here:
        // https://stackoverflow.com/questions/11695354
        const transformStyle: React.CSSProperties = {
            width: scaledWidth + paddingX,
            height: scaledHeight + paddingY,
            marginLeft: paddingX,
            marginTop: paddingY,
            paddingRight: paddingX,
            paddingBottom: paddingY,
        };

        return (
            <div ref={this.rootRef}
                className={cx(
                    CLASS_NAME,
                    className,
                    panOnTouch ? `${CLASS_NAME}--pan-on-touch` : undefined,
                    showScrollbars ? undefined : `${CLASS_NAME}--hide-scrollbars`
                )}
                style={style}
                tabIndex={0}
                onKeyDown={onKeyDown}
                onKeyUp={onKeyUp}>
                <div className={`${CLASS_NAME}__pane`}
                    ref={this.paneRef}
                    onPointerDown={this.onAreaPointerDown}>
                    <div className={`${CLASS_NAME}__layers`}
                        style={transformStyle}
                        onPointerDown={this.onPointerDown}
                        onContextMenu={onContextMenu}
                        onScrollCapture={this.onScrollCapture}>
                        {mounted ? renderLayers(transform) : null}
                    </div>
                    {watermark}
                </div>
                {mounted ? children : undefined}
            </div>
        );
    }

    componentDidMount() {
        const pane = this.pane!;

        pane.addEventListener('dragover', this.onDragOver);
        pane.addEventListener('drop', this.onDragDrop);
        pane.addEventListener('scroll', this.onScrollPassive, {passive: true});
        pane.addEventListener('wheel', this.onWheel, {passive: false});

        this.resizeObserver.observe(pane);
        this.setState({mounted: true});
    }

    static getDerivedStateFromProps(props: PaperProps, state: State): State | null {
        const pane = state.paneRef.current;
        if (pane && !(
            Rect.equals(props.contentBounds, state.contentBounds) &&
            props.pageSize.width === state.pageSize.width &&
            props.pageSize.height === state.pageSize.height
        )) {
            const {clientWidth, clientHeight} = pane;
            const paneClientSize: Size = {width: clientWidth, height: clientHeight};
            const adjusted = adjustPane(
                props.contentBounds,
                paneClientSize,
                props.pageSize,
                state.transform.scale
            );
            if (equalTransforms(state.transform, adjusted)) {
                return null;
            }
            return {
                ...state,
                contentBounds: props.contentBounds,
                pageSize: props.pageSize,
                transform: adjusted,
            };
        }
        return null;
    }

    getSnapshotBeforeUpdate(prevProps: PaperProps, prevState: State): SnapshotBeforeUpdate {
        const {contentBounds, pageSize} = this.props;
        const {paneRef, transform} = this.state;

        const pane = paneRef.current;
        const sameContent = (
            Rect.equals(contentBounds, prevProps.contentBounds) &&
            pageSize.width === prevProps.pageSize.width &&
            pageSize.height === prevProps.pageSize.height
        );

        let scroll: SnapshotBeforeUpdate['scroll'];

        if (pane && !sameContent && !equalTransforms(transform, prevState.transform)) {
            scroll = {
                left: pane.scrollLeft,
                top: pane.scrollTop,
            };
        }
        
        return {scroll};
    }

    componentDidUpdate(prevProps: PaperProps, prevState: State, snapshot: SnapshotBeforeUpdate) {
        const pane = this.state.paneRef.current;
        if (pane && snapshot.scroll) {
            const {scale, originX, originY, paddingX, paddingY} = this.state.transform;
            const prevTransform = prevState.transform;
            const scrollX = (originX - prevTransform.originX) * scale + (paddingX - prevTransform.paddingX);
            const scrollY = (originY - prevTransform.originY) * scale + (paddingY - prevTransform.paddingY);

            const scrollLeft = snapshot.scroll.left + scrollX;
            const scrollTop = snapshot.scroll.top + scrollY;

            pane.scrollLeft = scrollLeft;
            pane.scrollTop = scrollTop;
        }

        if (!equalTransforms(this.state.transform, prevState.transform)) {
            this.props.onChangeTransform?.(prevState.transform);
        }
    }

    componentWillUnmount() {
        const pane = this.pane!;
        this.stopListeningToPointerMove();
        pane.removeEventListener('dragover', this.onDragOver);
        pane.removeEventListener('drop', this.onDragDrop);
        pane.removeEventListener('scroll', this.onScrollPassive);
        pane.removeEventListener('wheel', this.onWheel);
        this.resizeObserver.disconnect();
    }

    private onAreaPointerDown = (e: React.PointerEvent) => {
        if (e.target === this.pane) {
            this.onPointerDown(e);
        }
    };

    private onPointerDown = (e: React.PointerEvent) => {
        if (this.movingState) {
            this.handleMultiPointerDown(e);
            return;
        }

        const operation = this.props.onPointerOperation?.(e);
        if (!operation) {
            return;
        }

        if (operation.action === 'move' || e.pointerType === 'mouse') {
            // keep default panning on touch
            e.preventDefault();
        }

        let panningOrigin: PointerMoveState['panningOrigin'];
        if (operation.action === 'panning') {
            const {scrollLeft, scrollTop} = this.pane!;
            panningOrigin = {scrollLeft, scrollTop};
            clearDocumentTextSelection();
        }

        const {pageX, pageY} = e;
        this.movingState = {
            operation,
            pointers: new Map(),
            pointerMoved: false,
            originPointerId: e.pointerId,
            origin: {pageX, pageY},
            panningOrigin,
            pinchOrigin: undefined,
        };
        this.handleMultiPointerDown(e);

        document.addEventListener('pointermove', this.onPointerMove);
        document.addEventListener('pointerup', this.onPointerUp);
        if (e.pointerType !== 'mouse') {
            document.addEventListener('pointercancel', this.onPointerCancel);
        }

        operation.onPointerDown(e);
    };

    private handleMultiPointerDown(e: PointerEvent | React.PointerEvent): void {
        if (!this.movingState) {
            return;
        }
        const {pointers} = this.movingState;
        pointers.set(e.pointerId, {x: e.pageX, y: e.pageY});
        if (!this.movingState.pinchOrigin && pointers.size === 2) {
            e.preventDefault();
            this.movingState.pinchOrigin = {
                pointers: new Map(pointers),
                metrics: this.metrics.snapshot(),
            };
        }
    }

    private onPointerMove = (e: PointerEvent) => {
        if (!this.movingState) {
            return;
        }

        const {origin, operation, panningOrigin} = this.movingState;
        const pageOffsetX = e.pageX - origin.pageX;
        const pageOffsetY = e.pageY - origin.pageY;
        if (e.isPrimary && Math.abs(pageOffsetX) >= 1 && Math.abs(pageOffsetY) >= 1) {
            this.movingState.pointerMoved = true;
        }

        if (this.handleMultiPointerMove(e)) {
            /* pinch zoom */
        } else {
            e.preventDefault();
            if (panningOrigin) {
                const pane = this.pane!;
                pane.classList.add(`${CLASS_NAME}--panning`);
                pane.scrollLeft = panningOrigin.scrollLeft - pageOffsetX;
                pane.scrollTop = panningOrigin.scrollTop - pageOffsetY;
            }
            operation.onPointerMove(e);
        }
    };

    private handleMultiPointerMove(e: PointerEvent): boolean {
        if (!this.movingState) {
            return false;
        }

        const {pointers, pinchOrigin} = this.movingState;
        pointers.set(e.pointerId, {x: e.pageX, y: e.pageY});
        if (!pinchOrigin) {
            return false;
        }
        const [
            [pointerA, originA],
            [pointerB, originB],
        ] = pinchOrigin.pointers;
        const lastA = pointers.get(pointerA);
        const lastB = pointers.get(pointerB);
        if (!(lastA && lastB)) {
            return false;
        }

        const last = Vector.scale(Vector.add(lastA, lastB), 0.5);
        const origin = Vector.scale(Vector.add(originA, originB), 0.5);

        const scaleMultiplier = (
            Vector.length(Vector.subtract(lastB, lastA)) /
            Math.max(Vector.length(Vector.subtract(originB, originA)), 1)
        );

        const originMetrics = pinchOrigin.metrics;
        const centerPaper = originMetrics.clientToPaperCoords(
            originMetrics.pane.clientWidth / 2,
            originMetrics.pane.clientHeight / 2
        );
        const lastPaper = originMetrics.pageToPaperCoords(last.x, last.y);
        const originPaper = originMetrics.pageToPaperCoords(origin.x, origin.y);
        const movedCenter = Vector.add(
            originPaper,
            Vector.scale(Vector.subtract(centerPaper, lastPaper), 1 / scaleMultiplier)
        );

        const scale = originMetrics.transform.scale * scaleMultiplier;
        void this.centerViewport(movedCenter, {scale});
        return true;
    }

    private onPointerUp = (e: PointerEvent) => {
        if (this.movingState) {
            const {originPointerId, pointers, pinchOrigin} = this.movingState;
            pointers.delete(e.pointerId);
            if (
                e.pointerId === originPointerId ||
                pinchOrigin && pointers.size < 2
            ) {
                this.stopListeningToPointerMove(e);
            }
        }
    };

    private onPointerCancel = (e: PointerEvent) => {
        this.stopListeningToPointerMove();
    };

    private onScrollCapture = (e: React.UIEvent<HTMLElement>) => {
        if (this.movingState?.operation.hasSameTarget(e)) {
            // Prevent element move when interacting with nested scrollbars
            this.stopListeningToPointerMove();
        }
    };

    private stopListeningToPointerMove = (e?: PointerEvent) => {
        const movingState = this.movingState;
        this.movingState = undefined;

        if (movingState) {
            this.pane!.classList.remove(`${CLASS_NAME}--panning`);
            document.removeEventListener('pointermove', this.onPointerMove);
            document.removeEventListener('pointerup', this.onPointerUp);
            document.removeEventListener('pointercancel', this.onPointerCancel);

            const {operation, pointerMoved, pinchOrigin} = movingState;
            if (e && !pinchOrigin) {
                operation.onPointerUp(e, {triggerAsClick: !pointerMoved});
            } else {
                operation.onPointerCancel(e);
            }
        }
    };

    private onWheel = (e: WheelEvent) => {
        const {wheelToScaleDelta} = this.props.scaleDefaults;
        const scaleDelta = wheelToScaleDelta(e);
        if (scaleDelta !== undefined) {
            e.preventDefault();
            const pivot = this.metrics.pageToPaperCoords(e.pageX, e.pageY);
            void this.setScale(this.scale + scaleDelta, {pivot});
        }
    };

    private onResize: ResizeObserverCallback = () => {
        this.props.onResize?.();
    };

    centerViewport(paperPosition: Vector, options: CenterToOptions) {
        if (typeof options.scale === 'number') {
            const {min, max} = this.props.scaleDefaults;
            let scale = options.scale;
            scale = Math.max(scale, min);
            scale = Math.min(scale, max);
            const viewportState: Partial<ViewportState> = {
                center: paperPosition,
                scale: {x: scale, y: scale},
            };
            return this.setViewportState(viewportState, options);
        } else {
            const viewportState: Partial<ViewportState> = {
                center: paperPosition,
            };
            return this.setViewportState(viewportState, options);
        }
    }

    get scale(): number {
        return this.state.transform.scale;
    }

    setScale(value: number, options?: ScaleOptions): Promise<void> {
        let scale = value;

        const {min, max} = this.props.scaleDefaults;
        scale = Math.max(scale, min);
        scale = Math.min(scale, max);

        let viewportState: Partial<ViewportState>;
        if (options && options.pivot) {
            const {x, y} = options.pivot;
            const pane = this.pane!;
            const paperCenter = this.metrics.clientToPaperCoords(
                pane.clientWidth / 2,
                pane.clientHeight / 2
            );
            const previousScale = this.state.transform.scale;
            const scaledBy = scale / previousScale;
            viewportState = {
                center: {
                    x: x - (x - paperCenter.x) / scaledBy,
                    y: y - (y - paperCenter.y) / scaledBy,
                },
                scale: {x: scale, y: scale},
            };
        } else {
            viewportState = {
                scale: {x: scale, y: scale},
            };
        }
        return this.setViewportState(viewportState, options);
    }

    scaleToFitRect(
        paperRect: Rect, options: ViewportOptions = {},
    ): Promise<void> {
        const {clientWidth, clientHeight} = this.pane!;

        if (paperRect.width === 0) {
            return Promise.resolve();
        }

        const {min, maxFit} = this.props.scaleDefaults;
        const {width} = fitRectKeepingAspectRatio(paperRect, clientWidth, clientHeight);

        let scale = width / paperRect.width;
        scale = Math.max(scale, min);
        scale = Math.min(scale, maxFit);

        const center = {
            x: paperRect.x + paperRect.width / 2,
            y: paperRect.y + paperRect.height / 2,
        };

        const viewPortState: ViewportState = {
            center,
            scale: {x: scale, y: scale},
        };

        return this.setViewportState(viewPortState, options);
    }

    private onDragOver = (e: DragEvent) => {
        const clientCoords = clientCoordsFor(this.pane!, e);
        const allowDrop = this.props.onDragOver?.(e, clientCoords);
        if (allowDrop) {
            // Allow to drop
            e.preventDefault();
        } else if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'none';
        }
    };

    private onDragDrop = (e: DragEvent) => {
        const clientCoords = clientCoordsFor(this.pane!, e);
        this.props.onDragDrop?.(e, clientCoords);
    };

    private onScrollPassive = (e: Event) => {
        this.props.onScrollPassive?.(e);
    };

    private get viewportState(): ViewportState {
        const pane = this.pane!;
        const {clientWidth, clientHeight, scrollLeft, scrollTop} = pane;
        const {originX, originY, paddingX, paddingY, scale} = this.state.transform;

        const scrollCenterX = scrollLeft + clientWidth / 2 - paddingX;
        const scrollCenterY = scrollTop + clientHeight / 2 - paddingY;
        const paperCenter = {
            x: scrollCenterX / scale - originX,
            y: scrollCenterY / scale - originY,
        };

        return {
            center: paperCenter,
            scale: {x: scale, y: scale},
        };
    }

    private setViewportState(state: Partial<ViewportState>, options?: ViewportOptions): Promise<void> {
        if (this.viewportAnimation) {
            this.viewportAnimation.cancellation.abort();
        }
        const from = this.viewportState;
        const to = {...from, ...state};
        const animate = options && (options.animate || options.duration && options.duration > 0);
        if (animate) {
            const viewportAnimation: ViewportAnimation = {
                from, to, cancellation: new AbortController(),
            };
            const durationMs = typeof options.duration === 'number'
                ? options.duration : this.props.viewportDefaults.duration;

            const awaitPromise = animateInterval(durationMs, progress => {
                const t = easeInOutBezier(progress);
                const computed: ViewportState = {
                    center: {
                        x: from.center.x + (to.center.x - from.center.x) * t,
                        y: from.center.y + (to.center.y - from.center.y) * t,
                    },
                    scale: {
                        x: from.scale.x + (to.scale.x - from.scale.x) * t,
                        y: from.scale.y + (to.scale.y - from.scale.y) * t,
                    },
                };
                this.applyViewportState(computed);
            }, viewportAnimation.cancellation.signal);

            this.viewportAnimation = viewportAnimation;
            return awaitPromise.then(() => {
                this.viewportAnimation = undefined;
            });
        } else {
            this.applyViewportState(to);
            return Promise.resolve();
        }
    }

    private applyViewportState(targetState: ViewportState) {
        let previous = this.state.transform;
        const scale = targetState.scale.x;
        const paperCenter = targetState.center;

        this.setState(
            state => {
                previous = state.transform;
                return {
                    transform: {...state.transform, scale},
                };
            }, () => {
                const pane = this.pane!;
                const {originX, originY, paddingX, paddingY} = this.state.transform;
                const scrollCenterX = (paperCenter.x + originX) * scale;
                const scrollCenterY = (paperCenter.y + originY) * scale;
                const {clientWidth, clientHeight} = pane;

                pane.scrollLeft = scrollCenterX - clientWidth / 2 + paddingX;
                pane.scrollTop = scrollCenterY - clientHeight / 2 + paddingY;
            }
        );
    }
}

abstract class BasePaperMetrics implements CanvasMetrics {
    abstract get pane(): CanvasPaneMetrics;
    abstract get transform(): PaperTransform;

    protected abstract getClientRect(): PaneClientRect;

    /** @deprecated */
    get area(): CanvasPaneMetrics {
        return this.pane;
    }

    snapshot(): CanvasMetrics {
        const {
            clientWidth, clientHeight, offsetWidth, offsetHeight, scrollLeft, scrollTop,
        } = this.pane;
        const {left, right, top, bottom} = this.getClientRect();
        return new SnapshotPaperMetrics(
            {clientWidth, clientHeight, offsetWidth, offsetHeight, scrollLeft, scrollTop},
            {left, right, top, bottom},
            this.transform
        );
    }

    /** @deprecated */
    getTransform(): PaperTransform {
        return this.transform;
    }

    getPaperSize(): Size {
        const {width, height, scale} = this.transform;
        return {width: width / scale, height: height / scale};
    }

    getViewportPageRect(): Rect {
        const {left, right, top, bottom} = this.getClientRect();
        return {
            x: left + window.scrollX,
            y: top + window.scrollY,
            width: right - left,
            height: bottom - top,
        };
    }

    pageToPaperCoords(pageX: number, pageY: number): Vector {
        const {left, top} = this.getClientRect();
        return this.clientToPaperCoords(
            pageX - (left + window.scrollX),
            pageY - (top + window.scrollY),
        );
    }

    paperToPageCoords(paperX: number, paperY: number): Vector {
        const {x: paneX, y: paneY} = this.paperToScrollablePaneCoords(paperX, paperY);
        const {x: clientX, y: clientY} = this.scrollablePaneToClientCoords(paneX, paneY);
        const {left, top} = this.getClientRect();
        return {
            x: clientX + (left + window.scrollX),
            y: clientY + (top + window.scrollY),
        };
    }

    clientToPaperCoords(areaClientX: number, areaClientY: number): Vector {
        const {x: paneX, y: paneY} = this.clientToScrollablePaneCoords(areaClientX, areaClientY);
        return this.scrollablePaneToPaperCoords(paneX, paneY);
    }

    clientToScrollablePaneCoords(areaClientX: number, areaClientY: number): Vector {
        const {paddingX, paddingY} = this.transform;
        const {scrollLeft, scrollTop} = this.pane;
        const paneX = areaClientX + scrollLeft - paddingX;
        const paneY = areaClientY + scrollTop - paddingY;
        return {x: paneX, y: paneY};
    }

    scrollablePaneToClientCoords(paneX: number, paneY: number): Vector {
        const {paddingX, paddingY} = this.transform;
        const {scrollLeft, scrollTop} = this.pane;
        const areaClientX = paneX - scrollLeft + paddingX;
        const areaClientY = paneY - scrollTop + paddingY;
        return {x: areaClientX, y: areaClientY};
    }

    scrollablePaneToPaperCoords(paneX: number, paneY: number): Vector {
        return paperFromPaneCoords({x: paneX, y: paneY}, this.transform);
    }

    paperToScrollablePaneCoords(paperX: number, paperY: number): Vector {
        return paneFromPaperCoords({x: paperX, y: paperY}, this.transform);
    }
}

class SnapshotPaperMetrics extends BasePaperMetrics {
    constructor(
        readonly pane: CanvasPaneMetrics,
        private readonly clientRect: PaneClientRect,
        readonly transform: PaperTransform
    ) {
        super();
    }

    protected getClientRect(): PaneClientRect {
        return this.clientRect;
    }

    snapshot(): CanvasMetrics {
        return this;
    }
}

interface PaneClientRect {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
}

const EMPTY_PANE: CanvasPaneMetrics = {
    clientWidth: 0,
    clientHeight: 0,
    offsetWidth: 0,
    offsetHeight: 0,
    scrollLeft: 0,
    scrollTop: 0,
};

const EMPTY_PANE_RECT: PaneClientRect = {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
};

function clientCoordsFor(container: HTMLElement, e: MouseEvent) {
    const target = (e.target instanceof SVGElement && e.target.ownerSVGElement !== null)
        ? e.target.ownerSVGElement : e.target as HTMLElement;
    const targetBox = target.getBoundingClientRect();
    const containerBox = container.getBoundingClientRect();
    return {
        x: e.offsetX + (targetBox.left - containerBox.left),
        y: e.offsetY + (targetBox.top - containerBox.top),
    };
}

/** Clears accidental text selection on the paper. */
function clearDocumentTextSelection() {
    if (document.getSelection) {
        const selection = document.getSelection();
        selection?.removeAllRanges?.();
    }
}

export function wheelToScaleDeltaDefault(e: WheelEvent, factor = 0.1): number {
    return -1 * Math.max(-1, Math.min(1, e.deltaY || e.deltaX)) * factor;
}
