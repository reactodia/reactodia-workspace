import * as React from 'react';
import classnames from 'classnames';

import { delay } from '../coreUtils/async';
import { EventObserver, Events, EventSource } from '../coreUtils/events';
import { Debouncer, animateInterval, easeInOutBezier } from '../coreUtils/scheduler';

import {
    CanvasContext, CanvasApi, CanvasEvents, CanvasMetrics, CanvasAreaMetrics,
    CanvasDropEvent, CenterToOptions, ScaleOptions, ViewportOptions, CanvasWidgetDescription,
    CanvasPointerMode, ZoomOptions, ExportSvgOptions, ExportRasterOptions,
} from './canvasApi';
import { extractCanvasWidget } from './canvasWidget';
import { RestoreGeometry } from './commands';
import { Element, Link, Cell, LinkVertex } from './elements';
import {
    Vector, Rect, boundsOf, computePolyline, findNearestSegmentIndex, getContentFittingBox,
} from './geometry';
import { DiagramModel } from './model';
import { CommandBatch } from './history';
import { Paper, PaperTransform } from './paper';
import { MutableRenderingState, RenderingLayer } from './renderingState';
import {
    ToSVGOptions, toSVG, toDataURL, fitRectKeepingAspectRatio,
} from './toSvg';

export interface PaperAreaProps {
    model: DiagramModel;
    renderingState: MutableRenderingState;
    zoomOptions?: ZoomOptions;
    hideScrollBars?: boolean;
    watermarkSvg?: string;
    watermarkUrl?: string;
    children?: React.ReactNode;
}

interface State {
    readonly width: number;
    readonly height: number;
    readonly originX: number;
    readonly originY: number;
    readonly scale: number;
    readonly paddingX: number;
    readonly paddingY: number;
}

interface PointerMoveState {
    pointers: Map<number, Vector>;
    pointerMoved: boolean;
    target: Cell | undefined;
    batch: CommandBatch;
    restoreGeometry: RestoreGeometry;
    originPointerId: number;
    origin: {
        readonly pageX: number;
        readonly pageY: number;
    };
    panningOrigin: {
        readonly scrollLeft: number;
        readonly scrollTop: number;
    } | undefined;
    movingElementOrigin: {
        readonly pointerX: number;
        readonly pointerY: number;
        readonly elementX: number;
        readonly elementY: number;
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

const CLASS_NAME = 'reactodia-paper-area';
const DEFAULT_ANIMATION_DURATION = 500;
const LEFT_MOUSE_BUTTON = 0;

export class PaperArea extends React.Component<PaperAreaProps, State> implements CanvasApi {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<CanvasEvents>();
    readonly events: Events<CanvasEvents> = this.source;

    private area!: HTMLDivElement;
    private readonly svgCanvasRef = React.createRef<SVGSVGElement>();

    private readonly pageSize = {x: 1500, y: 800};
    private readonly canvasContext: CanvasContext;

    private viewportAnimation: ViewportAnimation | undefined;
    private cssAnimations = 0;

    private movingState: PointerMoveState | undefined;

    private delayedPaperAdjust = new Debouncer();
    private scrollBeforeUpdate: undefined | {
        left: number;
        top: number;
    };

    private _pointerMode: CanvasPointerMode = 'panning';
    private readonly _zoomOptions: Required<ZoomOptions>;

    private resizeObserver: ResizeObserver;

    readonly metrics: CanvasMetrics;

    constructor(props: PaperAreaProps, context: any) {
        super(props, context);
        const {zoomOptions = {}} = this.props;
        this.state = {
            width: this.pageSize.x,
            height: this.pageSize.y,
            originX: 0,
            originY: 0,
            scale: 1,
            paddingX: 0,
            paddingY: 0,
        };
        this.resizeObserver = new ResizeObserver(this.onResize);
        this.metrics = new (class extends BasePaperMetrics {
            constructor(private readonly paperArea: PaperArea) {
                super();
            }
            get area() {
                return this.paperArea.area;
            }
            get transform(): PaperTransform {
                const {width, height, originX, originY, scale, paddingX, paddingY} = this.paperArea.state;
                return {width, height, originX, originY, scale, paddingX, paddingY};
            }
            protected getClientRect(): AreaClientRect {
                return this.paperArea.area.getBoundingClientRect();
            }
        })(this);
        this.canvasContext = {
            canvas: this,
            model: props.model,
        };
        this._zoomOptions = {
            min: zoomOptions.min ?? 0.2,
            max: zoomOptions.max ?? 2,
            maxFit: zoomOptions.maxFit ?? 1,
            step: zoomOptions.step ?? 0.1,
            fitPadding: zoomOptions.fitPadding ?? 20,
            requireCtrl: zoomOptions.requireCtrl ?? true,
        };
    }

    get renderingState(): MutableRenderingState {
        return this.props.renderingState;
    }

    get pointerMode(): CanvasPointerMode {
        return this._pointerMode;
    }

    setPointerMode(value: CanvasPointerMode): void {
        const previous = this._pointerMode;
        if (previous === value) {
            return;
        }
        this._pointerMode = value;
        this.source.trigger('changePointerMode', {source: this, previous});
    }

    get zoomOptions(): Required<ZoomOptions> {
        return this._zoomOptions;
    }

    render() {
        const {model, renderingState, hideScrollBars, watermarkSvg, watermarkUrl} = this.props;
        const paperTransform = this.metrics.getTransform();

        const className = classnames(
            CLASS_NAME,
            hideScrollBars ? `${CLASS_NAME}--hide-scrollbars` : undefined,
            this.isAnimatingGraph() ? `${CLASS_NAME}--animated` : undefined
        );

        const renderedWidgets = Array.from(this.getAllWidgets());
        return (
            <CanvasContext.Provider value={this.canvasContext}>
                <div className={className}>
                    <div className={`${CLASS_NAME}__area`}
                        ref={this.onAreaMount}
                        onPointerDown={this.onAreaPointerDown}>
                        <Paper model={model}
                            renderingState={renderingState}
                            paperTransform={paperTransform}
                            svgCanvasRef={this.svgCanvasRef}
                            onPointerDown={this.onPaperPointerDown}
                            onContextMenu={this.onContextMenu}
                            onScrollCapture={this.onPaperScrollCapture}
                            linkLayerWidgets={
                                <div className={`${CLASS_NAME}__widgets`}
                                    onPointerDown={this.onWidgetsPointerDown}>
                                    {renderedWidgets
                                        .filter(w => w.attachment === 'overLinks')
                                        .map(widget => ensureWidgetGetRendered(widget.element))
                                    }
                                </div>
                            }
                            elementLayerWidgets={
                                <div className={`${CLASS_NAME}__widgets`}
                                    onPointerDown={this.onWidgetsPointerDown}>
                                    {renderedWidgets
                                        .filter(w => w.attachment === 'overElements')
                                        .map(widget => ensureWidgetGetRendered(widget.element))
                                    }
                                </div>
                            }
                        />
                        {watermarkSvg ? (
                            <a href={watermarkUrl} target='_blank' rel='noreferrer'>
                                <img className={`${CLASS_NAME}__watermark`}
                                    src={watermarkSvg}
                                    draggable={false}
                                />
                            </a>
                        ) : null}
                    </div>
                    {renderedWidgets
                        .filter(w => w.attachment === 'viewport')
                        .map(widget => ensureWidgetGetRendered(widget.element))
                    }
                </div>
            </CanvasContext.Provider>
        );
    }

    private onAreaMount = (area: HTMLDivElement) => {
        this.area = area;
    };

    componentDidMount() {
        this.adjustPaper(() => this.centerTo());

        const {model, renderingState} = this.props;
        const delayedAdjust = () => this.delayedPaperAdjust.call(this.adjustPaper);
        this.listener.listen(model.events, 'changeCells', delayedAdjust);
        this.listener.listen(model.events, 'elementEvent', ({data}) => {
            if (data.changePosition) {
                delayedAdjust();
            }
        });
        this.listener.listen(model.events, 'linkEvent', ({data}) => {
            if (data.changeVertices) {
                delayedAdjust();
            }
        });
        this.listener.listen(renderingState.events, 'changeElementSize', delayedAdjust);
        this.listener.listen(renderingState.events, 'syncUpdate', ({layer}) => {
            if (layer !== RenderingLayer.PaperArea) { return; }
            this.delayedPaperAdjust.runSynchronously();
        });
        this.listener.listen(renderingState.shared.events, 'changeWidgets', () => {
            this.forceUpdate();
        });
        this.listener.listen(renderingState.shared.events, 'findCanvas', e => {
            e.canvases.push(this);
        });

        this.area.addEventListener('dragover', this.onDragOver);
        this.area.addEventListener('drop', this.onDragDrop);
        this.area.addEventListener('scroll', this.onScroll, {passive: true});
        this.area.addEventListener('wheel', this.onWheel, {passive: false});

        this.resizeObserver.observe(this.area);
    }

    componentDidUpdate(prevProps: PaperAreaProps, prevState: State) {
        if (this.scrollBeforeUpdate) {
            const {scale, originX, originY, paddingX, paddingY} = this.state;
            const scrollX = (originX - prevState.originX) * scale + (paddingX - prevState.paddingX);
            const scrollY = (originY - prevState.originY) * scale + (paddingY - prevState.paddingY);

            const scrollLeft = this.scrollBeforeUpdate.left + scrollX;
            const scrollTop = this.scrollBeforeUpdate.top + scrollY;

            this.area.scrollLeft = scrollLeft;
            this.area.scrollTop = scrollTop;

            this.scrollBeforeUpdate = undefined;
        }
    }

    componentWillUnmount() {
        this.stopListeningToPointerMove();
        this.listener.stopListening();
        this.delayedPaperAdjust.dispose();
        this.area.removeEventListener('dragover', this.onDragOver);
        this.area.removeEventListener('drop', this.onDragDrop);
        this.area.removeEventListener('scroll', this.onScroll);
        this.area.removeEventListener('wheel', this.onWheel);
        this.resizeObserver.disconnect();
    }

    private *getAllWidgets(): IterableIterator<CanvasWidgetDescription> {
        const {renderingState, children} = this.props;
        for (const element of React.Children.toArray(children)) {
            if (React.isValidElement(element)) {
                const widget = extractCanvasWidget(element);
                if (widget) {
                    yield widget;
                } else {
                    console.warn('Unexpected non-widget canvas child: ', element);
                }
            }
        }
        yield* renderingState.shared.widgets.values();
    }

    private onWidgetsPointerDown = (e: React.PointerEvent) => {
        // prevent PaperArea from generating click on a blank area
        e.stopPropagation();
    };

    /** Returns bounding box of paper content in paper coordinates. */
    private getContentFittingBox() {
        const {model, renderingState} = this.props;
        const {elements, links} = model;
        return getContentFittingBox(elements, links, renderingState);
    }

    private computeAdjustedBox(): Pick<State, 'width' | 'height' | 'originX' | 'originY'> {
        // bbox in paper coordinates
        const bbox = this.getContentFittingBox();
        const bboxLeft = bbox.x;
        const bboxTop = bbox.y;
        const bboxRight = bbox.x + bbox.width;
        const bboxBottom = bbox.y + bbox.height;

        const {x: gridWidth, y: gridHeight} = this.pageSize;

        // bbox in integer grid coordinates (open-closed intervals)
        const bboxGrid = {
            left: Math.floor(bboxLeft / gridWidth),
            top: Math.floor(bboxTop / gridHeight),
            right: Math.ceil(bboxRight / gridWidth),
            bottom: Math.ceil(bboxBottom / gridHeight),
        };

        // const oldOrigin = this.paper.options.origin;
        const originX = -bboxGrid.left * gridWidth;
        const originY = -bboxGrid.top * gridHeight;

        const width = Math.max(bboxGrid.right - bboxGrid.left, 1) * gridWidth;
        const height = Math.max(bboxGrid.bottom - bboxGrid.top, 1) * gridHeight;

        return {width, height, originX, originY};
    }

    private adjustPaper = (callback?: () => void) => {
        const {clientWidth, clientHeight} = this.area;
        const adjusted = {
            ...this.computeAdjustedBox(),
            paddingX: Math.ceil(clientWidth),
            paddingY: Math.ceil(clientHeight),
        } satisfies Partial<State>;
        const previous = this.state;
        const samePaperProps = (
            adjusted.width === previous.width &&
            adjusted.height === previous.height &&
            adjusted.originX === previous.originX &&
            adjusted.originY === previous.originY &&
            adjusted.paddingX === previous.paddingX &&
            adjusted.paddingY === previous.paddingY
        );
        if (!samePaperProps) {
            this.scrollBeforeUpdate = {
                left: this.area.scrollLeft,
                top: this.area.scrollTop,
            };
            this.setState(adjusted, callback);
        } else if (callback) {
            callback();
        }
    };

    private onAreaPointerDown = (e: React.PointerEvent<HTMLElement>) => {
        if (e.target === this.area) {
            this.onPaperPointerDown(e, undefined);
        }
    };

    private onPaperPointerDown = (e: React.PointerEvent<HTMLElement>, cell: Cell | undefined) => {
        if (e.button !== LEFT_MOUSE_BUTTON) {
            return;
        }

        if (this.movingState) {
            this.handleMultiPointerDown(e);
            return;
        }

        const {model} = this.props;
        const restoreGeometry = RestoreGeometry.capture(model);
        const batch = model.history.startBatch(restoreGeometry.metadata);

        let panningOrigin: PointerMoveState['panningOrigin'];
        let movingElementOrigin: PointerMoveState['movingElementOrigin'];

        if (cell || e.pointerType === 'mouse') {
            // keep default panning on touch
            e.preventDefault();
        }

        if (cell === undefined) {
            if (this.shouldStartPanning(e)) {
                const {scrollLeft, scrollTop} = this.area;
                panningOrigin = {scrollLeft, scrollTop};
                clearTextSelectionInArea();
            }
        } else if (cell instanceof Element) {
            if (this.shouldStartElementMove(e)) {
                const {x: pointerX, y: pointerY} = this.metrics.pageToPaperCoords(e.pageX, e.pageY);
                const {x: elementX, y: elementY} = cell.position;
                movingElementOrigin = {pointerX, pointerY, elementX, elementY};
            }
        }

        const {pageX, pageY} = e;
        this.movingState = {
            pointers: new Map(),
            pointerMoved: false,
            target: cell,
            batch,
            restoreGeometry,
            originPointerId: e.pointerId,
            origin: {pageX, pageY},
            panningOrigin,
            movingElementOrigin,
            pinchOrigin: undefined,
        };
        this.handleMultiPointerDown(e);

        document.addEventListener('pointermove', this.onPointerMove);
        document.addEventListener('pointerup', this.onPointerUp);
        if (e.pointerType !== 'mouse') {
            document.addEventListener('pointercancel', this.onPointerCancel);
        }

        this.source.trigger('pointerDown', {
            source: this,
            sourceEvent: e,
            target: cell,
            panning: Boolean(panningOrigin),
        });
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

    private shouldStartPanning(e: React.PointerEvent) {
        const requireShift = this._pointerMode === 'selection';
        return (
            e.pointerType === 'mouse' &&
            e.shiftKey === requireShift &&
            !(e.ctrlKey || e.altKey)
        );
    }

    private shouldStartElementMove(e: React.PointerEvent) {
        return e.pointerType === 'mouse';
    }

    private onPointerMove = (e: PointerEvent) => {
        if (!this.movingState || this.scrollBeforeUpdate) { return; }
        const {renderingState} = this.props;

        const {origin, target, panningOrigin, movingElementOrigin} = this.movingState;
        const pageOffsetX = e.pageX - origin.pageX;
        const pageOffsetY = e.pageY - origin.pageY;
        if (e.isPrimary && Math.abs(pageOffsetX) >= 1 && Math.abs(pageOffsetY) >= 1) {
            this.movingState.pointerMoved = true;
        }

        const panning = Boolean(panningOrigin);

        if (this.handleMultiPointerMove(e)) {
            /* pinch zoom */
        } else if (typeof target === 'undefined') {
            e.preventDefault();
            if (panningOrigin) {
                this.area.classList.add(`${CLASS_NAME}--panning`);
                this.area.scrollLeft = panningOrigin.scrollLeft - pageOffsetX;
                this.area.scrollTop = panningOrigin.scrollTop - pageOffsetY;
            }
            this.source.trigger('pointerMove', {source: this, sourceEvent: e, target, panning});
        } else if (target instanceof Element) {
            e.preventDefault();
            if (movingElementOrigin) {
                const {x, y} = this.metrics.pageToPaperCoords(e.pageX, e.pageY);
                const {pointerX, pointerY, elementX, elementY} = movingElementOrigin;
                target.setPosition({
                    x: elementX + x - pointerX,
                    y: elementY + y - pointerY,
                });
                this.source.trigger('pointerMove', {source: this, sourceEvent: e, target, panning});
                renderingState.syncUpdate();
            }
        } else if (target instanceof Link) {
            e.preventDefault();
            const location = this.metrics.pageToPaperCoords(e.pageX, e.pageY);
            const linkVertex = this.generateLinkVertex(target, location);
            linkVertex.createAt(location);
            this.movingState.target = linkVertex;
        } else if (target instanceof LinkVertex) {
            e.preventDefault();
            const location = this.metrics.pageToPaperCoords(e.pageX, e.pageY);
            target.moveTo(location);
            this.source.trigger('pointerMove', {source: this, sourceEvent: e, target, panning});
            renderingState.syncUpdate();
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
            originMetrics.area.clientWidth / 2,
            originMetrics.area.clientHeight / 2
        );
        const lastPaper = originMetrics.pageToPaperCoords(last.x, last.y);
        const originPaper = originMetrics.pageToPaperCoords(origin.x, origin.y);
        const movedCenter = Vector.add(
            originPaper,
            Vector.scale(Vector.subtract(centerPaper, lastPaper), 1 / scaleMultiplier)
        );

        const scale = originMetrics.getTransform().scale * scaleMultiplier;
        this.centerTo(movedCenter, {scale});
        return true;
    }

    private generateLinkVertex(link: Link, location: Vector): LinkVertex {
        const {model, renderingState} = this.props;
        const previous = link.vertices;
        const vertices = previous ? [...previous] : [];
        const source = model.getElement(link.sourceId)!;
        const target = model.getElement(link.targetId)!;
        const polyline = computePolyline(
            boundsOf(source, renderingState),
            boundsOf(target, renderingState),
            vertices
        );
        const segmentIndex = findNearestSegmentIndex(polyline, location);
        return new LinkVertex(link, segmentIndex);
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

    private onPaperScrollCapture = (e: React.UIEvent<HTMLElement>, cell: Cell | undefined) => {
        if (cell instanceof Element && this.movingState) {
            // Prevent element move when interacting with nested scrollbars
            this.stopListeningToPointerMove();
        }
    };

    private stopListeningToPointerMove = (e?: PointerEvent) => {
        const movingState = this.movingState;
        this.movingState = undefined;

        if (movingState) {
            this.area.classList.remove(`${CLASS_NAME}--panning`);
            document.removeEventListener('pointermove', this.onPointerMove);
            document.removeEventListener('pointerup', this.onPointerUp);
            document.removeEventListener('pointercancel', this.onPointerCancel);
        }

        if (e && movingState && !movingState.pinchOrigin) {
            const {pointerMoved, target, batch, restoreGeometry} = movingState;
            this.source.trigger('pointerUp', {
                source: this,
                sourceEvent: e,
                target,
                panning: Boolean(movingState.panningOrigin),
                triggerAsClick: !pointerMoved,
            });

            const restore = restoreGeometry.filterOutUnchanged();
            if (restore.hasChanges()) {
                batch.history.registerToUndo(restore);
            }
            batch.store();
        }
    };

    private onWheel = (e: WheelEvent) => {
        if (this.shouldStartZooming(e)) {
            e.preventDefault();
            const delta = Math.max(-1, Math.min(1, e.deltaY || e.deltaX));
            const pivot = this.metrics.pageToPaperCoords(e.pageX, e.pageY);
            this.zoomBy(-delta * 0.1, {pivot});
        }
    };

    private shouldStartZooming(e: MouseEvent | React.MouseEvent<any>) {
        return Boolean(e.ctrlKey) === this.zoomOptions.requireCtrl;
    }

    private onResize: ResizeObserverCallback = () => {
        this.source.trigger('resize', {source: this});
    };

    centerTo(paperPosition?: Vector, options: CenterToOptions = {}): Promise<void> {
        const {width, height} = this.state;
        const paperCenter = paperPosition || {x: width / 2, y: height / 2};
        if (typeof options.scale === 'number') {
            const {min, max} = this.zoomOptions;
            let scale = options.scale;
            scale = Math.max(scale, min);
            scale = Math.min(scale, max);
            const viewportState: Partial<ViewportState> = {
                center: paperCenter,
                scale: {x: scale, y: scale},
            };
            return this.setViewportState(viewportState, options);
        } else {
            const viewportState: Partial<ViewportState> = {
                center: paperCenter,
            };
            return this.setViewportState(viewportState, options);
        }
    }

    centerContent(options: ViewportOptions = {}): Promise<void> {
        const bbox = this.getContentFittingBox();
        return this.centerTo({
            x: bbox.x + bbox.width / 2,
            y: bbox.y + bbox.height / 2,
        }, options);
    }

    getScale() {
        return this.state.scale;
    }

    setScale(value: number, options?: ScaleOptions): Promise<void> {
        let scale = value;

        const {min, max} = this.zoomOptions;
        scale = Math.max(scale, min);
        scale = Math.min(scale, max);

        let viewportState: Partial<ViewportState>;
        if (options && options.pivot) {
            const {x, y} = options.pivot;
            const paperCenter = this.metrics.clientToPaperCoords(
                this.area.clientWidth / 2,
                this.area.clientHeight / 2
            );
            const previousScale = this.state.scale;
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

    zoomBy(value: number, options?: ScaleOptions) {
        return this.setScale(this.getScale() + value, options);
    }

    zoomIn(scaleOptions?: ScaleOptions) {
        return this.zoomBy(this.zoomOptions.step, scaleOptions);
    }

    zoomOut(scaleOptions?: ScaleOptions) {
        return this.zoomBy(-this.zoomOptions.step, scaleOptions);
    }

    zoomToFit(options: ViewportOptions = {}): Promise<void> {
        const {model, renderingState} = this.props;
        const {elements} = model;
        if (elements.length === 0) {
            return this.centerTo();
        }
        const bbox = getContentFittingBox(elements, [], renderingState);
        return this.zoomToFitRect(bbox, options);
    }

    zoomToFitRect(
        paperRect: Rect, options: ViewportOptions = {},
    ): Promise<void> {
        const {clientWidth, clientHeight} = this.area;

        if (paperRect.width === 0) {
            return Promise.resolve();
        }

        const {min, maxFit, fitPadding} = this.zoomOptions;

        const paddedRect: Rect = {
            x: paperRect.x - fitPadding,
            y: paperRect.y - fitPadding,
            width: paperRect.width + fitPadding,
            height: paperRect.height + fitPadding,
        };
        const {width} = fitRectKeepingAspectRatio(
            paddedRect.width, paddedRect.height,
            clientWidth, clientHeight,
        );

        let scale = width / paddedRect.width;
        scale = Math.max(scale, min);
        scale = Math.min(scale, maxFit);

        const center = {
            x: paddedRect.x + paddedRect.width / 2,
            y: paddedRect.y + paddedRect.height / 2,
        };

        const viewPortState: ViewportState = {
            center,
            scale: {x: scale, y: scale},
        };

        return this.setViewportState(viewPortState, options);
    }

    private onDragOver = (e: DragEvent) => {
        // Necessary. Allows us to drop.
        if (e.preventDefault) { e.preventDefault(); }
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
        }
        const {x, y} = clientCoordsFor(this.area, e);
        return false;
    };

    private onDragDrop = (e: DragEvent) => {
        const {renderingState} = this.props;
        const {x, y} = clientCoordsFor(this.area, e);
        const position = this.metrics.clientToPaperCoords(x, y);
        const event: CanvasDropEvent = {
            source: this,
            sourceEvent: e,
            position,
        };
        if (renderingState.shared.tryHandleDropOnPaper(event)) {
            /* skip trigger -- already handled */
        } else {
            this.source.trigger('drop', event);
        }
    };

    private onScroll = (e: Event) => {
        this.source.trigger('scroll', {source: this, sourceEvent: e});
    };

    private onContextMenu = (e: React.MouseEvent, cell: Cell | undefined) => {
        this.source.trigger('contextMenu', {
            source: this,
            sourceEvent: e,
            target: cell,
        });
    };

    private makeToSVGOptions(baseOptions: ExportSvgOptions): ToSVGOptions {
        const {model, renderingState} = this.props;
        const {
            removeByCssSelectors = [],
        } = baseOptions;
        const svg = this.svgCanvasRef.current;
        if (!svg) {
            throw new Error('Cannot find SVG canvas to export');
        }
        return {
            model,
            sizeProvider: renderingState,
            paper: svg,
            contentBox: this.getContentFittingBox(),
            getOverlaidElement: id => this.area.querySelector(`[data-element-id='${id}']`) as HTMLElement,
            preserveDimensions: true,
            convertImagesToDataUris: true,
            removeByCssSelectors: [
                '[data-reactodia-no-export]',
                ...removeByCssSelectors
            ],
            watermarkSvg: this.props.watermarkSvg,
        };
    }

    exportSvg(options: ExportSvgOptions = {}): Promise<string> {
        return toSVG(this.makeToSVGOptions(options));
    }

    exportRaster(options: ExportRasterOptions = {}): Promise<string> {
        return toDataURL({...options, ...this.makeToSVGOptions(options)});
    }

    isAnimatingGraph(): boolean {
        return this.cssAnimations > 0;
    }

    animateGraph(setupChanges: () => void, duration?: number): Promise<void> {
        this.changeGraphAnimationCount(+1);
        setupChanges();

        const timeout = typeof duration === 'number' ? duration : DEFAULT_ANIMATION_DURATION;
        return delay(timeout).then(() => this.onGraphAnimationEnd());
    }

    private onGraphAnimationEnd() {
        this.changeGraphAnimationCount(-1);
    }

    private changeGraphAnimationCount(change: number) {
        const newValue = this.cssAnimations + change;
        if (newValue < 0) { return; }

        const previous = this.isAnimatingGraph();
        this.cssAnimations = newValue;

        const current = this.isAnimatingGraph();
        if (previous !== current) {
            this.forceUpdate();
            this.source.trigger('changeAnimatingGraph', {source: this, previous});
        }
    }

    private get viewportState(): ViewportState {
        const {clientWidth, clientHeight} = this.area;
        const {originX, originY, paddingX, paddingY, scale} = this.state;

        const scrollCenterX = this.area.scrollLeft + clientWidth / 2 - paddingX;
        const scrollCenterY = this.area.scrollTop + clientHeight / 2 - paddingY;
        const paperCenter = {
            x: scrollCenterX / scale - originX,
            y: scrollCenterY / scale - originY,
        };

        return {
            center: paperCenter,
            scale: {
                x: scale,
                y: scale,
            }
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
                ? options.duration : DEFAULT_ANIMATION_DURATION;

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
        const previousScale = this.state.scale;
        const scale = targetState.scale.x;
        const paperCenter = targetState.center;

        this.setState({scale}, () => {
            const {originX, originY, paddingX, paddingY} = this.state;
            const scrollCenterX = (paperCenter.x + originX) * scale;
            const scrollCenterY = (paperCenter.y + originY) * scale;
            const {clientWidth, clientHeight} = this.area;

            this.area.scrollLeft = scrollCenterX - clientWidth / 2 + paddingX;
            this.area.scrollTop = scrollCenterY - clientHeight / 2 + paddingY;

            if (scale !== previousScale) {
                this.source.trigger('changeScale', {source: this, previous: previousScale});
            }
        });
    }
}

abstract class BasePaperMetrics implements CanvasMetrics {
    abstract get area(): CanvasAreaMetrics;
    protected abstract get transform(): PaperTransform;
    protected abstract getClientRect(): AreaClientRect;

    snapshot(): CanvasMetrics {
        const {
            clientWidth, clientHeight, offsetWidth, offsetHeight, scrollLeft, scrollTop,
        } = this.area;
        const {left, right, top, bottom} = this.getClientRect();
        return new SnapshotPaperMetrics(
            {clientWidth, clientHeight, offsetWidth, offsetHeight, scrollLeft, scrollTop},
            {left, right, top, bottom},
            this.transform
        );
    }

    getTransform(): PaperTransform {
        return this.transform;
    }

    getPaperSize(): { width: number; height: number } {
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
        const {scrollLeft, scrollTop} = this.area;
        const paneX = areaClientX + scrollLeft - paddingX;
        const paneY = areaClientY + scrollTop - paddingY;
        return {x: paneX, y: paneY};
    }

    scrollablePaneToClientCoords(paneX: number, paneY: number): Vector {
        const {paddingX, paddingY} = this.transform;
        const {scrollLeft, scrollTop} = this.area;
        const areaClientX = paneX - scrollLeft + paddingX;
        const areaClientY = paneY - scrollTop + paddingY;
        return {x: areaClientX, y: areaClientY};
    }

    scrollablePaneToPaperCoords(paneX: number, paneY: number): Vector {
        const {scale, originX, originY} = this.transform;
        const paperX = paneX / scale - originX;
        const paperY = paneY / scale - originY;
        return {x: paperX, y: paperY};
    }

    paperToScrollablePaneCoords(paperX: number, paperY: number): Vector {
        const {scale, originX, originY} = this.transform;
        const paneX = (paperX + originX) * scale;
        const paneY = (paperY + originY) * scale;
        return {x: paneX, y: paneY};
    }
}

class SnapshotPaperMetrics extends BasePaperMetrics {
    constructor(
        readonly area: CanvasAreaMetrics,
        private readonly clientRect: AreaClientRect,
        readonly transform: PaperTransform
    ) {
        super();
    }

    protected getClientRect(): AreaClientRect {
        return this.clientRect;
    }

    snapshot(): CanvasMetrics {
        return this;
    }
}

interface AreaClientRect {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
}

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

function ensureWidgetGetRendered(element: React.ReactElement) {
    return React.cloneElement(element);
}

/** Clears accidental text selection in the diagram area. */
function clearTextSelectionInArea() {
    if (document.getSelection) {
        const selection = document.getSelection();
        selection?.removeAllRanges?.();
    }
}
