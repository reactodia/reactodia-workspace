import * as React from 'react';

import { ColorSchemeApi } from '../coreUtils/colorScheme';

import type { LinkTypeIri } from '../data/model';

import type { ZoomOptions } from '../diagram/canvasApi';
import type {
    ElementTemplate, ElementTemplateComponent, LinkTemplate, LinkRouter,
} from '../diagram/customization';
import { Element, Link } from '../diagram/elements';
import { PaperArea } from '../diagram/paperArea';
import { MutableRenderingState } from '../diagram/renderingState';

import { EntityElement, RelationGroup, RelationLink } from '../editor/dataElements';
import { OverlaySupport } from '../editor/overlayController';

import { useWorkspace } from '../workspace/workspaceContext';

import { AnnotationSupport } from './annotation';

/**
 * Props for {@link Canvas} component.
 *
 * @see {@link Canvas}
 */
export interface CanvasProps {
    /**
     * Custom provider to render diagram elements (graph nodes).
     *
     * **Default** is to render:
     *  - {@link AnnotationElement} with {@link NoteTemplate};
     *  - other elements with {@link StandardTemplate} which
     *    uses {@link StandardEntity} and {@link StandardEntityGroup}.
     */
    elementTemplateResolver?: TypedElementResolver;
    /**
     * Custom provider to render diagram links (graph edges).
     *
     * **Default** is to render:
     *  - {@link AnnotationLink} with {@link NoteLinkTemplate};
     *  - other links with {@link StandardLinkTemplate} which
     *    uses {@link StandardRelation}.
     */
    linkTemplateResolver?: TypedLinkResolver;
    /**
     * Custom provider to route (layout) diagram links on the diagram.
     *
     * **Default** is an {@link DefaultLinkRouter} instance.
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
     * Only applicable if {@link watermarkSvg} is set.
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
 * Provides a custom component to render an element on the diagram
 * based on the element itself and its type IRIs if the element is
 * an {@link EntityElement entity}.
 */
export type TypedElementResolver = (types: readonly string[], element: Element) =>
    ElementTemplate | ElementTemplateComponent | undefined;

/**
 * Provides a custom component to render a link on the diagram
 * based on the link itself and its type IRI if the link is
 * a {@link RelationLink relation}.
 */
export type TypedLinkResolver = (linkType: LinkTypeIri | undefined, link: Link) =>
    LinkTemplate | undefined;

const CLASS_NAME = 'reactodia-canvas';

/**
 * Component to display a canvas for the diagram with elements, links and additional widgets.
 *
 * @category Components
 */
export function Canvas(props: CanvasProps) {
    const {model, view, overlay, getCommandBus} = useWorkspace();
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
        linkTemplateResolver: linkTemplateResolver ? (
            link => {
                const linkType = (link instanceof RelationLink || link instanceof RelationGroup)
                    ? link.typeId : undefined;
                return linkTemplateResolver(linkType, link);
            }
        ) : undefined,
        linkRouter,
    }));

    const colorSchemeApi = React.useContext(ColorSchemeApi);

    return (
        <div className={CLASS_NAME}>
            <PaperArea model={model}
                renderingState={renderingState}
                colorSchemeApi={colorSchemeApi}
                zoomOptions={zoomOptions}
                hideScrollBars={!showScrollbars}
                watermarkSvg={watermarkSvg}
                watermarkUrl={watermarkUrl}>
                {children}
                <OverlaySupport overlay={overlay} />
                <AnnotationSupport getCommandBus={getCommandBus} />
            </PaperArea>
        </div>
    );
}
