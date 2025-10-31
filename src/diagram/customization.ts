import type * as React from 'react';

import type { Element, ElementTemplateState, Link } from './elements';
import type { SizeProvider, Vector } from './geometry';
import type { GraphStructure } from './model';

/**
 * Provides a custom type style for an element with specific set of types.
 *
 * @param types sorted array of element type IRIs
 * @returns custom type style for the specific combination of element types or
 *     `undefined` if default style should be used
 */
export type TypeStyleResolver = (types: ReadonlyArray<string>) => TypeStyle | undefined;
/**
 * Provides a custom template to render an element (graph node) on the canvas.
 */
export type ElementTemplateResolver = (element: Element) =>
    ElementTemplate | ElementTemplateComponent | undefined;
/**
 * Provides a custom template to render a link (graph edge) on the canvas.
 */
export type LinkTemplateResolver = (link: Link) => LinkTemplate | undefined;

/**
 * Common style for a type or set of types to display in various parts of the UI.
 *
 * @see {@link TypeStyleResolver}
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
    /**
     * Whether the icon is assumed to be monochrome, so it can be
     * inverted for the dark theme.
     *
     * @default false
     */
    readonly iconMonochrome?: boolean;
}

/**
 * Custom template to render a single diagram element.
 */
export interface ElementTemplate {
    /**
     * Assumed shape type for the rendered diagram element to
     * correctly connect links and other geometry calculations.
     *
     * @default "rect"
     */
    readonly shape?: 'rect' | 'ellipse';
    /**
     * Renders the element on the normal (non-SVG) canvas layer.
     *
     * **Note**: this should be a pure function, not a React component by itself.
     */
    readonly renderElement: (props: TemplateProps) => React.ReactNode;
    /**
     * Describes a set of {@link TemplateProperties template state properties}
     * supported by the template.
     *
     * These capabilities are used by other components (e.g. selection actions, etc)
     * while the template itself, however, can read and change any template property
     * as needed.
     *
     * **Example**:
     * Element template which supports being expanded and resized
     * by the user:
     * ```ts
     * const MyTemplate: Reactodia.ElementTemplate = {
     *   renderElement: props => { ... },
     *   supports: {
     *     [Reactodia.TemplateProperties.Expanded]: true,
     *     [Reactodia.TemplateProperties.ElementSize]: true,
     *   }
     * }
     * ```
     *
     * @default {}
     */
    readonly supports?: Record<string, boolean>;
}

/**
 * Custom React component to render a single diagram element.
 *
 * @see {@link ElementTemplate}
 */
export type ElementTemplateComponent = React.ComponentType<TemplateProps>;

/**
 * Props for a custom {@link ElementTemplate} component.
 *
 * @see {@link ElementTemplate}
 */
export interface TemplateProps {
    /**
     * Target element ID ({@link Element.id}).
     */
    readonly elementId: string;
    /**
     * Target element to render.
     */
    readonly element: Element;
    /**
     * Specifies whether element is in the expanded state.
     *
     * Same as {@link Element.isExpanded}.
     *
     * Expanded state is stored in the {@link elementState element state}
     * with {@link TemplateProperties.Expanded} property.
     */
    readonly isExpanded: boolean;
    /**
     * Template-specific state for the element.
     *
     * Same as {@link Element.elementState}.
     */
    readonly elementState?: ElementTemplateState;
    /**
     * Whether the element is the only selected cell on the canvas.
     *
     * @see {@link DiagramModel.selection}
     */
    readonly onlySelected: boolean;
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
     * SVG path spline type between source and target elements:
     *  - `straight`: a spline with straight line segments,
     *  - `smooth`: a spline with cubic-bezier curve segments.
     *
     * @default "smooth"
     */
    spline?: 'straight' | 'smooth';
    /**
     * Renders the link component on SVG canvas layer.
     *
     * **Note**: this should be a pure function, not a React component by itself.
     */
    readonly renderLink: (props: LinkTemplateProps) => React.ReactNode;
}

/**
 * Custom style for SVG path markers at link ends.
 *
 * @see {@link LinkTemplate}
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
 * @see {@link LinkTemplate.renderLink}
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
 * Maps {@link Link.id} to the route data for that link.
 */
export type RoutedLinks = Map<string, RoutedLink>;

/**
 * Route data (geometry) for a link.
 */
export interface RoutedLink {
    /**
     * Target link ID ({@link Link.id}).
     */
    readonly linkId: string;
    /**
     * Override for the link vertices ({@link Link.vertices}).
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
