import type { Vector, Rect, Size } from './baseGeometry';
import type { PaperTransform } from './paperLayers';

/**
 * Represents canvas viewport size and transformation.
 *
 * Allows to convert between different canvas coordinate types.
 */
export interface CanvasMetrics {
    /**
     * Sizes and offsets for the canvas area DOM element.
     */
    readonly pane: CanvasPaneMetrics;
    /**
     * Sizes and offsets for the canvas area DOM element.
     *
     * @deprecated Use {@link CanvasMetrics.pane} instead.
     */
    readonly area: CanvasPaneMetrics;
    /**
     * Gets transformation data between paper and scrollable pane coordinates.
     */
    readonly transform: PaperTransform;
    /**
     * Returns transformation data between paper and scrollable pane coordinates.
     *
     * @deprecated Use {@link CanvasMetrics.transform} instead.
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
 * Contains sizes and offsets for the canvas scrollable pane DOM element.
 */
export interface CanvasPaneMetrics {
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
