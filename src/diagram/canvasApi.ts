import * as React from 'react';

import { Events, PropertyChange } from '../coreUtils/events';

import type { RenderingState } from './renderingState';
import type { Cell } from './elements';
import type { Vector, Rect } from './geometry';
import type { DiagramModel } from './model';
import type { PaperTransform } from './paper';
import type { ToDataURLOptions } from './toSvg';
import type { DiagramView } from './view';

export interface CanvasApi {
    readonly events: Events<CanvasEvents>;
    readonly renderingState: RenderingState;
    readonly metrics: CanvasMetrics;
    centerTo(
        paperPosition?: Vector,
        options?: CenterToOptions
    ): Promise<void>;
    centerContent(options?: ViewportOptions): Promise<void>;
    getScale(): number;
    setScale(value: number, options?: ScaleOptions): Promise<void>;
    zoomBy(value: number, options?: ScaleOptions): Promise<void>;
    zoomIn(scaleOptions?: ScaleOptions): Promise<void>;
    zoomOut(scaleOptions?: ScaleOptions): Promise<void>;
    zoomToFit(options?: ViewportOptions): Promise<void>;
    zoomToFitRect(paperRect: Rect, options?: ViewportOptions): Promise<void>;
    exportSvg(): Promise<string>;
    exportPng(options: ToDataURLOptions): Promise<string>;
    isAnimatingGraph(): boolean;
    /**
     * Starts animation for graph elements and links.
     *
     * @param setupChanges immediately called function to perform animatable changes on graph
     * @param duration animation duration in milliseconds (requires custom CSS to override)
     * @returns promise which resolves when this animation ends
     */
    animateGraph(setupChanges: () => void, duration?: number): Promise<void>;
}

export interface CanvasEvents {
    pointerDown: CanvasPointerEvent;
    pointerMove: CanvasPointerEvent;
    pointerUp: CanvasPointerUpEvent;
    scroll: CanvasScrollEvent;
    drop: CanvasDropEvent;
    contextMenu: CanvasContextMenuEvent;
    changeAnimatingGraph: PropertyChange<CanvasApi, boolean>;
    changeScale: PropertyChange<CanvasApi, number>;
}

export interface CanvasPointerEvent {
    readonly source: CanvasApi;
    readonly sourceEvent: React.MouseEvent<Element> | MouseEvent;
    readonly target: Cell | undefined;
    readonly panning: boolean;
}

export interface CanvasPointerUpEvent extends CanvasPointerEvent {
    readonly triggerAsClick: boolean;
}

export interface CanvasScrollEvent {
    readonly source: CanvasApi;
    readonly sourceEvent: Event;
}

export interface CanvasDropEvent {
    readonly source: CanvasApi;
    readonly sourceEvent: DragEvent;
    readonly position: Vector;
}

export interface CanvasContextMenuEvent {
    readonly source: CanvasApi;
    readonly sourceEvent: React.MouseEvent;
    readonly target: Cell | undefined;
}

export interface CanvasMetrics {
    readonly area: CanvasAreaMetrics;
    getTransform(): PaperTransform;
    snapshot(): CanvasMetrics;
    getPaperSize(): { width: number; height: number };
    pageToPaperCoords(pageX: number, pageY: number): Vector;
    clientToPaperCoords(areaClientX: number, areaClientY: number): Vector;
    clientToScrollablePaneCoords(areaClientX: number, areaClientY: number): Vector;
    scrollablePaneToPaperCoords(paneX: number, paneY: number): Vector;
    paperToScrollablePaneCoords(paperX: number, paperY: number): Vector;
}

export interface CanvasAreaMetrics {
    readonly clientWidth: number;
    readonly clientHeight: number;
    readonly offsetWidth: number;
    readonly offsetHeight: number;
    readonly scrollLeft: number;
    readonly scrollTop: number;
}

export interface ViewportOptions {
    /**
     * True if operation should be animated.
     * If duration is not provided assumes default one.
     */
    animate?: boolean;
    /**
     * Animation duration in milliseconds.
     * Implicitly sets `animate: true` if greater than zero.
     */
    duration?: number;
}

export interface CenterToOptions extends ViewportOptions {
    scale?: number;
}

export interface ScaleOptions extends ViewportOptions {
    pivot?: Vector;
}

export type CanvasWidgetAttachment = 'viewport' | 'overElements' | 'overLinks';

export interface CanvasWidgetDescription {
    element: React.ReactElement;
    attachment: CanvasWidgetAttachment;
}

export interface CanvasContext {
    readonly canvas: CanvasApi;
    readonly model: DiagramModel;
    readonly view: DiagramView;
}

export const CanvasContext = React.createContext<CanvasContext | null>(null);
