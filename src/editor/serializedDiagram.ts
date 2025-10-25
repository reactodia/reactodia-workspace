import type { ReadonlyHashMap } from '@reactodia/hashmap';

import { ElementIri, ElementModel, LinkKey, LinkModel, LinkTypeIri } from '../data/model';
import { DiagramContextV1, PlaceholderRelationType, TemplateProperties } from '../data/schema';

import { Element, ElementTemplateState, Link, LinkTemplateState, LinkTypeVisibility } from '../diagram/elements';
import { Vector } from '../diagram/geometry';

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
    elements: ReadonlyArray<SerializedElement>;
    links: ReadonlyArray<SerializedLink>;
}

type SerializedState<T> = T extends { toJSON(): infer S } ? Exclude<S, undefined> : never;

type JsonableElement = Element & { toJSON(): SerializedElement };

/**
 * Static interface (contract) for serializable graph element
 * classes derived from {@link Element}.
 *
 * **Example**:
 * ```ts
 * class MyElement extends Reactodia.Element {
 *   ...
 *   static readonly fromJSONType = 'MyElement';
 *   static fromJSON(state: SerializedMyElement): MyElement | undefined {
 *     ...
 *   }
 *   toJSON(): SerializedMyElement {
 *     ...
 *   }
 * }
 * 
 * interface SerializedMyElement extends Reactodia.SerializedElement {
 *   '@type': 'MyElement';
 *   ...
 * }
 * 
 * MyElement satisfies SerializableElementCell<MyElement>;
 * ```
 */
export interface SerializableElementCell<T extends JsonableElement = JsonableElement> {
    new (...args: any[]): T;
    readonly fromJSONType: SerializedState<T>['@type'];
    fromJSON(state: SerializedState<T>, options: ElementFromJsonOptions): T | undefined;
}

/**
 * Options for {@link SerializableElementCell.fromJSON} method.
 */
export interface ElementFromJsonOptions {
    readonly getInitialData: (iri: ElementIri) => ElementModel | undefined;
    readonly mapTemplateState:
        (from: ElementTemplateState | undefined) => ElementTemplateState | undefined;
}

/**
 * Serialized graph element state.
 */
export interface SerializedElement {
    '@type': string;
    '@id': string;
    position: Vector;
    elementState?: ElementTemplateState;
}

type JsonableLink = Link & { toJSON(): SerializedLink };

/**
 * Static interface (contract) for serializable graph link
 * classes derived from {@link Link}.
 *
 * **Example**:
 * ```ts
 * class MyLink extends Reactodia.Link {
 *   ...
 *   static readonly fromJSONType = 'MyLink';
 *   static fromJSON(state: SerializedMyLink): MyLink | undefined {
 *     ...
 *   }
 *   toJSON(): SerializedMyLink {
 *     ...
 *   }
 * }
 * 
 * interface SerializedMyLink extends Reactodia.SerializedLink {
 *   '@type': 'MyLink';
 *   ...
 * }
 * 
 * MyLink satisfies SerializableLinkCell<MyLink>;
 * ```
 */
export interface SerializableLinkCell<T extends JsonableLink = JsonableLink> {
    new (...args: any[]): T;
    readonly fromJSONType: SerializedState<T>['@type'];
    fromJSON(state: SerializedState<T>, options: LinkFromJsonOptions): T | undefined;
}

/**
 * Options for {@link SerializableLinkCell.fromJSON} method.
 */
export interface LinkFromJsonOptions {
    readonly source: Element;
    readonly target: Element;
    readonly getInitialData: (key: LinkKey) => LinkModel | undefined;
    readonly mapTemplateState:
        (from: LinkTemplateState | undefined) => LinkTemplateState | undefined;
}

/**
 * Serialized graph link state.
 */
export interface SerializedLink {
    '@type': string;
    '@id': string;
    source: { '@id': string };
    target: { '@id': string };
    vertices?: ReadonlyArray<Vector>;
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
    const elements: Array<SerializedElement> = [];
    for (const element of modelElements) {
        if (hasToJSON(element)) {
            const state = element.toJSON();
            if (isValidSerializedState(state)) {
                elements.push(state as SerializedElement);
            }
        }
    }

    const links: Array<SerializedLink> = [];
    for (const link of modelLinks) {
        if (hasToJSON(link)) {
            const state = link.toJSON();
            if (isValidSerializedState(state)) {
                links.push(state as SerializedLink);
            }
        }
    }

    return {'@type': 'Layout', elements, links};
}

/**
 * Options for diagram deserialization.
 */
export interface DeserializeDiagramOptions {
    readonly elementCellTypes: readonly SerializableElementCell[];
    readonly linkCellTypes: readonly SerializableLinkCell[];
    readonly preloadedElements?: ReadonlyMap<ElementIri, ElementModel>;
    readonly preloadedLinks?: ReadonlyHashMap<LinkKey, LinkModel>;
    readonly markLinksAsLayoutOnly?: boolean;
}

/**
 * Imports diagram model state from the serialized form.
 *
 * @see {@link serializeDiagram}
 */
export function deserializeDiagram(
    diagram: SerializedDiagram,
    options: DeserializeDiagramOptions
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
    const {preloadedElements, preloadedLinks, markLinksAsLayoutOnly = false} = options;

    const typeToElement = new Map<string, SerializableElementCell>();
    for (const elementCellType of options.elementCellTypes) {
        typeToElement.set(elementCellType.fromJSONType, elementCellType);
    }
    const elementOptions: ElementFromJsonOptions = {
        getInitialData: iri => preloadedElements?.get(iri),
        mapTemplateState: state => state,
    };

    const typeToLink = new Map<string, SerializableLinkCell>();
    for (const linkCellType of options.linkCellTypes) {
        typeToLink.set(linkCellType.fromJSONType, linkCellType);
    }
    const getInitialLinkData = (key: LinkKey) => preloadedLinks?.get(key);
    const mapLinkTemplateState = (state: LinkTemplateState | undefined) =>
        markLayoutOnly(state, markLinksAsLayoutOnly);

    const elements = new Map<string, Element>();
    const links: Link[] = [];

    for (const layoutElement of layout.elements) {
        const elementClass = typeToElement.get(layoutElement['@type']);
        if (elementClass) {
            const element = elementClass.fromJSON(layoutElement, elementOptions);
            if (element) {
                elements.set(element.id, element);
            }
        }
    }

    for (const layoutLink of layout.links) {
        const {source, target} = layoutLink;

        const sourceElement = elements.get(source['@id']);
        const targetElement = elements.get(target['@id']);
        if (!(sourceElement && targetElement)) {
            continue;
        }

        const linkClass = typeToLink.get(layoutLink['@type']);
        if (linkClass) {
            const link = linkClass.fromJSON(layoutLink, {
                source: sourceElement,
                target: targetElement,
                getInitialData: getInitialLinkData,
                mapTemplateState: mapLinkTemplateState,
            });
            if (link) {
                links.push(link);
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

function hasToJSON(instance: object): instance is { toJSON(): { ['@type']?: unknown } } {
    const withToJson = instance as { toJSON?(): { ['@type']?: unknown } };
    return Boolean(typeof withToJson.toJSON === 'function');
}

function isValidSerializedState(state: { ['@type']?: unknown }): boolean {
    return typeof state === 'object' && state && typeof state['@type'] === 'string';
}
