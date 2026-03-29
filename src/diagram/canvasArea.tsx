import * as React from 'react';
import { flushSync } from 'react-dom';
import cx from 'clsx';

import { delay } from '../coreUtils/async';
import { ColorSchemeApi } from '../coreUtils/colorScheme';
import { EventObserver, Events, EventSource } from '../coreUtils/events';

import {
    Paper, PaperProps, type ScaleDefaults, type PaperPointerOperation, wheelToScaleDeltaDefault,
} from '../paper/paper';
import { PaperTransform, SvgPaperLayer } from '../paper/paperLayers';
import { toDataURL, toSVG, type ToSVGOptions } from '../paper/toSvg';

import {
    CanvasContext, type CanvasApi, CanvasEvents, CanvasMetrics,
    CanvasDragoverEvent, CanvasDropEvent, CenterToOptions, ScaleOptions, ViewportOptions,
    CanvasPointerMode, ZoomOptions, ExportSvgOptions, ExportRasterOptions,
} from './canvasApi';
import { RestoreGeometry } from './commands';
import { type Cell, Element, Link, LinkVertex } from './elements';
import { ElementLayer } from './elementLayer';
import {
    Rect, Size, Vector, computePolyline, findNearestSegmentIndex, getContentFittingBox,
} from './geometry';
import type { CommandBatch } from './history';
import { LinkLabelLayer, LinkLayer, LinkMarkers } from './linkLayer';
import type { DiagramModel } from './model';
import {
    CanvasPlaceLayerContext, CanvasPlaceLayer, createPlaceLayerContext,
} from './placeLayer';
import { MutableRenderingState, RenderingLayer } from './renderingState';

const CLASS_NAME = 'reactodia-canvas-area';
const DEFAULT_PAGE_SIZE: Size = {width: 1500, height: 800};
const VIEWPORT_DEFAULTS: PaperProps['viewportDefaults'] = {duration: 500};
const LEFT_MOUSE_BUTTON = 0;

export function CanvasArea(props: {
    model: DiagramModel;
    renderingState: MutableRenderingState;
    zoomOptions?: ZoomOptions;
    showScrollBars?: boolean;
    watermarkSvg?: string;
    watermarkUrl?: string;
    children: React.ReactNode;
}) {
    const {
        model, renderingState, zoomOptions: partialZoomOptions, showScrollBars,
        watermarkSvg, watermarkUrl, children,
    } = props;

    const colorSchemeApi = React.useContext(ColorSchemeApi);

    const paperRef = React.useRef<Paper>(null);
    const linkLayerRef = React.useRef<SVGSVGElement>(null);
    const labelLayerRef = React.useRef<HTMLDivElement>(null);
    const elementLayerRef = React.useRef<HTMLDivElement>(null);
    const [placeLayerContext] = React.useState(() => createPlaceLayerContext());

    const zoomOptions = React.useMemo(() => zoomOptionsWithDefaults(partialZoomOptions), [partialZoomOptions]);
    const [contentBounds, setContentBounds] = React.useState<Rect>({x: 0, y: 0, width: 0, height: 0});
    const [pointerMode, setPointerMode] = React.useState<CanvasPointerMode>('panning');
    const [graphAnimations, setGraphAnimations] = React.useState<GraphAnimations>({count: 0});

    const providedState: ControllerProvidedState = {
        colorSchemeApi,
        graphAnimations,
        watermarkSvg,
        zoomOptions,
    };

    const [controller] = React.useState(() => new CanvasController(
        model,
        renderingState,
        providedState,
        {setContentBounds, setPointerMode, setGraphAnimations},
        paperRef,
        linkLayerRef,
        labelLayerRef,
        elementLayerRef
    ));
    React.useEffect(() => controller.setProvidedState(providedState));
    const canvasContext = React.useMemo(
        (): CanvasContext => ({canvas: controller, model}),
        [model, controller]
    );

    const scaleDefaults = React.useMemo((): ScaleDefaults => ({
        min: zoomOptions.min,
        max: zoomOptions.max,
        maxFit: zoomOptions.maxFit,
        wheelToScaleDelta: controller.getWheelToScaleDelta,
    }), [zoomOptions]);

    React.useLayoutEffect(() => {
        void controller.centerTo();
        return () => controller.stopListening();
    }, []);

    const style = {
        '--reactodia-canvas-animation-duration': graphAnimations.duration === undefined
            ? undefined : `${graphAnimations.duration}ms`,
    } as React.CSSProperties;

    return (
        <CanvasContext.Provider value={canvasContext}>
            <Paper ref={paperRef}
                className={cx(
                    CLASS_NAME,
                    graphAnimations.count > 0 ? `${CLASS_NAME}--animated` : undefined
                )}
                style={style}
                panOnTouch={pointerMode === 'panning'}
                showScrollbars={showScrollBars}
                scaleDefaults={scaleDefaults}
                viewportDefaults={VIEWPORT_DEFAULTS}
                onChangeTransform={controller.onChangeTransform}
                onContextMenu={controller.onContextMenu}
                onDragOver={controller.onDragOver}
                onDragDrop={controller.onDragDrop}
                onKeyDown={controller.onKeyDown}
                onKeyUp={controller.onKeyUp}
                onPointerOperation={controller.onPointerOperation}
                onResize={controller.onResize}
                onScrollPassive={controller.onScrollPassive}
                pageSize={DEFAULT_PAGE_SIZE}
                contentBounds={contentBounds}
                renderLayers={paperTransform => (
                    <>
                        <CanvasPlaceLayer layer='underlay'
                            context={placeLayerContext}
                            className={`${CLASS_NAME}__widgets`}
                        />
                        <SvgPaperLayer layerRef={linkLayerRef}
                            className={`${CLASS_NAME}__linkGeometry`}
                            style={{overflow: 'visible'}}
                            paperTransform={paperTransform}
                            role='figure'>
                            <LinkMarkers model={model}
                                renderingState={renderingState}
                            />
                            <LinkLayer model={model}
                                renderingState={renderingState}
                            />
                        </SvgPaperLayer>
                        <CanvasPlaceLayer layer='overLinkGeometry'
                            context={placeLayerContext}
                            className={`${CLASS_NAME}__widgets`}
                        />
                        <LinkLabelLayer renderingState={renderingState}
                            paperTransform={paperTransform}
                            layerRef={labelLayerRef}
                        />
                        <CanvasPlaceLayer layer='overLinks'
                            context={placeLayerContext}
                            className={`${CLASS_NAME}__widgets`}
                        />
                        <ElementLayer layerRef={elementLayerRef}
                            model={model}
                            renderingState={renderingState}
                            paperTransform={paperTransform}
                        />
                        <CanvasPlaceLayer layer='overElements'
                            context={placeLayerContext}
                            className={`${CLASS_NAME}__widgets`}
                        />
                    </>
                )}
                watermark={
                    watermarkSvg ? (
                        <a href={watermarkUrl} target='_blank' rel='noreferrer'>
                            <img className={`${CLASS_NAME}__watermark`}
                                src={watermarkSvg}
                                draggable={false}
                            />
                        </a>
                    ) : null
                }>
                <CanvasPlaceLayerContext.Provider value={placeLayerContext}>
                    {children}
                </CanvasPlaceLayerContext.Provider>
            </Paper>
        </CanvasContext.Provider>
    );
}

interface ControllerProvidedState {
    readonly colorSchemeApi: ColorSchemeApi;
    readonly graphAnimations: GraphAnimations;
    readonly watermarkSvg: string | undefined;
    readonly zoomOptions: Required<ZoomOptions>;
}

class CanvasController implements CanvasApi {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<CanvasEvents>();
    readonly events: Events<CanvasEvents> = this.source;

    private _contentBounds: Rect = {x: 0, y: 0, width: 0, height: 0};
    private _pointerMode: CanvasPointerMode = 'panning';

    constructor(
        private model: DiagramModel,
        readonly renderingState: MutableRenderingState,
        private state: ControllerProvidedState,
        private setters: {
            readonly setContentBounds: (bounds: Rect) => void;
            readonly setPointerMode: (pointerMode: CanvasPointerMode) => void;
            readonly setGraphAnimations: (
                update: (previous: GraphAnimations) => GraphAnimations
            ) => void;
        },
        private readonly _paper: React.RefObject<Paper | null>,
        private readonly linkLayer: React.RefObject<SVGSVGElement | null>,
        private readonly labelLayer: React.RefObject<HTMLDivElement | null>,
        private readonly elementLayer: React.RefObject<HTMLDivElement | null>
    ) {
        const delayedAdjust = () => {
            renderingState.scheduleOnLayerUpdate(
                RenderingLayer.PaperArea,
                this.updateContentBounds
            );
        };
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
        this.listener.listen(renderingState.shared.events, 'findCanvas', e => {
            e.canvases.push(this);
        });
    }

    private get paper(): Paper {
        const paper = this._paper.current;
        if (!paper) {
            throw new Error('Reactodia: canvas paper is not initialized yet');
        }
        return paper;
    }

    stopListening() {
        this.listener.stopListening();
    }

    setProvidedState(state: ControllerProvidedState): void {
        this.state = state;
    }

    onChangeTransform = (previous: PaperTransform): void => {
        this.source.trigger('changeTransform', {previous, source: this});
        if (this.paper.metrics.transform.scale !== previous.scale) {
            this.source.trigger('changeScale', {previous: previous.scale, source: this});
        }
    };

    onContextMenu = (e: React.MouseEvent) => {
        if (!this.isEventFromCellLayer(e)) {
            return;
        }
        const cell = findCell(e.target, e.currentTarget, this.model);
        this.source.trigger('contextMenu', {
            source: this,
            sourceEvent: e,
            target: cell,
        });
    };

    onDragOver = (e: DragEvent, clientCoords: Vector): boolean => {
        if (this.renderingState.shared.hasHandlerForNextDropOnPaper()) {
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }
            return true;
        } else {
            const {x, y} = clientCoords;
            const position = this.metrics.clientToPaperCoords(x, y);
            let allowDrop = false;
            const event: CanvasDragoverEvent = {
                source: this,
                sourceEvent: e,
                position,
                allowDrop: () => {
                    allowDrop = true;
                },
            };
            this.source.trigger('dragover', event);
            return allowDrop;
        }
    };

    onDragDrop = (e: DragEvent, clientCoords: Vector): void => {
        const {x, y} = clientCoords;
        const position = this.metrics.clientToPaperCoords(x, y);
        const event: CanvasDropEvent = {
            source: this,
            sourceEvent: e,
            position,
        };
        if (this.renderingState.shared.tryHandleDropOnPaper(event)) {
            /* skip trigger -- already handled */
        } else {
            this.source.trigger('drop', event);
        }
    };

    onKeyDown = (e: React.KeyboardEvent) => {
        if (!this.isEventFromCellLayer(e)) {
            return;
        }
        this.source.trigger('keydown', {source: this, sourceEvent: e});
    };

    onKeyUp = (e: React.KeyboardEvent) => {
        if (!this.isEventFromCellLayer(e)) {
            return;
        }
        this.source.trigger('keyup', {source: this, sourceEvent: e});
    };

    onPointerOperation = (event: React.PointerEvent): PaperPointerOperation | undefined => {
        if (event.button !== LEFT_MOUSE_BUTTON) {
            return undefined;
        }

        let panning = false;
        let selection = false;
        let moveElement: PointerOperationState['moveElement'];
        let moveLink = false;

        const target = findCell(event.target, event.currentTarget, this.model);
        if (!target) {
            panning = this.shouldStartPanning(event);
            selection = !panning && this._pointerMode === 'selection';
        } else if (target instanceof Element) {
            const {x: pointerX, y: pointerY} = this.metrics.pageToPaperCoords(
                event.pageX, event.pageY
            );
            const {x: elementX, y: elementY} = target.position;
            moveElement = {pointerX, pointerY, elementX, elementY};
        } else if (target instanceof Link || target instanceof LinkVertex) {
            moveLink = true;
        }

        const restoreGeometry = RestoreGeometry.capture(this.model);
        const batch = this.model.history.startBatch(restoreGeometry.title);
        const state: PointerOperationState = {target, restoreGeometry, batch, panning, moveElement};
        return {
            action: (
                panning ? 'panning' :
                (selection || moveElement || moveLink) ? 'move' :
                undefined
            ),
            hasSameTarget: e => {
                const cell = findCell(e.target, e.currentTarget, this.model);
                return cell !== undefined && cell === target;
            },
            onPointerDown: e => {
                this.source.trigger('pointerDown', {source: this, sourceEvent: e, target, panning});
            },
            onPointerMove: e => this.onPointerMove(e, state),
            onPointerUp: (e, options) => this.onPointerUp(e, options, state),
            onPointerCancel: () => {
                state.batch.discard();
            },
        };
    };

    private shouldStartPanning(e: React.PointerEvent) {
        const requireShift = this._pointerMode === 'selection';
        return (
            e.pointerType === 'mouse' &&
            e.shiftKey === requireShift &&
            !(e.ctrlKey || e.altKey)
        );
    }

    private onPointerMove(e: PointerEvent, state: PointerOperationState): void {
        const {target, panning, moveElement} = state;
        if (!target) {
            this.source.trigger('pointerMove', {source: this, sourceEvent: e, target, panning});
        } else if (target instanceof Element) {
            if (moveElement) {
                const {x, y} = this.metrics.pageToPaperCoords(e.pageX, e.pageY);
                const {pointerX, pointerY, elementX, elementY} = moveElement;
                target.setPosition({
                    x: elementX + x - pointerX,
                    y: elementY + y - pointerY,
                });
                this.source.trigger('pointerMove', {source: this, sourceEvent: e, target, panning});
            }
        } else if (target instanceof Link) {
            const location = this.metrics.pageToPaperCoords(e.pageX, e.pageY);
            const linkVertex = this.generateLinkVertex(target, location);
            linkVertex.createAt(location);
            state.target = linkVertex;
        } else if (target instanceof LinkVertex) {
            const location = this.metrics.pageToPaperCoords(e.pageX, e.pageY);
            target.moveTo(location);
            this.source.trigger('pointerMove', {source: this, sourceEvent: e, target, panning});
        }
    };

    private generateLinkVertex(link: Link, location: Vector): LinkVertex {
        const {model, renderingState} = this;
        const previous = link.vertices;
        const vertices = previous ? [...previous] : [];
        const source = model.getElement(link.sourceId)!;
        const target = model.getElement(link.targetId)!;
        const polyline = computePolyline(
            renderingState.getElementShape(source),
            renderingState.getElementShape(target),
            vertices
        );
        const segmentIndex = findNearestSegmentIndex(polyline, location);
        return new LinkVertex(link, segmentIndex);
    }

    private onPointerUp(
        e: PointerEvent,
        options: { triggerAsClick: boolean },
        state: PointerOperationState
    ): void {
        const {triggerAsClick} = options;
        const {target, restoreGeometry, batch, panning} = state;
        this.source.trigger('pointerUp', {
            source: this,
            sourceEvent: e,
            target,
            panning,
            triggerAsClick,
        });

        const restore = restoreGeometry.filterOutUnchanged();
        if (restore.hasChanges()) {
            batch.history.registerToUndo(restore);
        }
        batch.store();
    }

    onResize = (): void => {
        this.source.trigger('resize', {source: this});
    };

    onScrollPassive = (e: Event) => {
        if (!this.isEventFromCellLayer(e)) {
            return;
        }
        this.source.trigger('scroll', {source: this, sourceEvent: e});
    };

    getWheelToScaleDelta = (e: WheelEvent): number | undefined => {
        return this.shouldZoom(e) ? wheelToScaleDeltaDefault(e) : undefined;
    };

    private shouldZoom(e: WheelEvent): boolean {
        const {requireCtrl} = this.zoomOptions;
        const target = e.target;
        if (requireCtrl) {
            return e.ctrlKey;
        } else if (e.ctrlKey) {
            return true;
        }
        return this.isEventFromCellLayer(e) && target instanceof Node && (
            this.paper.root === target ||
            this.paper.pane === target ||
            this.paper.pane?.firstChild === target ||
            (
                !hasScrollableParent(target, this.linkLayer.current) &&
                !hasScrollableParent(target, this.labelLayer.current) &&
                !hasScrollableParent(target, this.elementLayer.current)
            )
        );
    }

    get metrics(): CanvasMetrics {
        return this.paper.metrics;
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
        this.setters.setPointerMode(value);
        this.source.trigger('changePointerMode', {source: this, previous});
    }

    get zoomOptions(): Required<ZoomOptions> {
        return this.state.zoomOptions;
    }

    private updateContentBounds = (): void => {
        const {elements, links} = this.model;
        this._contentBounds = getContentFittingBox(elements, links, this.renderingState);
        this.setters.setContentBounds(this._contentBounds);
    };

    private isEventFromCellLayer(e: Event | React.SyntheticEvent): boolean {
        const target = e.target;
        return target instanceof Node && Boolean(
            this.paper.root === target ||
            this.paper.pane === target ||
            this.paper.pane?.firstChild === target ||
            this.linkLayer.current?.contains(target) ||
            this.labelLayer.current?.contains(target) ||
            this.elementLayer.current?.contains(target)
        );
    }

    focus(): void {
        this.paper.root?.focus({preventScroll: true});
    }

    async centerTo(paperPosition?: Vector, options: CenterToOptions = {}): Promise<void> {
        await this.renderingState.updateLayersUpTo(RenderingLayer.PaperArea);
        const {width, height} = this.paper.metrics.transform;
        const paperCenter = paperPosition || {x: width / 2, y: height / 2};
        return this.paper.centerViewport(paperCenter, options);
    }

    async centerContent(options: ViewportOptions = {}): Promise<void> {
        await this.renderingState.updateLayersUpTo(RenderingLayer.PaperArea);
        const bbox = this._contentBounds;
        return this.centerTo({
            x: bbox.x + bbox.width / 2,
            y: bbox.y + bbox.height / 2,
        }, options);
    }

    getScale(): number {
        return this.paper.scale;
    }

    setScale(value: number, options?: ScaleOptions): Promise<void> {
        return this.paper.setScale(value, options);
    }

    zoomBy(value: number, options?: ScaleOptions) {
        return this.setScale(this.getScale() + value, options);
    }

    zoomIn(scaleOptions?: ScaleOptions) {
        return this.zoomBy(this.state.zoomOptions.step, scaleOptions);
    }

    zoomOut(scaleOptions?: ScaleOptions) {
        return this.zoomBy(-this.state.zoomOptions.step, scaleOptions);
    }

    async zoomToFit(options: ViewportOptions = {}): Promise<void> {
        const {model, renderingState} = this;
        const {elements, links} = model;
        if (elements.length === 0) {
            return this.centerTo();
        }
        await this.renderingState.updateLayersUpTo(RenderingLayer.PaperArea);
        const bbox = getContentFittingBox(elements, links, renderingState);
        return this.zoomToFitRect(bbox, options);
    }

    zoomToFitRect(paperRect: Rect, options?: ViewportOptions): Promise<void> {
        const {fitPadding} = this.state.zoomOptions;
        const paddedRect: Rect = {
            x: paperRect.x - fitPadding,
            y: paperRect.y - fitPadding,
            width: paperRect.width + fitPadding,
            height: paperRect.height + fitPadding,
        };
        return this.paper.scaleToFitRect(paddedRect, options);
    }

    private makeToSVGOptions(baseOptions: ExportSvgOptions): ToSVGOptions {
        const bounds = this._contentBounds;
        const {
            contentPadding = {x: 100, y: 100},
            removeByCssSelectors = [],
        } = baseOptions;
        const linkLayer = this.linkLayer.current;
        const labelLayer = this.labelLayer.current;
        const elementLayer = this.elementLayer.current;
        if (!(linkLayer && labelLayer && elementLayer)) {
            throw new Error('Cannot find element, link or label layers to export');
        }
        return {
            colorSchemeApi: this.state.colorSchemeApi,
            styleRoot: linkLayer,
            contentBox: {
                x: bounds.x - contentPadding.x,
                y: bounds.y - contentPadding.y,
                width: bounds.width + contentPadding.x * 2,
                height: bounds.height + contentPadding.y * 2,
            },
            layers: [
                linkLayer,
                labelLayer,
                elementLayer,
            ],
            preserveDimensions: true,
            convertImagesToDataUris: true,
            removeByCssSelectors: [
                '[data-reactodia-no-export]',
                ...removeByCssSelectors
            ],
            watermarkSvg: this.state.watermarkSvg,
        };
    }

    exportSvg(options: ExportSvgOptions = {}): Promise<string> {
        return toSVG(this.makeToSVGOptions(options));
    }

    exportRaster(options: ExportRasterOptions = {}): Promise<string> {
        return toDataURL({...options, ...this.makeToSVGOptions(options)});
    }

    isAnimatingGraph(): boolean {
        return this.state.graphAnimations.count > 0;
    }

    animateGraph(setupChanges: () => void, duration?: number): Promise<void> {
        const timeout = typeof duration === 'number'
            ? duration : VIEWPORT_DEFAULTS.duration;
        this.changeGraphAnimationCount(+1, timeout);
        setupChanges();
        return delay(timeout).then(() => this.changeGraphAnimationCount(-1));
    }

    private changeGraphAnimationCount(change: number, newDuration?: number) {
        const beforeAnimating = this.isAnimatingGraph();
        flushSync(() => {
            this.setters.setGraphAnimations(previous => ({
                count: previous.count + change,
                duration: newDuration ?? previous.duration,
            }));
        });
        const afterAnimating = this.isAnimatingGraph();
        if (afterAnimating !== beforeAnimating) {
            this.source.trigger('changeAnimatingGraph', {source: this, previous: beforeAnimating});
        }
    }
}

interface GraphAnimations {
    readonly count: number;
    readonly duration?: number | undefined;
}

interface PointerOperationState {
    target: Cell | undefined;
    readonly restoreGeometry: RestoreGeometry;
    readonly batch: CommandBatch;
    readonly panning: boolean;
    readonly moveElement?: {
        readonly pointerX: number;
        readonly pointerY: number;
        readonly elementX: number;
        readonly elementY: number;
    } | undefined;
}

function zoomOptionsWithDefaults(zoomOptions: ZoomOptions = {}): Required<ZoomOptions> {
    return {
        min: zoomOptions.min ?? 0.2,
        max: zoomOptions.max ?? 2,
        maxFit: zoomOptions.maxFit ?? 1,
        step: zoomOptions.step ?? 0.1,
        fitPadding: zoomOptions.fitPadding ?? 20,
        requireCtrl: zoomOptions.requireCtrl ?? false,
    };
}

function findCell(bottom: EventTarget, top: globalThis.Element, model: DiagramModel): Cell | undefined {
    if (!(bottom instanceof globalThis.Element)) {
        return undefined;
    }
    let target: Node | null = bottom;
    let vertexIndex: number | undefined;
    while (true) {
        if (target instanceof globalThis.Element) {
            if (target.hasAttribute('data-element-id')) {
                return model.getElement(target.getAttribute('data-element-id')!);
            } else if (target.hasAttribute('data-link-id')) {
                const link = model.getLink(target.getAttribute('data-link-id')!);
                if (!link) {
                    return undefined;
                }
                return typeof vertexIndex === 'number' ? new LinkVertex(link, vertexIndex) : link;
            } else if (target.hasAttribute('data-vertex')) {
                vertexIndex = Number(target.getAttribute('data-vertex'));
            }
        }
        if (!target || target === top) { break; }
        target = target.parentNode;
    }
    return undefined;
}

function hasScrollableParent(target: Node, parent: Node | null): boolean {
    if (!(parent && parent.contains(target))) {
        return false;
    }
    let current: Node | null = target;
    while (current && current !== parent) {
        if (current instanceof window.Element) {
            const style = getComputedStyle(current);
            if (style.overflowX === 'scroll' || style.overflowY === 'scroll') {
                return true;
            }
        }
        current = current.parentNode;
    }
    return false;
}
