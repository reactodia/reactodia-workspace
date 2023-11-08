import * as React from 'react';

import { delay } from '../coreUtils/async';
import { EventObserver, Events, EventSource } from '../coreUtils/events';
import { Debouncer, animateInterval, easeInOutBezier } from '../coreUtils/scheduler';

import {
    CanvasContext, CanvasApi, CanvasEvents, CanvasMetrics, CanvasAreaMetrics,
    CanvasDropEvent, ScaleOptions, ViewportOptions, CanvasWidgetDescription,
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
import { RenderingState, RenderingLayer } from './renderingState';
import {
    ToSVGOptions, ToDataURLOptions, toSVG, toDataURL, fitRectKeepingAspectRatio,
} from './toSvg';
import { DiagramView } from './view';

export interface PaperAreaProps {
    model: DiagramModel;
    view: DiagramView;
    renderingState: RenderingState;
    zoomOptions?: ZoomOptions;
    hideScrollBars?: boolean;
    watermarkSvg?: string;
    watermarkUrl?: string;
    children?: React.ReactNode;
}

export interface ZoomOptions {
    min?: number;
    max?: number;
    step?: number;
    /** Used when zooming to fit to limit zoom of small diagrams */
    maxFit?: number;
    fitPadding?: number;
    requireCtrl?: boolean;
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
    pointerMoved: boolean;
    target: Cell | undefined;
    panning: boolean;
    origin: {
        readonly pageX: number;
        readonly pageY: number;
    };
    batch: CommandBatch;
    restoreGeometry: RestoreGeometry;
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

const CLASS_NAME = 'ontodia-paper-area';
const DEFAULT_ANIMATION_DURATION = 500;
const LEFT_MOUSE_BUTTON = 0;

export class PaperArea extends React.Component<PaperAreaProps, State> implements CanvasApi {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<CanvasEvents>();
    readonly events: Events<CanvasEvents> = this.source;

    private area!: HTMLDivElement;

    private readonly pageSize = {x: 1500, y: 800};
    private readonly canvasContext: CanvasContext;

    private viewportAnimation: ViewportAnimation | undefined;
    private cssAnimations = 0;

    private movingState: PointerMoveState | undefined;
    private panningScrollOrigin: { scrollLeft: number; scrollTop: number } | undefined;
    private movingElementOrigin: {
        pointerX: number;
        pointerY: number;
        elementX: number;
        elementY: number;
    } | undefined;

    private delayedPaperAdjust = new Debouncer();
    private scrollBeforeUpdate: undefined | {
        left: number;
        top: number;
    };

    private get zoomOptions(): Required<ZoomOptions> {
        const {
            min = 0.2, max = 2, step = 0.1, maxFit = 1, fitPadding = 20, requireCtrl = true,
        } = this.props.zoomOptions || {};
        return {min, max, step, maxFit, fitPadding, requireCtrl};
    }

    readonly metrics: CanvasMetrics;

    constructor(props: PaperAreaProps, context: any) {
        super(props, context);
        this.state = {
            width: this.pageSize.x,
            height: this.pageSize.y,
            originX: 0,
            originY: 0,
            scale: 1,
            paddingX: 0,
            paddingY: 0,
        };
        const paperArea = this;
        this.metrics = new (class extends BasePaperMetrics {
            get area() {
                return paperArea.area;
            }
            get transform(): PaperTransform {
                const {width, height, originX, originY, scale, paddingX, paddingY} = paperArea.state;
                return {width, height, originX, originY, scale, paddingX, paddingY};
            }
            protected getClientRect(): { left: number; top: number; } {
                return paperArea.area.getBoundingClientRect();
            }
        })();
        this.canvasContext = {
            canvas: this,
            model: props.model,
            view: props.view,
        };
    }

    get renderingState(): RenderingState {
        return this.props.renderingState;
    }

    render() {
        const {model, view, renderingState, watermarkSvg, watermarkUrl} = this.props;
        const paperTransform = this.metrics.getTransform();

        let areaClass = `${CLASS_NAME}__area`;
        if (this.props.hideScrollBars) {
            areaClass += ` ${CLASS_NAME}--hide-scrollbars`;
        }

        let componentClass = CLASS_NAME;
        if (this.isAnimatingGraph()) {
            componentClass += ` ${CLASS_NAME}--animated`;
        }

        const renderedWidgets = Array.from(this.getAllWidgets());
        return (
            <CanvasContext.Provider value={this.canvasContext}>
                <div className={componentClass}>
                    <div className={areaClass}
                        ref={this.onAreaMount}
                        onMouseDown={this.onAreaPointerDown}>
                        <Paper model={model}
                            view={view}
                            renderingState={renderingState}
                            paperTransform={paperTransform}
                            onPointerDown={this.onPaperPointerDown}
                            onContextMenu={this.onContextMenu}
                            linkLayerWidgets={
                                <div className={`${CLASS_NAME}__widgets`}
                                    onMouseDown={this.onWidgetsMouseDown}>
                                    {renderedWidgets
                                        .filter(w => w.attachment === 'overLinks')
                                        .map(widget => widget.element)
                                    }
                                </div>
                            }
                            elementLayerWidgets={
                                <div className={`${CLASS_NAME}__widgets`}
                                    onMouseDown={this.onWidgetsMouseDown}>
                                    {renderedWidgets
                                        .filter(w => w.attachment === 'overElements')
                                        .map(widget => widget.element)
                                    }
                                </div>
                            }
                        />
                        {watermarkSvg ? (
                            <a href={watermarkUrl} target='_blank' rel='noopener'>
                                <img className={`${CLASS_NAME}__watermark`}
                                    src={watermarkSvg}
                                    draggable={false}
                                />
                            </a>
                        ) : null}
                    </div>
                    {renderedWidgets
                        .filter(w => w.attachment === 'viewport')
                        .map(widget => widget.element)
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

        const {model, view, renderingState} = this.props;
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
        this.listener.listen(view.events, 'changeCanvasWidgets', () => {
            this.forceUpdate();
        });
        this.listener.listen(view.events, 'findCanvas', e => {
            e.canvases.push(this);
        });

        this.area.addEventListener('dragover', this.onDragOver);
        this.area.addEventListener('drop', this.onDragDrop);
        this.area.addEventListener('scroll', this.onScroll);
        this.area.addEventListener('wheel', this.onWheel, {passive: false});
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
    }

    private *getAllWidgets(): IterableIterator<CanvasWidgetDescription> {
        const {view, children} = this.props;
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
        yield* view.canvasWidgets.values();
    }

    private onWidgetsMouseDown = (e: React.MouseEvent<any>) => {
        // prevent PaperArea from generating click on a blank area
        e.stopPropagation();
    }

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
    }

    private shouldStartZooming(e: MouseEvent | React.MouseEvent<any>) {
        return Boolean(e.ctrlKey) && Boolean(this.zoomOptions.requireCtrl) || !this.zoomOptions.requireCtrl;
    }

    private shouldStartPanning(e: MouseEvent | React.MouseEvent<any>) {
        const modifierPressed = e.ctrlKey || e.shiftKey || e.altKey;
        return e.button === LEFT_MOUSE_BUTTON && !modifierPressed;
    }

    private onPaperPointerDown = (e: React.MouseEvent<HTMLElement>, cell: Cell | undefined) => {
        if (this.movingState) { return; }

        const {model} = this.props;
        const restore = RestoreGeometry.capture(model);
        const batch = model.history.startBatch(restore.title);

        if (cell && e.button === LEFT_MOUSE_BUTTON) {
            if (cell instanceof Element) {
                e.preventDefault();
                this.startMoving(e, cell);
                this.listenToPointerMove(e, cell, batch, restore);
            } else {
                e.preventDefault();
                this.listenToPointerMove(e, cell, batch, restore);
            }
        } else {
            e.preventDefault();
            this.listenToPointerMove(e, undefined, batch, restore);
        }
    }

    private onAreaPointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === this.area) {
            this.onPaperPointerDown(e, undefined);
        }
    }

    private startMoving(e: React.MouseEvent<HTMLElement>, element: Element) {
        const {x: pointerX, y: pointerY} = this.metrics.pageToPaperCoords(e.pageX, e.pageY);
        const {x: elementX, y: elementY} = element.position;
        this.movingElementOrigin = {pointerX, pointerY, elementX, elementY};
    }

    private startPanning(event: React.MouseEvent<any>) {
        const {scrollLeft, scrollTop} = this.area;
        this.panningScrollOrigin = {scrollLeft, scrollTop};
        this.clearTextSelectionInArea();
    }

    /** Clears accidental text selection in the diagram area. */
    private clearTextSelectionInArea() {
        if (document.getSelection) {
            const selection = document.getSelection();
            selection?.removeAllRanges?.();
        }
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

    private listenToPointerMove(
        event: React.MouseEvent<any>,
        cell: Cell | undefined,
        batch: CommandBatch,
        restoreGeometry: RestoreGeometry,
    ) {
        if (this.movingState) { return; }
        const panning = cell === undefined && this.shouldStartPanning(event);
        if (panning) {
            this.startPanning(event);
        }
        const {pageX, pageY} = event;
        this.movingState = {
            origin: {pageX, pageY},
            target: cell,
            panning,
            pointerMoved: false,
            batch,
            restoreGeometry,
        };
        document.addEventListener('mousemove', this.onPointerMove);
        document.addEventListener('mouseup', this.stopListeningToPointerMove);
        this.source.trigger('pointerDown', {
            source: this, sourceEvent: event, target: cell, panning,
        });
    }

    private onPointerMove = (e: MouseEvent) => {
        if (!this.movingState || this.scrollBeforeUpdate) { return; }
        const {renderingState} = this.props;

        const {origin, target, panning} = this.movingState;
        const pageOffsetX = e.pageX - origin.pageX;
        const pageOffsetY = e.pageY - origin.pageY;
        if (Math.abs(pageOffsetX) >= 1 && Math.abs(pageOffsetY) >= 1) {
            this.movingState.pointerMoved = true;
        }

        if (typeof target === 'undefined') {
            if (panning) {
                this.area.scrollLeft = this.panningScrollOrigin!.scrollLeft - pageOffsetX;
                this.area.scrollTop = this.panningScrollOrigin!.scrollTop - pageOffsetY;
            }
            this.source.trigger('pointerMove', {source: this, sourceEvent: e, target, panning});
        } else if (target instanceof Element) {
            const {x, y} = this.metrics.pageToPaperCoords(e.pageX, e.pageY);
            const {pointerX, pointerY, elementX, elementY} = this.movingElementOrigin!;
            target.setPosition({
                x: elementX + x - pointerX,
                y: elementY + y - pointerY,
            });
            this.source.trigger('pointerMove', {source: this, sourceEvent: e, target, panning});
            renderingState.syncUpdate();
        } else if (target instanceof Link) {
            const location = this.metrics.pageToPaperCoords(e.pageX, e.pageY);
            const linkVertex = this.generateLinkVertex(target, location);
            linkVertex.createAt(location);
            this.movingState.target = linkVertex;
        } else if (target instanceof LinkVertex) {
            const location = this.metrics.pageToPaperCoords(e.pageX, e.pageY);
            target.moveTo(location);
            this.source.trigger('pointerMove', {source: this, sourceEvent: e, target, panning});
            renderingState.syncUpdate();
        }
    }

    private stopListeningToPointerMove = (e?: MouseEvent) => {
        const movingState = this.movingState;
        this.movingState = undefined;

        if (movingState) {
            document.removeEventListener('mousemove', this.onPointerMove);
            document.removeEventListener('mouseup', this.stopListeningToPointerMove);
        }

        if (e && movingState) {
            const {pointerMoved, target, batch, restoreGeometry} = movingState;
            this.source.trigger('pointerUp', {
                source: this,
                sourceEvent: e,
                target,
                panning: movingState.panning,
                triggerAsClick: !pointerMoved,
            });

            const restore = restoreGeometry.filterOutUnchanged();
            if (restore.hasChanges()) {
                batch.history.registerToUndo(restore);
            }
            batch.store();
        }
    }

    private onWheel = (e: WheelEvent) => {
        if (this.shouldStartZooming(e)) {
            e.preventDefault();
            const delta = Math.max(-1, Math.min(1, e.deltaY || e.deltaX));
            const pivot = this.metrics.pageToPaperCoords(e.pageX, e.pageY);
            this.zoomBy(-delta * 0.1, {pivot});
        }
    }

    centerTo(paperPosition?: { x: number; y: number }, options: ViewportOptions = {}): Promise<void> {
        const {width, height} = this.state;
        const paperCenter = paperPosition || {x: width / 2, y: height / 2};
        const viewportState: Partial<ViewportState> = {
            center: paperCenter,
        };
        return this.setViewportState(viewportState, options);
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

        const {width} = fitRectKeepingAspectRatio(
            paperRect.width, paperRect.height,
            clientWidth, clientHeight,
        );

        let scale = width / paperRect.width;
        const {min, maxFit} = this.zoomOptions;
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
        // Necessary. Allows us to drop.
        if (e.preventDefault) { e.preventDefault(); }
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
        }
        const {x, y} = clientCoordsFor(this.area, e);
        return false;
    }

    private onDragDrop = (e: DragEvent) => {
        const {view} = this.props;
        const {x, y} = clientCoordsFor(this.area, e);
        const position = this.metrics.clientToPaperCoords(x, y);
        const event: CanvasDropEvent = {
            source: this,
            sourceEvent: e,
            position,
        };
        if (view.tryHandleDropOnPaper(event)) {
            /* skip trigger -- already handled */
        } else {
            this.source.trigger('drop', event);
        }
    }

    private onScroll = (e: Event) => {
        this.source.trigger('scroll', {source: this, sourceEvent: e});
    }

    private onContextMenu = (e: React.MouseEvent, cell: Cell | undefined) => {
        this.source.trigger('contextMenu', {
            source: this,
            sourceEvent: e,
            target: cell,
        });
    };

    private makeToSVGOptions(): ToSVGOptions {
        const {model, renderingState} = this.props;
        const svg = this.area.querySelector('.ontodia-paper__canvas');
        if (!svg) {
            throw new Error('Cannot find SVG canvas to export');
        }
        return {
            model,
            sizeProvider: renderingState,
            paper: svg as SVGSVGElement,
            contentBox: this.getContentFittingBox(),
            getOverlaidElement: id => this.area.querySelector(`[data-element-id='${id}']`) as HTMLElement,
            preserveDimensions: true,
            convertImagesToDataUris: true,
            elementsToRemoveSelector: '.ontodia-link__vertex-tools',
            watermarkSvg: this.props.watermarkSvg,
        };
    }

    exportSvg(): Promise<string> {
        return toSVG(this.makeToSVGOptions());
    }

    exportPng(options: ToDataURLOptions): Promise<string> {
        return toDataURL({...options, ...this.makeToSVGOptions()});
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

    private applyViewportState = (targetState: ViewportState) => {
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
    protected abstract getClientRect(): { left: number; top: number };

    snapshot(): CanvasMetrics {
        const {
            clientWidth, clientHeight, offsetWidth, offsetHeight, scrollLeft, scrollTop,
        } = this.area;
        return new SnapshotPaperMetrics(
            {clientWidth, clientHeight, offsetWidth, offsetHeight, scrollLeft, scrollTop},
            this.getClientRect(),
            this.transform
        );
    }

    getTransform(): PaperTransform {
        return this.transform;
    }

    /** Returns paper size in paper coordinates. */
    getPaperSize(): { width: number; height: number } {
        const {width, height, scale} = this.transform;
        return {width: width / scale, height: height / scale};
    }

    pageToPaperCoords(pageX: number, pageY: number): Vector {
        const {left, top} = this.getClientRect();
        return this.clientToPaperCoords(
            pageX - (left + window.pageXOffset),
            pageY - (top + window.pageYOffset),
        );
    }

    clientToPaperCoords(areaClientX: number, areaClientY: number) {
        const {x: paneX, y: paneY} = this.clientToScrollablePaneCoords(areaClientX, areaClientY);
        return this.scrollablePaneToPaperCoords(paneX, paneY);
    }

    clientToScrollablePaneCoords(areaClientX: number, areaClientY: number) {
        const {paddingX, paddingY} = this.transform;
        const {scrollLeft, scrollTop} = this.area;
        const paneX = areaClientX + scrollLeft - paddingX;
        const paneY = areaClientY + scrollTop - paddingY;
        return {x: paneX, y: paneY};
    }

    scrollablePaneToPaperCoords(paneX: number, paneY: number) {
        const {scale, originX, originY} = this.transform;
        const paperX = paneX / scale - originX;
        const paperY = paneY / scale - originY;
        return {x: paperX, y: paperY};
    }

    paperToScrollablePaneCoords(paperX: number, paperY: number) {
        const {scale, originX, originY} = this.transform;
        const paneX = (paperX + originX) * scale;
        const paneY = (paperY + originY) * scale;
        return {x: paneX, y: paneY};
    }
}

class SnapshotPaperMetrics extends BasePaperMetrics {
    constructor(
        readonly area: CanvasAreaMetrics,
        private readonly clientRect: { left: number; top: number },
        readonly transform: PaperTransform
    ) {
        super();
    }

    protected getClientRect(): { left: number; top: number; } {
        return this.clientRect;
    }

    snapshot(): CanvasMetrics {
        return this;
    }
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
