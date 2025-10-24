import { ElementIri, ElementModel, LinkTypeIri } from '../data/model';
import { DiagramContextV1, PlaceholderRelationType, TemplateProperties } from '../data/schema';

import { Element, ElementTemplateState, Link, LinkTemplateState, LinkTypeVisibility } from '../diagram/elements';
import { Vector } from '../diagram/geometry';

import {
    EntityElement, EntityGroup, EntityGroupItem,
    RelationLink, RelationGroup, RelationGroupItem,
} from './dataElements';

/**
 * Serialized diagram state in [JSON-LD](https://json-ld.org/) compatible format.
 *
 * @see {@link serializeDiagram}
 */
export interface SerializedDiagram {
    '@context': any;
    '@type': 'Diagram';
    layoutData: SerializedLayout;
    linkTypeOptions?: ReadonlyArray<SerializedLinkOptions>;
}

/**
 * Serialized state for a single link type on a diagram.
 */
export interface SerializedLinkOptions {
    '@type': 'LinkTypeOptions';
    property: LinkTypeIri;
    visible: boolean;
    showLabel?: boolean;
}

/**
 * Serialized diagram layout, composed of elements and links.
 */
export interface SerializedLayout {
    '@type': 'Layout';
    elements: ReadonlyArray<SerializedLayoutElement | SerializedLayoutElementGroup>;
    links: ReadonlyArray<SerializedLayoutLink | SerializedLayoutLinkGroup>;
}

/**
 * Serialized entity element state.
 */
export interface SerializedLayoutElement {
    '@type': 'Element';
    '@id': string;
    iri?: ElementIri;
    position: Vector;
    /**
     * @deprecated only deserialized to {@link TemplateProperties.Expanded}
     * in {@link elementState} for compatibility
     */
    isExpanded?: boolean;
    elementState?: ElementTemplateState;
}

/**
 * Serialized entity group state. 
 */
export interface SerializedLayoutElementGroup {
    '@type': 'ElementGroup';
    '@id': string;
    items: ReadonlyArray<SerializedLayoutElementItem>;
    position: Vector;
    elementState?: ElementTemplateState;
}

/**
 * Serialized entity group item state.
 */
export interface SerializedLayoutElementItem {
    '@type': 'ElementItem';
    iri: ElementIri;
    elementState?: ElementTemplateState;
}

/**
 * Serialized relation link state.
 */
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

/**
 * Serialized relation group state.
 */
export interface SerializedLayoutLinkGroup {
    '@type': 'LinkGroup';
    '@id': string;
    property: LinkTypeIri;
    source: { '@id': string };
    target: { '@id': string };
    items: ReadonlyArray<SerializedLayoutLinkItem>;
    vertices?: ReadonlyArray<Vector>;
    linkState?: LinkTemplateState;
}

/**
 * Serialized relation group item state.
 */
export interface SerializedLayoutLinkItem {
    '@type': 'LinkItem';
    targetIri: ElementIri;
    sourceIri: ElementIri;
    linkState?: LinkTemplateState;
}

/**
 * Makes an empty serialized diagram state.
 */
export function emptyDiagram(): SerializedDiagram {
    return {
        '@context': DiagramContextV1,
        '@type': 'Diagram',
        layoutData: {
            '@type': 'Layout',
            elements: [],
            links: [],
        },
        linkTypeOptions: [],
    };
}

/**
 * Raw diagram state to serialize.
 *
 * @see {@link deserializeDiagram}
 */
export interface DeserializedDiagram {
    elements: ReadonlyArray<Element>;
    links: ReadonlyArray<Link>;
    linkTypeVisibility: ReadonlyMap<LinkTypeIri, LinkTypeVisibility>;
}

/**
 * Exports diagram model state for [JSON-LD](https://json-ld.org/) compatible serialization.
 *
 * @see {@link deserializeDiagram}
 */
export function serializeDiagram(diagram: DeserializedDiagram): SerializedDiagram {
    const {elements, links, linkTypeVisibility} = diagram;
    let linkTypeOptions: SerializedLinkOptions[] | undefined;
    if (linkTypeVisibility) {
        linkTypeOptions = [];
        for (const [linkTypeIri, visibility] of linkTypeVisibility) {
            // Do not serialize default link type options
            if  (visibility !== 'visible' && linkTypeIri !== PlaceholderRelationType) {
                linkTypeOptions.push({
                    '@type': 'LinkTypeOptions',
                    property: linkTypeIri,
                    visible: visibility !== 'hidden',
                    showLabel: visibility !== 'withoutLabel',
                });
            }
        }
    }
    const serialized: SerializedDiagram = {
        ...emptyDiagram(),
        layoutData: serializeLayout(elements, links),
        linkTypeOptions: linkTypeOptions,
    };
    return serialized;
}

function serializeLayout(
    modelElements: ReadonlyArray<Element>,
    modelLinks: ReadonlyArray<Link>,
): SerializedLayout {
    const elements: Array<SerializedLayoutElement | SerializedLayoutElementGroup> = [];
    for (const element of modelElements) {
        if (element instanceof EntityGroup) {
            elements.push({
                '@type': 'ElementGroup',
                '@id': element.id,
                items: element.items.map((item): SerializedLayoutElementItem => ({
                    '@type': 'ElementItem',
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
                elementState: element.elementState,
            });
        }
    }
    const links: Array<SerializedLayoutLink | SerializedLayoutLinkGroup> = [];
    for (const link of modelLinks) {
        if (link instanceof RelationGroup) {
            links.push({
                '@type': 'LinkGroup',
                '@id': link.id,
                property: link.typeId,
                source: {'@id': link.sourceId},
                target: {'@id': link.targetId},
                items: link.items.map((item): SerializedLayoutLinkItem => ({
                    '@type': 'LinkItem',
                    sourceIri: item.data.sourceId,
                    targetIri: item.data.targetId,
                    linkState: item.linkState,
                })),
                vertices: [...link.vertices],
                linkState: link.linkState,
            });
        } else {
            links.push({
                '@type': 'Link',
                '@id': link.id,
                property: link.typeId,
                source: {'@id': link.sourceId},
                target: {'@id': link.targetId},
                sourceIri: link instanceof RelationLink ? link.data.sourceId : undefined,
                targetIri: link instanceof RelationLink ? link.data.targetId : undefined,
                vertices: [...link.vertices],
                linkState: link.linkState,
            });
        }
    }
    return {'@type': 'Layout', elements, links};
}

/**
 * Options for diagram deserialization.
 */
export interface DeserializeDiagramOptions {
    readonly preloadedElements?: ReadonlyMap<ElementIri, ElementModel>;
    readonly markLinksAsLayoutOnly?: boolean;
}

/**
 * Imports diagram model state from the serialized form.
 *
 * @see {@link serializeDiagram}
 */
export function deserializeDiagram(
    diagram: SerializedDiagram,
    options: DeserializeDiagramOptions = {}
): DeserializedDiagram {
    const {layoutData, linkTypeOptions} = diagram;
    const linkTypeVisibility = new Map<LinkTypeIri, LinkTypeVisibility>();
    if (linkTypeOptions) {
        for (const setting of linkTypeOptions) {
            const {visible = true, showLabel = true} = setting;
            const linkTypeId: LinkTypeIri = setting.property;
            const visibility: LinkTypeVisibility = (
                visible && showLabel ? 'visible' :
                visible && !showLabel ? 'withoutLabel' :
                'hidden'
            );
            linkTypeVisibility.set(linkTypeId, visibility);
        }
    }
    const {elements, links} = deserializeLayout(layoutData, options);
    return {elements, links, linkTypeVisibility};
}

interface DeserializedLayout {
    elements: Element[];
    links: Link[];
}

function deserializeLayout(
    layout: SerializedLayout,
    options: DeserializeDiagramOptions
): DeserializedLayout {
    const {preloadedElements, markLinksAsLayoutOnly = false} = options;
    const elements = new Map<string, Element>();
    const links: Link[] = [];

    for (const layoutElement of layout.elements) {
        switch (layoutElement['@type']) {
            case 'Element': {
                const {'@id': id, iri, position, isExpanded, elementState} = layoutElement;
                if (iri) {
                    const preloadedData = preloadedElements?.get(iri);
                    const data = preloadedData ?? EntityElement.placeholderData(iri);
                    const element = new EntityElement({id, data, position, expanded: isExpanded, elementState});
                    elements.set(element.id, element);
                }
                break;
            }
            case 'ElementGroup': {
                const {'@id': id, items, position, elementState} = layoutElement;
                const groupItems: EntityGroupItem[] = [];
                for (const item of items) {
                    const preloadedData = preloadedElements?.get(item.iri);
                    groupItems.push({
                        data: preloadedData ?? EntityElement.placeholderData(item.iri),
                        elementState: item.elementState,
                    });
                }
                const group = new EntityGroup({id, items: groupItems, position, elementState});
                elements.set(group.id, group);
                break;
            }
        }
        
    }

    for (const layoutLink of layout.links) {
        const {'@id': id, property, source, target, vertices, linkState} = layoutLink;

        const sourceElement = elements.get(source['@id']);
        const targetElement = elements.get(target['@id']);
        if (!(sourceElement && targetElement)) {
            continue;
        }

        switch (layoutLink['@type']) {
            case 'Link': {
                const sourceIri = layoutLink.sourceIri ?? (
                    sourceElement instanceof EntityElement ? sourceElement.data.id : undefined
                );
                const targetIri = layoutLink.targetIri ?? (
                    targetElement instanceof EntityElement ? targetElement.data.id : undefined
                );
                if (sourceElement && targetElement && sourceIri && targetIri) {
                    const link = new RelationLink({
                        id,
                        sourceId: sourceElement.id,
                        targetId: targetElement.id,
                        data: {
                            linkTypeId: property,
                            sourceId: sourceIri,
                            targetId: targetIri,
                            properties: {},
                        },
                        vertices,
                        linkState: markLayoutOnly(linkState, markLinksAsLayoutOnly),
                    });
                    links.push(link);
                }
                break;
            }
            case 'LinkGroup': {
                const groupItems: RelationGroupItem[] = [];
                for (const item of layoutLink.items) {
                    groupItems.push({
                        data: {
                            linkTypeId: property,
                            sourceId: item.sourceIri,
                            targetId: item.targetIri,
                            properties: {},
                        },
                        linkState: markLayoutOnly(item.linkState, markLinksAsLayoutOnly),
                    });
                }
                const group = new RelationGroup({
                    id,
                    typeId: property,
                    sourceId: sourceElement.id,
                    targetId: targetElement.id,
                    items: groupItems,
                    vertices,
                    linkState: linkState,
                });
                links.push(group);
                break;
            }
        }
    }

    return {
        elements: Array.from(elements.values()),
        links,
    };
}

export function markLayoutOnly(
    linkState: LinkTemplateState | undefined,
    value: boolean
): LinkTemplateState | undefined {
    const previous = (
        linkState &&
        Object.prototype.hasOwnProperty.call(linkState, TemplateProperties.LayoutOnly) &&
        Boolean(linkState[TemplateProperties.LayoutOnly])
    );
    if (previous && !value) {
        const {
            [TemplateProperties.LayoutOnly]: layoutOnly,
            ...withoutLayoutOnly
        } = linkState;
        return withoutLayoutOnly;
    } else if (!previous && value) {
        return {
            ...linkState,
            [TemplateProperties.LayoutOnly]: true,
        };
    }
    return linkState;
}
