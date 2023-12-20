import * as React from 'react';

import type { ElementModel, PropertyTypeIri } from '../data/model';
import type * as Rdf from '../data/rdf/rdfModel';

import type { ElementTemplateState, Link, RichLinkType } from './elements';
import type { SizeProvider, Vector } from './geometry';
import type { GraphStructure } from './model';

export type LabelLanguageSelector =
    (labels: ReadonlyArray<Rdf.Literal>, language: string) => Rdf.Literal | undefined;

export interface FormattedProperty {
    readonly propertyId: PropertyTypeIri;
    readonly label: string;
    readonly values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;
}

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
    readonly isExpanded: boolean;
    readonly elementState?: ElementTemplateState;
}

export interface LinkTemplate {
    markerSource?: LinkMarkerStyle;
    markerTarget?: LinkMarkerStyle;
    renderLink(props: LinkTemplateProps): React.ReactNode;
    editableLabel?: EditableLinkLabel;
}

export interface EditableLinkLabel {
    getLabel(link: Link): string | undefined;
    setLabel(link: Link, label: string): void;
}

export interface LinkMarkerStyle {
    readonly d?: string;
    readonly width?: number;
    readonly height?: number;
    readonly fill?: string;
    readonly stroke?: string;
    readonly strokeWidth?: string;
}

export interface LinkTemplateProps {
    link: Link;
    linkType: RichLinkType;
    path: string;
    getPathPosition: (offset: number) => Vector;
    route?: RoutedLink;
    editableLabel?: EditableLinkLabel;
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
