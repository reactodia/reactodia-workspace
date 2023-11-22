import * as React from 'react';

import type { ElementModel, LinkModel, PropertyTypeIri } from '../data/model';
import type * as Rdf from '../data/rdf/rdfModel';

import type { ElementTemplateState, Link, LinkTemplateState } from './elements';
import type { SizeProvider } from './geometry';
import type { GraphStructure } from './model';

export type TypeStyleResolver = (types: ReadonlyArray<string>) => TypeStyle | undefined;
export type ElementTemplateResolver = (types: ReadonlyArray<string>) => ElementTemplate | undefined;
export type LinkTemplateResolver = (linkType: string) => LinkTemplate | undefined;

export interface TypeStyle {
    readonly color?: string;
    readonly icon?: string;
}

export type ElementTemplate = React.ComponentType<TemplateProps>;

export interface TemplateProps {
    readonly elementId: string;
    readonly data: ElementModel;
    readonly color: string;
    readonly iconUrl?: string;
    readonly isExpanded: boolean;
    readonly elementState?: ElementTemplateState;
}

export interface FormattedProperty {
    readonly propertyId: PropertyTypeIri;
    readonly label: string;
    readonly values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;
}

export interface LinkTemplate {
    markerSource?: LinkMarkerStyle;
    markerTarget?: LinkMarkerStyle;
    renderLink?(
        data: LinkModel,
        state: LinkTemplateState | undefined,
        factory: Rdf.DataFactory
    ): LinkStyle;
    setLinkLabel?: (link: Link, label: string) => void;
}

export interface LinkStyle {
    readonly connection?: {
        /** @default "none" */
        readonly fill?: string;
        /** @default "black" */
        readonly stroke?: string;
        readonly strokeWidth?: number;
        readonly strokeDasharray?: string;
    };
    readonly label?: LinkLabelStyle;
    readonly properties?: ReadonlyArray<LinkLabelStyle>;
}

export interface LinkRouter {
    route(model: GraphStructure, sizeProvider: SizeProvider): RoutedLinks;
}

export type RoutedLinks = Map<string, RoutedLink>;

export interface RoutedLink {
    readonly linkId: string;
    readonly vertices: ReadonlyArray<Vertex>;
    readonly labelTextAnchor?: 'start' | 'middle' | 'end';
}

export interface Vertex {
    readonly x: number;
    readonly y: number;
}

export interface LinkMarkerStyle {
    readonly d?: string;
    readonly width?: number;
    readonly height?: number;
    readonly fill?: string;
    readonly stroke?: string;
    readonly strokeWidth?: string;
}

export interface LinkLabelStyle {
    /** @default 0.5 */
    readonly position?: number;
    readonly label?: ReadonlyArray<Rdf.Literal>;
    readonly title?: string;
    readonly background?: {
        /** @default "white" */
        readonly fill?: string;
        /** @default "none" */
        readonly stroke?: string;
        /** @default 0 */
        readonly strokeWidth?: number;
    };
    readonly text?: {
        /** @default "black" */
        readonly fill?: string;
        /** @default "none" */
        readonly stroke?: string;
        /** @default 0 */
        readonly strokeWidth?: number;
        /** @default '"Helvetica Neue", "Helvetica", "Arial", sans-serif' */
        readonly fontFamily?: React.CSSProperties['fontFamily'];
        /** @default "inherit" */
        readonly fontSize?: React.CSSProperties['fontSize'];
        /** @default "normal" */
        readonly fontStyle?: React.CSSProperties['fontStyle'];
        /** @default "bold" */
        readonly fontWeight?: React.CSSProperties['fontWeight'];
    };
}
