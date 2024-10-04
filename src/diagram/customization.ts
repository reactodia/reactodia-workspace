import type * as React from 'react';

import type { LinkTypeIri, PropertyTypeIri } from '../data/model';
import type * as Rdf from '../data/rdf/rdfModel';

import type { Element, ElementTemplateState, Link } from './elements';
import type { SizeProvider, Vector } from './geometry';
import type { GraphStructure } from './model';

/**
 * Selects a single preferred literal for the target language out of several candidates.
 *
 * Language code is specified as lowercase [BCP47](https://www.rfc-editor.org/rfc/rfc5646)
 * string (examples: `en`, `en-gb`, etc).
 *
 * @param labels candidate literal with same or different language codes
 * @param language target language code
 * @returns selected literal or `undefined` if no suitable literal was found
 */
export type LabelLanguageSelector =
    (labels: ReadonlyArray<Rdf.Literal>, language: string) => Rdf.Literal | undefined;

/**
 * Property with resolved label to display in the UI.
 */
export interface FormattedProperty {
    /**
     * Property IRI.
     */
    readonly propertyId: PropertyTypeIri;
    /**
     * Formatted property label.
     */
    readonly label: string;
    /**
     * Property values.
     */
    readonly values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;
}

/**
 * Provides a custom type style for an element with specific set of types.
 *
 * @param types sorted array of element type IRIs
 * @returns custom type style for the specific combination of element types or
 *     `undefined` if default style should be used
 */
export type TypeStyleResolver = (types: ReadonlyArray<string>) => TypeStyle | undefined;
/**
 * Provides a custom component to render element on a diagram.
 */
export type ElementTemplateResolver = (element: Element) => ElementTemplate | undefined;
/**
 * Provides a custom rendering on a diagram for links of specific type.
 */
export type LinkTemplateResolver = (linkTypeId: LinkTypeIri) => LinkTemplate | undefined;

/**
 * Common style for a type or set of types to display in various parts of the UI.
 */
export interface TypeStyle {
    /**
     * CSS color string.
     */
    readonly color?: string;
    /**
     * Icon image URL.
     */
    readonly icon?: string;
}

/**
 * Custom component to render a single diagram element.
 */
export type ElementTemplate = React.ComponentType<TemplateProps>;

/**
 * Props for a custom `ElementTemplate` component.
 *
 * @see ElementTemplate
 */
export interface TemplateProps {
    /**
     * Target element ID (`Element.id`).
     */
    readonly elementId: string;
    /**
     * Target element to render.
     */
    readonly element: Element;
    /**
     * Specifies whether element is in the expanded state.
     *
     * Same as `element.isExpanded`.
     */
    readonly isExpanded: boolean;
    /**
     * Template-specific state for the element.
     *
     * Same as `element.elementState`.
     */
    readonly elementState?: ElementTemplateState;
}

/**
 * Custom template to render links with the same link type. 
 */
export interface LinkTemplate {
    /**
     * SVG path marker style at the source of the link.
     */
    markerSource?: LinkMarkerStyle;
    /**
     * SVG path marker style at the target of the link.
     */
    markerTarget?: LinkMarkerStyle;
    /**
     * Renders the link component on SVG canvas.
     */
    renderLink(props: LinkTemplateProps): React.ReactNode;
}

/**
 * Custom style for SVG path markers at link ends.
 *
 * @see LinkTemplate
 */
export interface LinkMarkerStyle {
    /**
     * SVG path geometry for the marker.
     */
    readonly d?: string;
    /**
     * SVG marker width (px).
     */
    readonly width?: number;
    /**
     * SVG marker height (px).
     */
    readonly height?: number;
    /**
     * SVG marker fill (background) color.
     */
    readonly fill?: string;
    /**
     * SVG marker stroke (line) color.
     */
    readonly stroke?: string;
    /**
     * SVG marker stroke (line) thickness.
     */
    readonly strokeWidth?: string | number;
}

/**
 * Props for custom link template rendering.
 *
 * @see LinkTemplate.renderLink()
 */
export interface LinkTemplateProps {
    /**
     * Target link to render.
     */
    link: Link;
    /**
     * SVG path for the link geometry.
     */
    path: string;
    /**
     * Provides paper position along the link at the specified offset.
     *
     * Offset of `0.0` corresponds to the source
     * and `1.0` corresponds to the target of the link.
     */
    getPathPosition: (offset: number) => Vector;
    /**
     * SVG path marker for the link source.
     */
    markerSource: string;
    /**
     * SVG path marker for the link target.
     */
    markerTarget: string;
    /**
     * Route data (geometry) for the link.
     */
    route?: RoutedLink;
}

/**
 * Provides custom geometry for links based on connections between elements
 * and their positions and sizes.
 *
 * @category Core
 */
export interface LinkRouter {
    /**
     * Computes route data for each link of the specified `graph`.
     */
    route(graph: GraphStructure, sizeProvider: SizeProvider): RoutedLinks;
}

/**
 * Maps `Link.id` to the route data for that link.
 */
export type RoutedLinks = Map<string, RoutedLink>;

/**
 * Route data (geometry) for a link.
 */
export interface RoutedLink {
    /**
     * Target link ID (`Link.id`).
     */
    readonly linkId: string;
    /**
     * Override for the link vertices (`Link.vertices`).
     */
    readonly vertices: ReadonlyArray<Vector>;
    /**
     * Override for default text alignment for all link labels.
     */
    readonly labelTextAnchor?: 'start' | 'middle' | 'end';
}

/**
 * Provides a strategy to rename diagram links (change labels).
 */
export interface RenameLinkProvider {
    /**
     * Returns `true` if the target link has editable label.
     */
    canRename(link: Link): boolean;
    /**
     * Gets changed label for the link if renamed,
     * otherwise `undefined`.
     */
    getLabel(link: Link): string | undefined;
    /**
     * Sets changed label for the link.
     */
    setLabel(link: Link, label: string): void;
}
