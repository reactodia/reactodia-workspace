import { ElementIri, LinkTypeIri } from '../data/model';
import { DIAGRAM_CONTEXT_URL_V1 } from '../data/schema';

import { Element, ElementTemplateState, Link, LinkTemplateState } from '../diagram/elements';
import { Vector } from '../diagram/geometry';

export interface SerializedDiagram {
    '@context': any;
    '@type': 'Diagram';
    layoutData: SerializedLayout;
    linkTypeOptions?: ReadonlyArray<SerializedLinkOptions>;
}

export interface SerializedLinkOptions {
    '@type': 'LinkTypeOptions';
    property: LinkTypeIri;
    visible: boolean;
    showLabel?: boolean;
}

export interface SerializedLayout {
    '@type': 'Layout';
    elements: ReadonlyArray<SerializedLayoutElement>;
    links: ReadonlyArray<SerializedLayoutLink>;
}

export interface SerializedLayoutElement {
    '@type': 'Element';
    '@id': string;
    iri: ElementIri;
    position: Vector;
    angle?: number;
    isExpanded?: boolean;
    group?: string;
    elementState?: ElementTemplateState;
}

export interface SerializedLayoutLink {
    '@type': 'Link';
    '@id': string;
    property: LinkTypeIri;
    source: { '@id': string };
    target: { '@id': string };
    vertices?: ReadonlyArray<Vector>;
    linkState?: LinkTemplateState;
}

export function emptyDiagram(): SerializedDiagram {
    return {
        '@context': DIAGRAM_CONTEXT_URL_V1,
        '@type': 'Diagram',
        layoutData: emptyLayoutData(),
        linkTypeOptions: [],
    };
}

export function emptyLayoutData(): SerializedLayout {
    return {'@type': 'Layout', elements: [], links: []};
}

export function makeSerializedDiagram(params: {
    layoutData?: SerializedLayout;
    linkTypeOptions?: ReadonlyArray<SerializedLinkOptions>;
}): SerializedDiagram {
    const diagram: SerializedDiagram = {
        ...emptyDiagram(),
        linkTypeOptions: params.linkTypeOptions
    };
    // layout data is a complex structure we want to persist
    if (params.layoutData) {
        diagram.layoutData = params.layoutData;
    }
    return diagram;
}

export function makeSerializedLayout(
    modelElements: ReadonlyArray<Element>,
    modelLinks: ReadonlyArray<Link>,
): SerializedLayout {
    const elements = modelElements.map((element): SerializedLayoutElement => ({
        '@type': 'Element',
        '@id': element.id,
        iri: element.iri,
        position: element.position,
        isExpanded: element.isExpanded,
        group: element.group,
        elementState: element.elementState,
    }));
    const links = modelLinks.map((link): SerializedLayoutLink => ({
        '@type': 'Link',
        '@id': link.id,
        property: link.typeId,
        source: {'@id': link.sourceId},
        target: {'@id': link.targetId},
        vertices: [...link.vertices],
        linkState: link.linkState,
    }));
    return {'@type': 'Layout', elements, links};
}
