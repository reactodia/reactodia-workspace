import { ElementIri, LinkTypeIri } from '../data/model';
import { DIAGRAM_CONTEXT_URL_V1 } from '../data/schema';

import { Element, ElementTemplateState, Link, LinkTemplateState } from '../diagram/elements';
import { Vector } from '../diagram/geometry';

import { EntityElement, EntityGroup, RelationLink } from './dataElements';

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
    elements: ReadonlyArray<SerializedLayoutElement | SerializedLayoutGroup>;
    links: ReadonlyArray<SerializedLayoutLink>;
}

export interface SerializedLayoutElement {
    '@type': 'Element';
    '@id': string;
    iri?: ElementIri;
    position: Vector;
    isExpanded?: boolean;
    elementState?: ElementTemplateState;
}

export interface SerializedLayoutGroup {
    '@type': 'Group';
    '@id': string;
    items: ReadonlyArray<SerializedLayoutGroupItem>;
    position: Vector;
    elementState?: ElementTemplateState;
}

export interface SerializedLayoutGroupItem {
    '@type': 'GroupItem';
    iri: ElementIri;
    elementState?: ElementTemplateState;
}

export interface SerializedLayoutLink {
    '@type': 'Link';
    '@id': string;
    property: LinkTypeIri;
    source: { '@id': string };
    target: { '@id': string };
    targetIri?: ElementIri;
    sourceIri?: ElementIri;
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
    const elements: Array<SerializedLayoutElement | SerializedLayoutGroup> = [];
    for (const element of modelElements) {
        if (element instanceof EntityGroup) {
            elements.push({
                '@type': 'Group',
                '@id': element.id,
                items: element.items.map((item): SerializedLayoutGroupItem => ({
                    '@type': 'GroupItem',
                    iri: item.data.id,
                    elementState: item.elementState,
                })),
                position: element.position,
                elementState: element.elementState,
            });
        } else {
            elements.push({
                '@type': 'Element',
                '@id': element.id,
                iri: element instanceof EntityElement ? element.iri : undefined,
                position: element.position,
                isExpanded: element.isExpanded,
                elementState: element.elementState,
            });
        }
    }
    const links = modelLinks.map((link): SerializedLayoutLink => ({
        '@type': 'Link',
        '@id': link.id,
        property: link.typeId,
        source: {'@id': link.sourceId},
        target: {'@id': link.targetId},
        sourceIri: link instanceof RelationLink ? link.data.sourceId : undefined,
        targetIri: link instanceof RelationLink ? link.data.targetId : undefined,
        vertices: [...link.vertices],
        linkState: link.linkState,
    }));
    return {'@type': 'Layout', elements, links};
}
