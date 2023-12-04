import { HashSet } from '../../coreUtils/hashMap';

import * as Rdf from '../rdf/rdfModel';
import {
    ElementType, ElementTypeGraph, LinkType, ElementModel, LinkModel, LinkCount,
    PropertyTypeIri, PropertyType, ElementIri, ElementTypeIri, LinkTypeIri,
    hashLink, sameLink, hashSubtypeEdge, equalSubtypeEdges,
} from '../model';
import type { LinkedElement } from '../provider';
import type { DataProviderDefinition } from './composite';

const DATA_PROVIDER_PROPERTY = 'urn:reactodia:sourceProvider';

export type CompositeResponse<T> = readonly [T, DataProviderDefinition];

export function mergeKnownElementTypes(composite: CompositeResponse<ElementTypeGraph>[]): ElementTypeGraph {
    const classes = new Map<ElementTypeIri, ElementType>();
    const edges = new HashSet(hashSubtypeEdge, equalSubtypeEdges);

    for (const [response] of composite) {
        for (const model of response.elementTypes) {
            const existing = classes.get(model.id);
            classes.set(model.id, existing ? mergeClassModel(existing, model) : model);
        }
        for (const edge of response.subtypeOf) {
            edges.add(edge);
        }
    }

    return {
        elementTypes: Array.from(classes.values()),
        subtypeOf: Array.from(edges.values()),
    };
}

export function mergeKnownLinkTypes(responses: CompositeResponse<LinkType[]>[]): LinkType[] {
    const result = new Map<LinkTypeIri, LinkType>();
    for (const [response] of responses) {
        for (const model of response) {
            const existing = result.get(model.id);
            result.set(model.id, existing ? mergeLinkType(existing, model) : model);
        }
    }
    return Array.from(result.values());
}

export function mergePropertyTypes(
    responses: CompositeResponse<Map<PropertyTypeIri, PropertyType>>[],
): Map<PropertyTypeIri, PropertyType> {
    return mergeMapResponses(responses, mergePropertyModel);
}

function mergePropertyModel(a: PropertyType, b: PropertyType): PropertyType {
    return {
        ...a,
        ...b,
        label: mergeLabels(a.label, b.label),
    };
}

export function mergeElementTypes(
    responses: CompositeResponse<Map<ElementTypeIri, ElementType>>[]
): Map<ElementTypeIri, ElementType> {
    return mergeMapResponses(responses, mergeClassModel);
}

export function mergeLinkTypes(
    responses: CompositeResponse<Map<LinkTypeIri, LinkType>>[]
): Map<LinkTypeIri, LinkType> {
    return mergeMapResponses(responses, mergeLinkType);
}

function mergeLinkType(a: LinkType, b: LinkType): LinkType {
    return {
        ...a,
        ...b,
        label: mergeLabels(a.label, b.label),
        count: a.count || b.count
            ? (a.count ?? 0) + (b.count ?? 0)
            : undefined,
    };
}

function mergeMapResponses<K extends string, V>(
    responses: Iterable<CompositeResponse<Map<K, V>>>,
    mergeItems: (a: V, b: V) => V
): Map<K, V> {
    const result = new Map<K, V>();
    for (const [response] of responses) {
        for (const [key, model] of response) {
            const existing = result.get(key);
            result.set(key, existing ? mergeItems(existing, model) : model);
        }
    }
    return result;
}

export function mergeElementInfo(
    responses: CompositeResponse<Map<ElementIri, ElementModel>>[]
): Map<ElementIri, ElementModel> {
    const result = new Map<ElementIri, ElementModel>();
    for (const [response, provider] of responses) {
        for (const [key, baseModel] of response) {
            const model: ElementModel = {
                ...baseModel,
                properties: addSourceProperty(baseModel.properties, provider),
            };
            const existing = result.get(key);
            result.set(key, existing ? mergeElementModels(existing, model) : model);
        }
    }
    return result;
}

function addSourceProperty(
    properties: { readonly [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> },
    source: DataProviderDefinition
): { [id: string]: Array<Rdf.NamedNode | Rdf.Literal> } {
    return {
        ...properties,
        [DATA_PROVIDER_PROPERTY]: [source.provider.factory.literal(source.name)],
    };
}

function mergeElementModels(a: ElementModel, b: ElementModel): ElementModel {
    const typeSet = new Set(a.types);
    for (const t of b.types) {
        typeSet.add(t);
    }
    return {
        ...a,
        ...b,
        label: mergeLabels(a.label, b.label),
        types: Array.from(typeSet).sort(),
        image: a.image || b.image,
        properties: mergeProperties(a.properties, b.properties),
    };
}

function mergeProperties(
    a: { [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> },
    b: { [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> }
): { [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> } {
    const reusedTermSet = new HashSet(Rdf.hashTerm, Rdf.equalTerms);
    const result: { [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> } = {};

    for (const key in a) {
        if (Object.prototype.hasOwnProperty.call(a, key)) {
            if (Object.prototype.hasOwnProperty.call(b, key)) {
                const terms: Array<Rdf.NamedNode | Rdf.Literal> = [];
                addUniqueTerms(a[key], terms, reusedTermSet);
                addUniqueTerms(b[key], terms, reusedTermSet);
                result[key] = terms;
                reusedTermSet.clear();
            } else {
                result[key] = a[key];
            }
        }
    }

    for (const key in b) {
        if (Object.prototype.hasOwnProperty.call(b, key)) {
            if (!Object.prototype.hasOwnProperty.call(result, key)) {
                result[key] = b[key];
            }
        }
    }

    return result;
}

export function mergeLinksInfo(responses: CompositeResponse<LinkModel[]>[]): LinkModel[] {
    const resultSet = new HashSet(hashLink, sameLink);
    const result: LinkModel[] = [];
    for (const [response] of responses) {
        for (const link of response) {
            if (!resultSet.has(link)) {
                resultSet.add(link);
                result.push(link);
            }
        }
    }
    return result;
}

export function mergeConnectedLinkStats(responses: CompositeResponse<LinkCount[]>[]): LinkCount[] {
    const result = new Map<LinkTypeIri, LinkCount>();
    for (const [response] of responses) {
        for (const model of response) {
            const existing = result.get(model.id);
            result.set(model.id, existing ? mergeLinkCount(existing, model) : model);
        }
    }
    return Array.from(result.values());
}

function mergeLinkCount(a: LinkCount, b: LinkCount): LinkCount {
    return {
        ...a,
        ...b,
        inCount: a.inCount + b.inCount,
        outCount: a.outCount + b.outCount,
        inexact: Boolean(a.inexact || b.inexact),
    };
}

interface MutableLinkedElement {
    element: ElementModel;
    inLinks: Set<LinkTypeIri>;
    outLinks: Set<LinkTypeIri>;
}

export function mergeLookup(responses: CompositeResponse<LinkedElement[]>[]): LinkedElement[] {
    const linkedElements = new Map<ElementIri, MutableLinkedElement>();
    for (const [response, provider] of responses) {
        for (const {element: baseElement, inLinks, outLinks} of response) {
            const element: ElementModel = {
                ...baseElement,
                properties: addSourceProperty(baseElement.properties, provider),
            };
            const existing = linkedElements.get(element.id);
            if (existing) {
                existing.element = mergeElementModels(existing.element, element);
                for (const inLink of inLinks) {
                    existing.inLinks.add(inLink);
                }
                for (const outLink of outLinks) {
                    existing.outLinks.add(outLink);
                }
            } else {
                linkedElements.set(baseElement.id, {
                    element,
                    inLinks: new Set(inLinks),
                    outLinks: new Set(outLinks),
                });
            }
        }
    }
    return Array.from(linkedElements.values());
}

function mergeLabels(
    a: ReadonlyArray<Rdf.Literal>,
    b: ReadonlyArray<Rdf.Literal>
): ReadonlyArray<Rdf.Literal> {
    const labels: Rdf.Literal[] = [];
    const labelSet = new HashSet<Rdf.Term>(Rdf.hashTerm, Rdf.equalTerms);
    addUniqueTerms(a, labels, labelSet);
    addUniqueTerms(b, labels, labelSet);
    return labels;
}

function addUniqueTerms<T extends Rdf.Term>(
    input: ReadonlyArray<T>,
    output: T[],
    outputSet: HashSet<Rdf.Term>
): void {
    for (const term of input) {
        if (!outputSet.has(term)) {
            outputSet.add(term);
            output.push(term);
        }
    }
}

function mergeClassModel(a: ElementType, b: ElementType): ElementType {
    return {
        ...a,
        ...b,
        label: mergeLabels(a.label, b.label),
        count: mergeCounts(a.count, b.count),
    };
}

function mergeCounts(a: number | undefined, b: number | undefined): number | undefined {
    if (a === undefined && b === undefined) {
        return undefined;
    }
    return (a ?? 0) + (b ?? 0);
}
