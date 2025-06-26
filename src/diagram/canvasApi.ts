import * as React from 'react';

import { Events, PropertyChange } from '../coreUtils/events';

import type { RenderingState } from './renderingState';
import type { Cell } from './elements';
import type { Vector, Rect, Size } from './geometry';
import type { DiagramModel } from './model';
import type { PaperTransform } from './paper';
import type { ToDataURLOptions } from './toSvg';

/**
 * Describes an API to interact with a scrollable graph canvas.
 *
 * @category Core
 */
export interface CanvasApi {
    /**
     * Events for the scrollable graph canvas.
     */
    readonly events: Events<CanvasEvents>;
    /**
     * Canvas-specific state for rendering graph content (elements, links, etc).
     */
    readonly renderingState: RenderingState;
    /**
     * Live state for the current viewport size and transformation.
     * 
     * Allows to convert between different canvas coordinate types.
     *
     * This state can be captured to provide freezed state via {@link CanvasMetrics.snapshot}.
     */
    readonly metrics: CanvasMetrics;
    /**
     * Options for the scale-affecting operations on the canvas.
     */
    readonly zoomOptions: Required<ZoomOptions>;
    /**
     * Default action on moving pointer with pressed main button.
     *
     * Initial mode is `panning`.
     */
    readonly pointerMode: CanvasPointerMode;
    /**
     * Sets default action on moving pointer with pressed main button.
     */
    setPointerMode(value: CanvasPointerMode): void;
    /**
     * Sets the focus on the graph canvas itself to be able to handle keyboard interaction
     * within its layers.
     */
    focus(): void;
    /**
     * Changes the viewport such that its center is aligned to specified point
     * in paper coordinates.
     *
     * If no point is specified, aligns the viewport center with the canvas center instead.
     */
    centerTo(
        paperPosition?: Vector,
        options?: CenterToOptions
    ): Promise<void>;
    /**
     * Changes the viewport such that center of the bounding box for the graph content
     * is aligned to the viewport center.
     */
    centerContent(options?: ViewportOptions): Promise<void>;
    /**
     * Returns the current scale of the graph content in relation to the viewport.
     */
    getScale(): number;
    /**
     * Changes the viewport to set specific scale of the graph content.
     *
     * If `pivot` is specified, the viewport is changed as if the canvas was
     * zoomed-in or zoomed-out at that point of the canvas
     * (e.g. by mouse wheel or pinch-zoom at the pivot).
     */
    setScale(value: number, options?: ScaleOptions): Promise<void>;
    /**
     * Same as {@link CanvasApi.setScale setScale()} but relative to the current scale value.
     *
     * @see {@link CanvasApi.setScale}
     */
    zoomBy(value: number, options?: ScaleOptions): Promise<void>;
    /**
     * Same as {@link CanvasApi.zoomBy zoomBy()} with a positive zoom step value.
     *
     * @see {@link CanvasApi.zoomBy}
     */
    zoomIn(scaleOptions?: ScaleOptions): Promise<void>;
    /**
     * Same as {@link CanvasApi.zoomBy zoomBy()} with a negative zoom step value.
     *
     * @see {@link CanvasApi.zoomBy}
     */
    zoomOut(scaleOptions?: ScaleOptions): Promise<void>;
    /**
     * Changes the viewport to fit the whole graph content if possible.
     *
     * If the diagram is empty, centers the viewport at the middle of the canvas.
     *
     * @see {@link CanvasApi.zoomToFitRect}
     */
    zoomToFit(options?: ViewportOptions): Promise<void>;
    /**
     * Changes the viewport to fit specified rectangle area in paper coordinates if possible.
     *
     * @see {@link CanvasApi.zoomToFit}
     */
    zoomToFitRect(paperRect: Rect, options?: ViewportOptions): Promise<void>;
    /**
     * Exports the diagram as a serialized into text SVG document
     * with `<foreignObject>` HTML layers inside.
     *
     * Exported SVG document would include all diagram content as well as every CSS rule
     * which applies to any DOM element from the diagram content.
     */
    exportSvg(options?: ExportSvgOptions): Promise<string>;
    /**
     * Exports the diagram as a rendered raster image (e.g. PNG, JPEG, etc)
     * serialized into base64-encoded [data URL](https://developer.mozilla.org/en-US/docs/Web/URI/Schemes/data).
     */
    exportRaster(options?: ExportRasterOptions): Promise<string>;
    /**
     * Returns `true` if there is an active animation for graph or links on the canvas;
     * otherwise `false`.
     *
     * @see {@link CanvasApi.animateGraph}
     */
    isAnimatingGraph(): boolean;
    /**
     * Starts animation for graph elements and links.
     *
     * @param setupChanges immediately called function to perform animatable changes on graph
     * @param duration duration animation duration in milliseconds (default is `500`)
     * @returns promise which resolves when this animation ends
     *
     * **Example**:
     * ```js
     * // Animate element movement by 200px (in paper coordinates) on the x-axis
     * const target = model.getElement(...);
     * canvas.animateGraph(() => {
     *     const {x, y} = target.position;
     *     target.setPosition(x + 200, y);
     * });
     * ```
     */
    animateGraph(setupChanges: () => void, duration?: number): Promise<void>;
}

/**
 * Event data for {@link CanvasApi} events.
 *
 * @see {@link CanvasApi}
 */
export interface CanvasEvents {
    /**
     * Triggered on [pointer down](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointerdown_event)
     * event in the canvas.
     */
    pointerDown: CanvasPointerEvent;
    /**
     * Triggered on [pointer move](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointermove_event)
     * event in the canvas.
     */
    pointerMove: CanvasPointerEvent;
    /**
     * Triggered on [pointer up](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointerup_event)
     * event in the canvas.
     */
    pointerUp: CanvasPointerUpEvent;
    /**
     * Triggered on [scroll](https://developer.mozilla.org/en-US/docs/Web/API/Element/scroll_event)
     * event in the canvas.
     */
    scroll: CanvasScrollEvent;
    /**
     * Triggered on [drop](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/drop_event)
     * event from a drag and drop operation on the canvas.
     */
    drop: CanvasDropEvent;
    /**
     * Triggered on [contextmenu](https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event/)
     * event (opening a context menu) in the canvas.
     */
    contextMenu: CanvasContextMenuEvent;
    /**
     * Triggered on canvas viewport resize, tracked by a
     * [ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver).
     */
    resize: CanvasResizeEvent;
    /**
     * Triggered on [keydown](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event/)
     * event in the canvas.
     */
    keydown: CanvasKeyboardEvent;
    /**
     * Triggered on [keyup](https://developer.mozilla.org/en-US/docs/Web/API/Element/keyup_event/)
     * event in the canvas.
     */
    keyup: CanvasKeyboardEvent;
    /**
     * Triggered on {@link CanvasApi.isAnimatingGraph} property change.
     */
    changeAnimatingGraph: PropertyChange<CanvasApi, boolean>;
    /**
     * Triggered on {@link CanvasApi.pointerMode} property change.
     */
    changePointerMode: PropertyChange<CanvasApi, CanvasPointerMode>;
    /**
     * Triggered on {@link CanvasApi.getScale} property change.
     */
    changeScale: PropertyChange<CanvasApi, number>;
}

/**
 * Event data for canvas pointer events.
 */
export interface CanvasPointerEvent {
    /**
     * Event source (canvas).
     */
    readonly source: CanvasApi;
    /**
     * Original (raw) event data.
     */
    readonly sourceEvent: React.MouseEvent<Element> | MouseEvent;
    /**
     * Pointer event target (element, link, link vertex).
     *
     * If `undefined` then the pointer event target is an empty canvas space.
     */
    readonly target: Cell | undefined;
    /**
     * `true` if event triggered while viewport is being panned (moved);
     * otherwise `false`.
     */
    readonly panning: boolean;
}

/**
 * Event data for canvas pointer up event.
 */
export interface CanvasPointerUpEvent extends CanvasPointerEvent {
    /**
     * `true` if the pointer up event should be considered as a "click"
     * on the target because it immediately follows pointer down event
     * without any pointer moves in-between.
     */
    readonly triggerAsClick: boolean;
}

/**
 * Event data for canvas scroll event.
 */
export interface CanvasScrollEvent {
    /**
     * Event source (canvas).
     */
    readonly source: CanvasApi;
    /**
     * Original (raw) event data.
     */
    readonly sourceEvent: Event;
}

/**
 * Event data for canvas drop event from a drag and drop operation.
 */
export interface CanvasDropEvent {
    /**
     * Event source (canvas).
     */
    readonly source: CanvasApi;
    /**
     * Original (raw) event data.
     */
    readonly sourceEvent: DragEvent;
    /**
     * Position of the drop in paper coordinates.
     */
    readonly position: Vector;
}

/**
 * Event data for canvas context menu open request event.
 */
export interface CanvasContextMenuEvent {
    /**
     * Event source (canvas).
     */
    readonly source: CanvasApi;
    /**
     * Original (raw) event data.
     */
    readonly sourceEvent: React.MouseEvent;
    /**
     * Pointer event target (element, link, link vertex).
     *
     * If `undefined` then the pointer event target is an empty canvas space.
     */
    readonly target: Cell | undefined;
}

/**
 * Event data for canvas viewport resize event.
 */
export interface CanvasResizeEvent {
    /**
     * Event source (canvas).
     */
    readonly source: CanvasApi;
}

export interface CanvasKeyboardEvent {
    /**
     * Event source (canvas).
     */
    readonly source: CanvasApi;
    /**
     * Original (raw) event data.
     */
    readonly sourceEvent: React.KeyboardEvent;
}

/**
 * Represents canvas viewport size and transformation.
 *
 * Allows to convert between different canvas coordinate types.
 */
export interface CanvasMetrics {
    /**
     * Sizes and offsets for the canvas area DOM element.
     */
    readonly area: CanvasAreaMetrics;
    /**
     * Returns transformation data between paper and scrollable pane coordinates.
     */
    getTransform(): PaperTransform;
    /**
     * Returns a immutable instance of this metrics which is guaranteed to
     * never change even if original canvas viewport changes.
     */
    snapshot(): CanvasMetrics;
    /**
     * Returns paper size in paper coordinates.
     */
    getPaperSize(): Size;
    /**
     * Returns viewport bounds in page coordinates.
     */
    getViewportPageRect(): Rect;
    /**
     * Translates page to paper coordinates.
     */
    pageToPaperCoords(pageX: number, pageY: number): Vector;
    /**
     * Translates paper to page coordinates.
     */
    paperToPageCoords(paperX: number, paperY: number): Vector;
    /**
     * Translates client (viewport) to paper coordinates.
     */
    clientToPaperCoords(areaClientX: number, areaClientY: number): Vector;
    /**
     * Translates client (viewport) to scrollable pane coordinates.
     */
    clientToScrollablePaneCoords(areaClientX: number, areaClientY: number): Vector;
    /**
     * Translates scrollable pane to client (viewport) coordinates.
     */
    scrollablePaneToClientCoords(paneX: number, paneY: number): Vector;
    /**
     * Translates scrollable pane to paper coordinates.
     */
    scrollablePaneToPaperCoords(paneX: number, paneY: number): Vector;
    /**
     * Translates paper to scrollable pane coordinates.
     */
    paperToScrollablePaneCoords(paperX: number, paperY: number): Vector;
}

/**
 * Contains sizes and offsets for the canvas area DOM element.
 */
export interface CanvasAreaMetrics {
    /**
     * Canvas area [client width](https://developer.mozilla.org/en-US/docs/Web/API/Element/clientWidth).
     */
    readonly clientWidth: number;
    /**
     * Canvas area [client height](https://developer.mozilla.org/en-US/docs/Web/API/Element/clientHeight).
     */
    readonly clientHeight: number;
    /**
     * Canvas area [offset width](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/offsetWidth).
     */
    readonly offsetWidth: number;
    /**
     * Canvas area [offset height](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/offsetHeight).
     */
    readonly offsetHeight: number;
    /**
     * Canvas area [scroll width](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollWidth).
     */
    readonly scrollLeft: number;
    /**
     * Canvas area [scroll height](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollHeight).
     */
    readonly scrollTop: number;
}

/**
 * Action on moving pointer with pressed main button:
 *   - `panning` - pans the viewport over canvas;
 *   - `selection` - starts selection of the cells on canvas.
 *
 * This mode may be changed to another while `Shift` button is being held
 * (this should be implemented separately when the property value is used
 * in other components).
 */
export type CanvasPointerMode = 'panning' | 'selection';

/**
 * Options for {@link CanvasApi} methods affecting the viewport.
 */
export interface ViewportOptions {
    /**
     * True if operation should be animated.
     *
     * If duration is provided and greater than zero then defaults to `true`,
     * otherwise it is set to `false`.
     */
    animate?: boolean;
    /**
     * Animation duration in milliseconds.
     *
     * Implicitly sets `animate: true` if greater than zero.
     *
     * @default 500
     */
    duration?: number;
}

/**
 * Options for {@link CanvasApi.centerTo} method.
 */
export interface CenterToOptions extends ViewportOptions {
    /**
     * Scale to set when changing the viewport.
     */
    scale?: number;
}

/**
 * Options for {@link CanvasApi} methods affecting canvas scale.
 */
export interface ScaleOptions extends ViewportOptions {
    /**
     * Scale pivot position in paper coordinates.
     */
    pivot?: Vector;
}

/**
 * Options for the behavior of operation affecting scale on the canvas.
 */
export interface ZoomOptions {
    /**
     * Minimum scale factor.
     *
     * @default 0.2
     */
    min?: number;
    /**
     * Maximum scale factor.
     *
     * @default 2
     */
    max?: number;
    /**
     * Same as `max` but used only for zoom-to-fit to limit the scale factor
     * on small diagrams.
     *
     * @default 1
     */
    maxFit?: number;
    /**
     * Scale step for the zoom-in and zoom-out operations.
     *
     * @default 0.1
     */
    step?: number;
    /**
     * Padding from each viewport border for zoom-to-fit scaling.
     *
     * @default 20
     */
    fitPadding?: number;
    /**
     * Whether `Ctrl`/`Cmd` keyboard key should be held to zoom
     * with the mouse wheel.
     *
     * If `true`, the mouse wheel will be used to scroll viewport
     * horizontally or vertically if `Shift` is held;
     * otherwise the wheel action will be inverted.
     *
     * @default true
     */
    requireCtrl?: boolean;
}

/**
 * Options for exporting diagram as SVG image.
 *
 * @see {@link CanvasApi.exportSvg}
 */
export interface ExportSvgOptions {
    /**
     * Padding size (in pixels) around the content for the exported diagram.
     *
     * @default {x: 100, y: 100}
     */
    contentPadding?: Vector;
    /**
     * CSS selectors to exclude specific DOM elements from the exported diagram.
     *
     * By default, any element with `data-reactodia-no-export` is removed.
     *
     * @default ["[data-reactodia-no-export]"]
     */
    removeByCssSelectors?: ReadonlyArray<string>;
    /**
     * Whether to prepend XML encoding header to the exported SVG string.
     *
     * Prepended header:
     * ```xml
     * <?xml version="1.0" encoding="UTF-8"?>
     * ```
     *
     * @default false
     */
    addXmlHeader?: boolean;
}

/**
 * Options for exporting diagram as raster image (e.g. JPEG, PNG, etc).
 *
 * @see {@link CanvasApi.exportRaster}
 */
export interface ExportRasterOptions extends ExportSvgOptions, ToDataURLOptions {}

/**
 * Canvas widget layer to render widget:
 *   - `viewport` - topmost layer, uses client (viewport) coordinates and
 *     does not scale or scroll with the diagram;
 *   - `overElements` - displayed over both elements and links, uses paper coordinates,
 *     scales and scrolls with the diagram;
 *   - `overLinks` - displayed under elements but over links, uses paper coordinates,
 *     scales and scrolls with the diagram.
 */
export type CanvasWidgetAttachment = 'viewport' | 'overElements' | 'overLinks';

/**
 * Describes canvas widget element to render on the specific widget layer.
 */
export interface CanvasWidgetDescription {
    /**
     * Canvas widget element to render.
     */
    element: React.ReactElement;
    /**
     * Canvas widget layer to render widget on.
     */
    attachment: CanvasWidgetAttachment;
}

/**
 * Represents a context for everything rendered inside the canvas,
 * including diagram content and widgets.
 */
export interface CanvasContext {
    /**
     * The canvas API.
     */
    readonly canvas: CanvasApi;
    /**
     * Model for the diagram displayed by the canvas.
     */
    readonly model: DiagramModel;
}

/** @hidden */
export const CanvasContext = React.createContext<CanvasContext | null>(null);

/**
 * React hook to get current canvas context.
 *
 * Throws an error if called from component which is outside the canvas.
 *
 * @category Hooks
 */
export function useCanvas(): CanvasContext {
    const context = React.useContext(CanvasContext);
    if (!context) {
        throw new Error('Missing Reactodia canvas context');
    }
    return context;
}
