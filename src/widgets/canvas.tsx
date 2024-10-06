import * as React from 'react';

import type { ZoomOptions } from '../diagram/canvasApi';
import type {
    LinkRouter, LinkTemplateResolver, ElementTemplate,
} from '../diagram/customization';
import { Element } from '../diagram/elements';
import { PaperArea } from '../diagram/paperArea';
import { MutableRenderingState } from '../diagram/renderingState';

import { EntityElement } from '../editor/dataElements';

import { useWorkspace } from '../workspace/workspaceContext';

/**
 * Props for `Canvas` component.
 *
 * @see Canvas
 */
export interface CanvasProps {
    /**
     * Custom provider to render diagram elements.
     *
     * **Default** is to render elements with `StandardTemplate`.
     */
    elementTemplateResolver?: TypedElementResolver;
    /**
     * Custom provider to render diagram links of a specific type.
     *
     * **Default** is to render links with `DefaultLinkTemplate` which uses
     * `DefaultLinkPathTemplate` for the link itself.
     */
    linkTemplateResolver?: LinkTemplateResolver;
    /**
     * Custom provider to route (layout) diagram links on the diagram.
     *
     * **Default** is an `DefaultLinkRouter` instance.
     */
    linkRouter?: LinkRouter;
    /**
     * Whether to show scrollbars for the canvas viewport.
     *
     * @default false
     */
    showScrollbars?: boolean;
    /**
     * Options for the scale-affecting operations on the canvas.
     */
    zoomOptions?: ZoomOptions;
    /**
     * SVG image source to display as a watermark in the top-right
     * corner of the canvas.
     *
     * **Default** is no watermark.
     */
    watermarkSvg?: string;
    /**
     * Link URL to open on a click on the watermark image.
     *
     * Only applicable if `watermarkSvg` is set.
     *
     * **Default** is no link on the watermark.
     */
    watermarkUrl?: string;
    /**
     * Canvas widgets to display alongside the diagram cells.
     *
     * Non-widget child elements will be ignored with an console-emitted warning.
     */
    children?: React.ReactNode;
}

/**
 * Provides a custom component to render element on a diagram
 * based on the element itself and its type IRIs if the element is an entity.
 */
export type TypedElementResolver = (types: readonly string[], element: Element) => ElementTemplate | undefined;

const CLASS_NAME = 'reactodia-canvas';

/**
 * Component to display a canvas for the diagram with elements, links and additional widgets.
 *
 * @category Components
 */
export function Canvas(props: CanvasProps) {
    const {model, view} = useWorkspace();
    const {
        elementTemplateResolver, linkTemplateResolver, linkRouter,
        showScrollbars, zoomOptions, watermarkSvg, watermarkUrl, children,
    } = props;

    const [renderingState] = React.useState(() => new MutableRenderingState({
        model,
        shared: view,
        elementTemplateResolver: elementTemplateResolver ? (
            element => {
                const data = element instanceof EntityElement ? element.data : undefined;
                return elementTemplateResolver(data?.types ?? [], element);
            }
        ) : undefined,
        linkTemplateResolver,
        linkRouter,
    }));

    return (
        <div className={CLASS_NAME}>
            <PaperArea model={model}
                renderingState={renderingState}
                zoomOptions={zoomOptions}
                hideScrollBars={!showScrollbars}
                watermarkSvg={watermarkSvg}
                watermarkUrl={watermarkUrl}>
                {children}
            </PaperArea>
        </div>
    );
}
