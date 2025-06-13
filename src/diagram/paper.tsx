import * as React from 'react';

import { Cell, LinkVertex } from './elements';
import { Vector } from './geometry';
import { DiagramModel } from './model';

export interface PaperProps {
    model: DiagramModel;
    paperTransform: PaperTransform;
    onPointerDown?: (e: React.PointerEvent<HTMLElement>, cell: Cell | undefined) => void;
    onContextMenu?: (e: React.MouseEvent<HTMLElement>, cell: Cell | undefined) => void;
    onScrollCapture?: (e: React.UIEvent<HTMLElement>, cell: Cell | undefined) => void;
    children: React.ReactNode;
}

const CLASS_NAME = 'reactodia-paper';

export class Paper extends React.Component<PaperProps> {
    render() {
        const {paperTransform, children} = this.props;
        const {width, height, scale, paddingX, paddingY} = paperTransform;

        const scaledWidth = width * scale;
        const scaledHeight = height * scale;
        // using padding instead of margin in combination with setting width and height
        // on .paper element to avoid "over-constrained" margins, see an explanation here:
        // https://stackoverflow.com/questions/11695354
        const style: React.CSSProperties = {
            width: scaledWidth + paddingX,
            height: scaledHeight + paddingY,
            marginLeft: paddingX,
            marginTop: paddingY,
            paddingRight: paddingX,
            paddingBottom: paddingY,
        };
        

        return (
            <div className={CLASS_NAME}
                style={style}
                onPointerDown={this.onPointerDown}
                onContextMenu={this.onContextMenu}
                onScrollCapture={this.onScrollCapture}>
                {children}
            </div>
        );
    }

    private onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        const {model, onPointerDown} = this.props;
        if (onPointerDown) {
            const cell = e.target instanceof Element
                ? findCell(e.target, e.currentTarget, model)
                : undefined;
            onPointerDown(e, cell);
        }
    };

    private onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
        const {model, onContextMenu} = this.props;
        if (onContextMenu) {
            const cell = e.target instanceof Element
                ? findCell(e.target, e.currentTarget, model)
                : undefined;
            onContextMenu(e, cell);
        }
    };

    private onScrollCapture = (e: React.UIEvent<HTMLElement>) => {
        const {model, onScrollCapture} = this.props;
        if (onScrollCapture) {
            const cell = e.target instanceof Element
                ? findCell(e.target, e.currentTarget, model)
                : undefined;
            onScrollCapture(e, cell);
        }
    };
}

function findCell(bottom: Element, top: Element, model: DiagramModel): Cell | undefined {
    let target: Node | null = bottom;
    let vertexIndex: number | undefined;
    while (true) {
        if (target instanceof Element) {
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
