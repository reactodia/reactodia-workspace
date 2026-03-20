import * as React from 'react';

import { Rect, Size, Vector } from './baseGeometry';

/**
 * Transformation data between paper and scrollable pane coordinates.
 *
 * @category Geometry
 */
export interface PaperTransform {
    readonly width: number;
    readonly height: number;
    readonly originX: number;
    readonly originY: number;
    readonly scale: number;
    readonly paddingX: number;
    readonly paddingY: number;
}

/**
 * Props for {@link HtmlPaperLayer} component.
 *
 * @see {@link HtmlPaperLayer}
 * @hidden
 */
export interface HtmlPaperLayerProps extends React.HTMLProps<HTMLDivElement> {
    paperTransform: PaperTransform;
    layerRef?: React.Ref<HTMLDivElement | null>;
}

/**
 * HTML layer to render its children on the diagram in paper coordinate system.
 *
 * **Unstable**: this component will likely change in the future.
 *
 * @category Components
 * @hidden
 */
export function HtmlPaperLayer(props: HtmlPaperLayerProps) {
    const {paperTransform, layerRef, style, children, ...otherProps} = props;
    const {originX, originY, scale} = paperTransform;
    let transformStyle: React.CSSProperties = {
        position: 'absolute', left: 0, top: 0,
        transform: `scale(${scale},${scale})translate(${originX}px,${originY}px)`,
    };
    if (style) {
        transformStyle = {...transformStyle, ...style};
    }
    return (
        <div
            ref={
                /* For compatibility with React 19 typings */
                layerRef as React.RefObject<HTMLDivElement>
            }
            style={transformStyle}
            {...otherProps}>
            {children}
        </div>
    );
}

/**
 * Props for {@link SvgPaperLayer} component.
 *
 * @see {@link SvgPaperLayer}
 * @hidden
 */
export interface SvgPaperLayerProps extends React.HTMLProps<SVGSVGElement> {
    paperTransform: PaperTransform;
    layerRef?: React.RefObject<SVGSVGElement | null>;
}

/**
 * SVG layer to render its children on the diagram in paper coordinate system.
 *
 * **Unstable**: this component will likely change in the future.
 *
 * @category Components
 * @hidden
 */
export function SvgPaperLayer(props: SvgPaperLayerProps) {
    const {layerRef, paperTransform, style, children, ...otherProps} = props;
    const {width, height, originX, originY, scale} = paperTransform;
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    let svgStyle: React.CSSProperties = {
        position: 'absolute',
        top: 0,
        left: 0,
    };
    if (style) {
        svgStyle = {...svgStyle, ...style};
    }
    return (
        <svg
            ref={
                /* For compatibility with React 19 typings */
                layerRef as React.RefObject<SVGSVGElement>
            }
            width={scaledWidth}
            height={scaledHeight}
            style={svgStyle}
            {...otherProps}>
            <g transform={`scale(${scale},${scale})translate(${originX},${originY})`}>
                {children}
            </g>
        </svg>
    );
}

export function emptyPane(pageSize: Size): PaperTransform {
    return {
        width: pageSize.width,
        height: pageSize.height,
        originX: 0,
        originY: 0,
        scale: 1,
        paddingX: 0,
        paddingY: 0,
    };
}

export function adjustPane(
    contentBounds: Rect,
    paneClientSize: Size,
    pageSize: Size,
    scale: number
): PaperTransform {
    // bbox in paper coordinates
    const bbox = contentBounds;
    const bboxLeft = bbox.x;
    const bboxTop = bbox.y;
    const bboxRight = bbox.x + bbox.width;
    const bboxBottom = bbox.y + bbox.height;

    const {width: gridWidth, height: gridHeight} = pageSize;

    // bbox in integer grid coordinates (open-closed intervals)
    const bboxGrid = {
        left: Math.floor(bboxLeft / gridWidth),
        top: Math.floor(bboxTop / gridHeight),
        right: Math.ceil(bboxRight / gridWidth),
        bottom: Math.ceil(bboxBottom / gridHeight),
    };

    return {
        width: Math.max(bboxGrid.right - bboxGrid.left, 1) * gridWidth,
        height: Math.max(bboxGrid.bottom - bboxGrid.top, 1) * gridHeight,
        originX: -bboxGrid.left * gridWidth,
        originY: -bboxGrid.top * gridHeight,
        paddingX: Math.ceil(paneClientSize.width),
        paddingY: Math.ceil(paneClientSize.height),
        scale,
    };
}

export function equalTransforms(a: PaperTransform, b: PaperTransform): boolean {
    return (
        a.width === b.width &&
        a.height === b.height &&
        a.originX === b.originX &&
        a.originY === b.originY &&
        a.paddingX === b.paddingX &&
        a.paddingY === b.paddingY &&
        a.scale === b.scale
    );
}

/**
 * @returns scrollable pane size in non-scaled pane coords.
 *
 * @category Geometry
 */
export function totalPaneSize(pt: PaperTransform): Vector {
    return {
        x: pt.width * pt.scale + pt.paddingX * 2,
        y: pt.height * pt.scale + pt.paddingY * 2,
    };
}

/**
 * @returns scrollable pane top-left corner position in non-scaled pane coords.
 *
 * @category Geometry
 */
export function paneTopLeft(pt: PaperTransform): Vector {
    return {x: -pt.paddingX, y: -pt.paddingY};
}

/**
 * Translates paper to scrollable pane coordinates.
 *
 * @category Geometry
 */
export function paneFromPaperCoords(paper: Vector, pt: PaperTransform): Vector {
    return {
        x: (paper.x + pt.originX) * pt.scale,
        y: (paper.y + pt.originY) * pt.scale,
    };
}

/**
 * Translates scrollable pane to paper coordinates.
 *
 * @category Geometry
 */
export function paperFromPaneCoords(pane: Vector, pt: PaperTransform): Vector {
    return {
        x: pane.x / pt.scale - pt.originX,
        y: pane.y / pt.scale - pt.originY,
    };
}
