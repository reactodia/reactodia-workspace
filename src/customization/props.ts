import { ComponentClass } from 'react';
import { DiagramModel } from '../diagram/model';

import { ElementModel, PropertyTypeIri } from '../data/model';
import type * as Rdf from '../data/rdf/rdfModel';
import { Link } from '../diagram/elements';

export type TypeStyleResolver = (types: ReadonlyArray<string>) => CustomTypeStyle | undefined;
export type LinkTemplateResolver = (linkType: string) => LinkTemplate | undefined;
export type TemplateResolver = (types: ReadonlyArray<string>) => ElementTemplate | undefined;

export interface CustomTypeStyle {
    color?: string;
    icon?: string;
}

export type ElementTemplate = ComponentClass<TemplateProps>;

export interface TemplateProps {
    readonly elementId: string;
    readonly data: ElementModel;
    readonly color: string;
    readonly iconUrl?: string;
    readonly isExpanded?: boolean;
}

export interface FormattedProperty {
    readonly propertyId: PropertyTypeIri;
    readonly label: string;
    readonly values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;
}

export interface LinkTemplate {
    markerSource?: LinkMarkerStyle;
    markerTarget?: LinkMarkerStyle;
    renderLink?(link: Link, model: DiagramModel): LinkStyle;
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
    route(model: DiagramModel): RoutedLinks;
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
        readonly fontFamily?: string;
        /** @default "inherit" */
        readonly fontSize?: string | number;
        /** @default "bold" */
        readonly fontWeight?: 'normal' | 'bold' | 'lighter' | 'bolder' | number;
    };
}
