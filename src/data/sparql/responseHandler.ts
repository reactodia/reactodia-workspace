import { HashMap, HashSet } from '@reactodia/hashmap';

import { multimapAdd } from '../../coreUtils/collections';

import * as Rdf from '../rdf/rdfModel';
import {
    LinkTypeModel, ElementTypeGraph, ElementModel, LinkModel,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri,
    hashSubtypeEdge, equalSubtypeEdges, equalLinks, hashLink
} from '../model';
import type { DataProviderLinkCount, DataProviderLookupItem } from '../dataProvider';
import { LinkConfiguration, PropertyConfiguration } from './sparqlDataProviderSettings';
import {
    SparqlResponse, ClassBinding, ElementBinding, LinkBinding, ElementImageBinding, LinkCountBinding,
    LinkTypeBinding, ConnectedLinkTypeBinding, PropertyBinding, ElementTypeBinding, FilterBinding,
    isRdfIri, isRdfBlank, isRdfLiteral,
} from './sparqlModels';

const TYPE_PREDICATE = 'urn:reactodia:sparql:type';
const LABEL_PREDICATE = 'urn:reactodia:sparql:label';

const EMPTY_MAP: ReadonlyMap<any, any> = new Map();
const EMPTY_SET: ReadonlySet<any> = new Set();

export interface MutableClassModel {
    readonly id: ElementTypeIri;
    label: Rdf.Literal[];
    count?: number;
}

export function getClassTree(response: SparqlResponse<ClassBinding>): ElementTypeGraph {
    const nodes = new Map<ElementTypeIri, MutableClassModel>();
    const edges = new HashSet(hashSubtypeEdge, equalSubtypeEdges);

    for (const binding of response.results.bindings) {
        if (!isRdfIri(binding.class)) { continue; }
        const classIri: ElementTypeIri = binding.class.value;

        let node = nodes.get(classIri);
        if (!node) {
            node = createEmptyModel(classIri);
            nodes.set(classIri, node);
        }

        appendLabel(node.label, binding.label);
        if (binding.parent) {
            const parentIri: ElementTypeIri = binding.parent.value;
            edges.add([classIri, parentIri]);
        }
        if (binding.instcount) {
            node.count = parseCount(binding.instcount);
        }
    }

    // ensuring parent will always be there
    for (const binding of response.results.bindings) {
        if (binding.parent) {
            const parentIri: ElementTypeIri = binding.parent.value;
            if (!nodes.has(parentIri)) {
                nodes.set(parentIri, createEmptyModel(parentIri));
            }
        }
    }

    function createEmptyModel(iri: ElementTypeIri): MutableClassModel {
        return {
            id: iri,
            label: [],
            count: undefined,
        };
    }

    return {
        elementTypes: Array.from(nodes.values()),
        subtypeOf: Array.from(edges.values()),
    };
}

export function collectClassInfo(
    response: SparqlResponse<ClassBinding>,
    result: Map<ElementTypeIri, MutableClassModel>
): void {
    for (const binding of response.results.bindings) {
        if (!binding.class) { continue; }
        const id: ElementTypeIri = binding.class.value;
        const model = result.get(id);
        if (model) {
            appendLabel(model.label, binding.label);
            if (binding.instcount) {
                const instanceCount = parseCount(binding.instcount);
                if (instanceCount !== undefined) {
                    model.count = model.count === undefined
                        ? instanceCount
                        : Math.max(model.count, instanceCount);
                }
            }
        } else {
            result.set(id, {
                id,
                label: binding.label ? [binding.label] : [],
                count: binding.instcount ? parseCount(binding.instcount) : undefined,
            });
        }
    }
}

export interface MutablePropertyModel {
    readonly id: PropertyTypeIri;
    label: Rdf.Literal[];
}

export function collectPropertyInfo(
    response: SparqlResponse<PropertyBinding>,
    result: Map<PropertyTypeIri, MutablePropertyModel>
): void {
    for (const binding of response.results.bindings) {
        const propertyTypeId: PropertyTypeIri = binding.property.value;
        const existing = result.get(propertyTypeId);
        if (existing) {
            appendLabel(existing.label, binding.label);
        } else {
            result.set(propertyTypeId, {
                id: binding.property.value,
                label: binding.label ? [binding.label] : [],
            });
        }
    }
}

export interface MutableLinkType {
    readonly id: LinkTypeIri;
    label: Rdf.Literal[];
    count?: number;
}

export function collectLinkTypes(
    response: SparqlResponse<LinkTypeBinding>,
    result: Map<LinkTypeIri, MutableLinkType>
): void {
    for (const binding of response.results.bindings) {
        const linkTypeId: LinkTypeIri = binding.link.value;
        const existing = result.get(linkTypeId);
        if (existing) {
            appendLabel(existing.label, binding.label);
        } else {
            result.set(linkTypeId, getLinkTypeInfo(binding));
        }
    }
}

export function getLinkTypes(
    response: SparqlResponse<LinkTypeBinding>
): Map<LinkTypeIri, LinkTypeModel> {
    const result = new Map<LinkTypeIri, MutableLinkType>();
    collectLinkTypes(response, result);
    return result;
}

export function triplesToElementBinding(
    triples: ReadonlyArray<Rdf.Quad>,
): SparqlResponse<ElementBinding> {
    const elements = new Map<ElementIri, ElementBinding>();
    const convertedResponse: SparqlResponse<ElementBinding> = {
        head: {
            vars: ['inst', 'class', 'label', 'blankType', 'propType', 'propValue'],
        },
        results: {
            bindings: [],
        },
    };
    for (const t of triples) {
        if (!isRdfIri(t.subject)) {
            continue;
        }
        const subject: ElementIri = t.subject.value;
        if (!elements.has(subject)) {
            elements.set(subject, createAndPushBinding(t));
        }

        if (t.predicate.value === LABEL_PREDICATE && isRdfLiteral(t.object)) { // Label
            if (elements.get(subject)!.label) {
                elements.set(subject, createAndPushBinding(t));
            }
            elements.get(subject)!.label = t.object;
        } else if ( // Class
            t.predicate.value === TYPE_PREDICATE &&
            isRdfIri(t.object) && isRdfIri(t.predicate)
        ) {
            if (elements.get(subject)!.class) {
                elements.set(subject, createAndPushBinding(t));
            }
            elements.get(subject)!.class = t.object;
        } else if (
            (isRdfIri(t.object) || isRdfLiteral(t.object)) &&
            isRdfIri(t.predicate)
        ) { // Property
            if (elements.get(subject)!.propType) {
                elements.set(subject, createAndPushBinding(t));
            }
            elements.get(subject)!.propType = t.predicate;
            elements.get(subject)!.propValue = t.object;
        }
    }

    function createAndPushBinding(quad: Rdf.Quad): ElementBinding {
        const binding: ElementBinding = {
            inst: (quad.subject as Rdf.NamedNode),
        };
        convertedResponse.results.bindings.push(binding);
        return binding;
    }

    return convertedResponse;
}

interface MutableElementModel {
    readonly id: ElementIri;
    types: ElementTypeIri[];
    properties: { [id: string]: Array<Rdf.NamedNode | Rdf.Literal> };
}

export function getElementsInfo(
    response: SparqlResponse<ElementBinding>,
    types: ReadonlyMap<ElementIri, ReadonlySet<ElementTypeIri>> = EMPTY_MAP,
    propertyByPredicate: ReadonlyMap<string, readonly PropertyConfiguration[]> = EMPTY_MAP,
    labelPredicate: PropertyTypeIri,
    openWorldProperties: boolean
): Map<ElementIri, ElementModel> {
    const instances = new Map<ElementIri, MutableElementModel>();

    for (const binding of response.results.bindings) {
        if (!isRdfIri(binding.inst)) { continue; }
        const iri: ElementIri = binding.inst.value;
        let model = instances.get(iri);
        if (!model) {
            model = emptyElementInfo(iri);
            instances.set(iri, model);
        }
        enrichElement(model, binding, labelPredicate);
    }

    if (!openWorldProperties || propertyByPredicate.size > 0) {
        for (const model of instances.values()) {
            const modelTypes = types.get(model.id);
            model.properties = mapPropertiesByConfig(
                model, modelTypes, propertyByPredicate, openWorldProperties
            );
        }
    }

    return instances;
}

function mapPropertiesByConfig(
    model: MutableElementModel,
    modelTypes: ReadonlySet<ElementTypeIri> | undefined,
    propertyByPredicate: ReadonlyMap<string, readonly PropertyConfiguration[]>,
    openWorldProperties: boolean
): MutableElementModel['properties'] {
    const mapped: MutableElementModel['properties'] = {};
    for (const propertyIri in model.properties) {
        if (!Object.hasOwnProperty.call(model.properties, propertyIri)) { continue; }
        const properties = propertyByPredicate.get(propertyIri);
        if (properties && properties.length > 0) {
            for (const property of properties) {
                if (typeMatchesDomain(property, modelTypes)) {
                    mapped[property.id] = model.properties[propertyIri];
                }
            }
        } else if (openWorldProperties) {
            mapped[propertyIri] = model.properties[propertyIri];
        }
    }
    return mapped;
}

export function enrichElementsWithImages(
    response: SparqlResponse<ElementImageBinding>,
    elements: Map<ElementIri, ElementModel>,
    imagePropertyIri: PropertyTypeIri
): void {
    for (const binding of response.results.bindings) {
        if (!isRdfIri(binding.inst)) {
            continue;
        }
        const elementInfo = elements.get(binding.inst.value);
        if (elementInfo) {
            appendProperty(
                (elementInfo as MutableElementModel).properties,
                imagePropertyIri,
                binding.image
            );
        }
    }
}

export function collectElementTypes(
    response: SparqlResponse<ElementTypeBinding>,
    result: Map<ElementIri, Set<ElementTypeIri>>
): void {
    for (const binding of response.results.bindings) {
        if (isRdfIri(binding.inst) && isRdfIri(binding.class)) {
            const element: ElementIri = binding.inst.value;
            const type: ElementTypeIri = binding.class.value;
            multimapAdd(result, element, type);
        }
    }
}

interface MutableLinkModel {
    readonly linkTypeId: LinkTypeIri;
    readonly sourceId: ElementIri;
    readonly targetId: ElementIri;
    properties: { [id: string]: Array<Rdf.NamedNode | Rdf.Literal> };
}

export function getLinksInfo(
    bindings: ReadonlyArray<LinkBinding>,
    types: ReadonlyMap<ElementIri, ReadonlySet<ElementTypeIri>> = EMPTY_MAP,
    linkByPredicateType: ReadonlyMap<string, readonly LinkConfiguration[]> = EMPTY_MAP,
    openWorldLinks: boolean = true
): LinkModel[] {
    const links = new HashMap<LinkModel, MutableLinkModel>(hashLink, equalLinks);

    for (const binding of bindings) {
        const model: MutableLinkModel = {
            sourceId: binding.source.value,
            linkTypeId: binding.type.value,
            targetId: binding.target.value,
            properties: {},
        };
        const existing = links.get(model);
        if (existing) {
            // this can only happen due to error in sparql or when merging properties
            if (binding.propType && binding.propValue) {
                appendProperty(existing.properties, binding.propType.value, binding.propValue);
            }
        } else {
            if (binding.propType && binding.propValue) {
                appendProperty(model.properties, binding.propType.value, binding.propValue);
            }
            const linkConfigs = linkByPredicateType.get(model.linkTypeId);
            if (linkConfigs && linkConfigs.length > 0) {
                for (const linkConfig of linkConfigs) {
                    if (typeMatchesDomain(linkConfig, types.get(model.sourceId))) {
                        const mappedModel: MutableLinkModel = isDirectLink(linkConfig)
                            ? {...model, linkTypeId: linkConfig.id} : model;
                        links.set(mappedModel, mappedModel);
                    }
                }
            } else if (openWorldLinks) {
                links.set(model, model);
            }
        }
    }

    return Array.from(links.values());
}

export interface ConnectedLinkType {
    linkType: LinkTypeIri;
    hasInLink?: boolean;
    hasOutLink?: boolean;
}

export function getConnectedLinkTypes(
    response: SparqlResponse<ConnectedLinkTypeBinding>,
    linkByPredicateType: ReadonlyMap<string, readonly LinkConfiguration[]> = EMPTY_MAP,
    openWorldLinks: boolean = true
): ConnectedLinkType[] {
    const linkTypes = new Map<LinkTypeIri, ConnectedLinkType>();
    const pushLinkType = (linkType: LinkTypeIri, direction: Rdf.Literal | undefined) => {
        let connectedLink = linkTypes.get(linkType);
        if (!connectedLink) {
            connectedLink = {linkType};
            linkTypes.set(linkType, connectedLink);
        }
        if (isRdfLiteral(direction)) {
            if (direction.value === 'in') {
                connectedLink.hasInLink = true;
            } else if (direction.value === 'out') {
                connectedLink.hasOutLink = true;
            }
        }
    };
    for (const binding of response.results.bindings) {
        if (!isRdfIri(binding.link)) {
            continue;
        }
        const linkConfigs = linkByPredicateType.get(binding.link.value);
        if (linkConfigs && linkConfigs.length > 0) {
            for (const linkConfig of linkConfigs) {
                const mappedLinkType = isDirectLink(linkConfig)
                    ? linkConfig.id : binding.link.value;
                pushLinkType(mappedLinkType, binding.direction);
            }
        } else if (openWorldLinks) {
            pushLinkType(binding.link.value, binding.direction);
        }
    }
    return Array.from(linkTypes.values());
}

export function getLinkStatistics(
    response: SparqlResponse<LinkCountBinding>
): DataProviderLinkCount | undefined {
    for (const binding of response.results.bindings) {
        if (isRdfIri(binding.link)) {
            return getLinkCount(binding);
        }
    }
    return undefined;
}

export function getFilteredData(
    response: SparqlResponse<ElementBinding & FilterBinding>,
    sourceTypes: ReadonlySet<ElementTypeIri> | undefined,
    linkByPredicateType: ReadonlyMap<string, readonly LinkConfiguration[]> | undefined,
    labelPredicate: PropertyTypeIri,
    openWorldLinks: boolean
): DataProviderLookupItem[] {
    const predicateToConfig = linkByPredicateType ?? EMPTY_MAP;

    const instances = new Map<ElementIri, MutableElementModel>();
    const resultTypes = new Map<ElementIri, Set<ElementTypeIri>>();
    const outPredicates = new Map<ElementIri, Set<string>>();
    const inPredicates = new Map<ElementIri, Set<string>>();

    for (const binding of response.results.bindings) {
        if (!isRdfIri(binding.inst) && !isRdfBlank(binding.inst)) {
            continue;
        }

        const iri: ElementIri = binding.inst.value;
        let model = instances.get(iri);
        if (!model) {
            model = emptyElementInfo(iri);
            instances.set(iri, model);
        }
        enrichElement(model, binding, labelPredicate);

        if (isRdfIri(binding.classAll)) {
            multimapAdd(resultTypes, iri, binding.classAll.value);
        }

        if (!openWorldLinks && binding.link && binding.direction) {
            const predicates = (
                binding.direction.value === 'in' ? inPredicates :
                binding.direction.value === 'out' ? outPredicates :
                undefined
            );
            if (predicates) {
                multimapAdd(predicates, model.id, binding.link.value);
            }
        }
    }

    const linkedElements: DataProviderLookupItem[] = [];
    for (const model of instances.values()) {
        const targetTypes = resultTypes.get(model.id);
        const doesMatchesDomain = openWorldLinks || (
            matchesDomainForLink(sourceTypes, outPredicates.get(model.id), predicateToConfig) &&
            matchesDomainForLink(targetTypes, inPredicates.get(model.id), predicateToConfig)
        );
        if (doesMatchesDomain) {
            model.types.sort();
            const outLinks = new Set(translateLinkPredicates(
                sourceTypes,
                outPredicates.get(model.id) ?? EMPTY_SET,
                predicateToConfig,
                openWorldLinks
            ));
            const inLinks = new Set(translateLinkPredicates(
                targetTypes,
                inPredicates.get(model.id) ?? EMPTY_SET,
                predicateToConfig,
                openWorldLinks
            ));
            linkedElements.push({
                element: model,
                outLinks,
                inLinks,
            });
        }
    }

    return linkedElements;
}

function matchesDomainForLink(
    types: ReadonlySet<ElementTypeIri> | undefined,
    predicates: ReadonlySet<string> | undefined,
    linkByPredicateType: ReadonlyMap<string, readonly LinkConfiguration[]>
): boolean {
    if (!predicates) {
        return true;
    }
    const translatedPredicates = translateLinkPredicates(
        types,
        predicates,
        linkByPredicateType,
        /* openWorldLinks */ false
    );
    for (const linkTypeId of translatedPredicates) {
        return true;
    }
    return false;
}

function* translateLinkPredicates(
    types: ReadonlySet<ElementTypeIri> | undefined,
    predicates: ReadonlySet<string>,
    linkByPredicateType: ReadonlyMap<string, readonly LinkConfiguration[]>,
    openWorldLinks: boolean
): IterableIterator<LinkTypeIri> {
    for (const predicate of predicates) {
        const matched = linkByPredicateType.get(predicate);
        if (matched) {
            for (const link of matched) {
                if (typeMatchesDomain(link, types)) {
                    yield link.id;
                }
            }
        } else if (openWorldLinks) {
            yield predicate;
        }
    }
}

export function isDirectLink(link: LinkConfiguration) {
    // link configuration is path-based if includes any variables
    const pathBased = /[?$][a-zA-Z]+\b/.test(link.path);
    return !pathBased;
}

export function isDirectProperty(property: PropertyConfiguration) {
    // property configuration is path-based if includes any variables
    const pathBased = /[?$][a-zA-Z]+\b/.test(property.path);
    return !pathBased;
}

function typeMatchesDomain(
    config: { readonly domain?: ReadonlyArray<string> },
    types: ReadonlySet<ElementTypeIri> | undefined
): boolean {
    if (!config.domain || config.domain.length === 0) {
        return true;
    } else if (!types) {
        return false;
    } else {
        for (const type of config.domain) {
            if (types.has(type)) {
                return true;
            }
        }
        return false;
    }
}

function enrichElement(
    element: MutableElementModel | undefined,
    binding: ElementBinding,
    labelPredicate: PropertyTypeIri
) {
    if (!element) {
        return;
    }

    if (binding.label) {
        appendProperty(element.properties, labelPredicate, binding.label);
    }

    if (binding.class && element.types.indexOf(binding.class.value) < 0) {
        element.types.push(binding.class.value);
    }

    if (binding.propType && binding.propValue && binding.propType.value !== LABEL_PREDICATE) {
        appendProperty(element.properties, binding.propType.value, binding.propValue);
    }
}

function appendLabel(container: Rdf.Literal[], newLabel: Rdf.Literal | undefined) {
    if (!newLabel) { return; }
    for (const existing of container) {
        if (Rdf.equalTerms(existing, newLabel)) { return; }
    }
    container.push(newLabel);
}

export function appendProperty(
    properties: { [id: string]: Array<Rdf.NamedNode | Rdf.Literal> },
    propType: PropertyTypeIri,
    propValue: Rdf.NamedNode | Rdf.Literal
): void {
    let values = Object.prototype.hasOwnProperty.call(properties, propType)
        ? properties[propType] : undefined;
    if (values) {
        for (const existing of values) {
            if (Rdf.equalTerms(existing, propValue)) {
                return;
            }
        }
    } else {
        values = [];
        properties[propType] = values;
    }
    values.push(propValue);
}

function parseCount(countLiteral: Rdf.Literal): number {
    const numericCount = +countLiteral.value;
    return Number.isFinite(numericCount) ? numericCount : 0;
}

function getLinkCount(sLinkType: LinkCountBinding): DataProviderLinkCount {
    return {
        id: sLinkType.link.value,
        inCount: parseCount(sLinkType.inCount),
        outCount: parseCount(sLinkType.outCount),
    };
}

function emptyElementInfo(id: ElementIri): MutableElementModel {
    const elementInfo: MutableElementModel = {
        id: id,
        types: [],
        properties: {},
    };
    return elementInfo;
}

function getLinkTypeInfo(binding: LinkTypeBinding): MutableLinkType {
    return {
        id: binding.link.value,
        label: binding.label ? [binding.label] : [],
        count: binding.instcount ? parseCount(binding.instcount) : undefined,
    };
}
