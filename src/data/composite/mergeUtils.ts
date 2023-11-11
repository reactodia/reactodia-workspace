import { mapToObject } from '../../coreUtils/collections';
import { HashSet } from '../../coreUtils/hashMap';

import * as Rdf from '../rdf/rdfModel';
import {
    Dictionary, ClassModel, ClassGraphModel, LinkType, ElementModel, LinkModel, LinkCount, PropertyModel,
    ElementIri, ElementTypeIri, LinkTypeIri, hashSubtypeEdge, equalSubtypeEdges,
} from '../model';
import type { LinkedElement } from '../provider';
import type { DataProviderDefinition } from './composite';

const DATA_PROVIDER_PROPERTY = 'http://ontodia.org/property/DataProvider';

export type CompositeResponse<T> = readonly [T, DataProviderDefinition];

export function mergeClassTree(composite: CompositeResponse<ClassGraphModel>[]): ClassGraphModel {
    const classes = new Map<ElementTypeIri, ClassModel>();
    const edges = new HashSet(hashSubtypeEdge, equalSubtypeEdges);

    for (const [response, provider] of composite) {
        for (const model of response.classes) {
            const existing = classes.get(model.id);
            classes.set(model.id, existing ? mergeClassModel(existing, model) : model);
        }
        for (const edge of response.subtypeOf) {
            edges.add(edge);
        }
    }

    return {
        classes: Array.from(classes.values()),
        subtypeOf: Array.from(edges.values()),
    };
}

export function mergePropertyInfo(
    response: CompositeResponse<Dictionary<PropertyModel>>[],
): Dictionary<PropertyModel> {
    const result: Dictionary<PropertyModel> = {};
    const props = response.map(([response]) => response);
    for (const model of props) {
        const keys = Object.keys(model);
        for (const key of keys) {
            const prop = model[key];
            if (!result[key]) {
                result[key] = prop;
            } else {
                result[key] = {
                    ...result[key],
                    label: mergeLabels(result[key].label, prop.label)
                };
            }
        }
    }
    return result;
}

export function mergeClassInfo(response: CompositeResponse<ClassModel[]>[]): ClassModel[] {
    const dictionaries = response.map(([response]) => response);
    const dictionary: Dictionary<ClassModel> = {};

    for (const models of dictionaries) {
        for (const model of models) {
            if (!dictionary[model.id]) {
                dictionary[model.id] = model;
            } else {
                dictionary[model.id] = mergeClassModel(dictionary[model.id], model);
            }
        }
    }
    return Object.keys(dictionary).map(key => dictionary[key]);
}

export function mergeLinkTypesInfo(response: CompositeResponse<LinkType[]>[]): LinkType[] {
    const lists = response.map(([response]) => response);

    const mergeLinkType = (a: LinkType, b: LinkType): LinkType => {
        return {
            id: a.id,
            label: mergeLabels(a.label, b.label),
            count: a.count || b.count
                ? (a.count ?? 0) + (b.count ?? 0)
                : undefined,
        };
    };

    const dictionary: Dictionary<LinkType> = {};

    for (const linkTypes of lists) {
        for (const linkType of linkTypes) {
            if (!dictionary[linkType.id]) {
                dictionary[linkType.id] = linkType;
            } else {
                dictionary[linkType.id] = mergeLinkType(dictionary[linkType.id], linkType);
            }
        }
    }
    return Object.keys(dictionary).map(key => dictionary[key]);
}

export function mergeLinkTypes(response: CompositeResponse<LinkType[]>[]): LinkType[] {
    return mergeLinkTypesInfo(response);
}

export function mergeElementInfo(composite: CompositeResponse<Dictionary<ElementModel>>[]): Dictionary<ElementModel> {
    const models = new Map<ElementIri, ElementModel>();

    for (const [response, provider] of composite) {
        for (const baseModel of Object.keys(response).map(k => response[k])) {
            const model: ElementModel = {
                ...baseModel,
                properties: addSourceProperty(baseModel.properties, provider),
            };
            const existing = models.get(model.id);
            models.set(model.id, existing ? mergeElementModels(existing, model) : model);
        }
    }

    return mapToObject(models);
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
        id: a.id,
        label: mergeLabels(a.label, b.label),
        types: Array.from(typeSet).sort(),
        image: a.image || b.image,
        properties: mergeProperties(a.properties, b.properties),
    };
}

export function mergeProperties(
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

export function mergeLinksInfo(response: CompositeResponse<LinkModel[]>[]): LinkModel[] {
    const lists = response.map(([response]) => response);
    const resultInfo: LinkModel[] = [];

    function compareLinksInfo(a: LinkModel, b: LinkModel): boolean {
        return a.sourceId === b.sourceId &&
               a.targetId === b.targetId &&
               a.linkTypeId === b.linkTypeId;
    }

    for (const linkInfo of lists) {
        for (const linkModel of linkInfo) {
            if (!resultInfo.some(l => compareLinksInfo(l, linkModel))) {
                resultInfo.push(linkModel);
            }
        }
    }
    return resultInfo;
}

export function mergeLinkTypesOf(response: CompositeResponse<LinkCount[]>[]): LinkCount[] {
    const lists = response.map(([response]) => response);
    const dictionary: Dictionary<LinkCount> = {};

    const merge = (a: LinkCount, b: LinkCount): LinkCount => {
        return {
            id: a.id,
            inCount: a.inCount + b.inCount,
            outCount: a.outCount + b.outCount,
        };
    };

    for (const linkCount of lists) {
        for (const lCount of linkCount) {
            if (!dictionary[lCount.id]) {
                dictionary[lCount.id] = lCount;
            } else {
                dictionary[lCount.id] = merge(lCount, dictionary[lCount.id]);
            }
        }
    }
    return Object.keys(dictionary).map(key => dictionary[key]);
}

interface MutableLinkedElement {
    element: ElementModel;
    inLinks: Set<LinkTypeIri>;
    outLinks: Set<LinkTypeIri>;
}

export function mergeFilter(composite: CompositeResponse<LinkedElement[]>[]): LinkedElement[] {
    const linkedElements = new Map<ElementIri, MutableLinkedElement>();
    for (const [response, provider] of composite) {
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

export function mergeLabels(
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

function mergeClassModel(a: ClassModel, b: ClassModel): ClassModel {
    return {
        id: a.id,
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
