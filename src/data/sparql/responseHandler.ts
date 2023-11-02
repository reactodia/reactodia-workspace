import { getOrCreateSetInMap, mapToObject } from '../../viewUtils/collections';
import { HashMap, HashSet } from '../../viewUtils/hashMap';
import * as Rdf from '../rdf/rdfModel';
import {
    Dictionary, LinkType, ClassModel, ClassGraphModel, ElementModel, LinkModel, PropertyModel, LinkCount,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri,
    hashSubtypeEdge, equalSubtypeEdges, sameLink, hashLink
} from '../model';
import { LinkedElement } from '../provider';
import { LinkConfiguration, PropertyConfiguration } from './sparqlDataProviderSettings';
import {
    SparqlResponse, ClassBinding, ElementBinding, LinkBinding, ElementImageBinding, LinkCountBinding,
    LinkTypeBinding, PropertyBinding, ElementTypeBinding, FilterBinding,
    isRdfIri, isRdfBlank, isRdfLiteral,
} from './sparqlModels';

const LABEL_URI = 'http://www.w3.org/2000/01/rdf-schema#label';
const RDF_TYPE_URI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

const EMPTY_MAP: ReadonlyMap<any, any> = new Map();
const EMPTY_SET: ReadonlySet<any> = new Set();

interface MutableClassModel {
    readonly id: ElementTypeIri;
    label: Rdf.Literal[];
    count?: number;
}

export function getClassTree(response: SparqlResponse<ClassBinding>): ClassGraphModel {
    const nodes = new Map<ElementTypeIri, MutableClassModel>();
    const edges = new HashSet(hashSubtypeEdge, equalSubtypeEdges);

    for (const binding of response.results.bindings) {
        if (!isRdfIri(binding.class)) { continue; }
        const classIri = binding.class.value as ElementTypeIri;

        let node = nodes.get(classIri);
        if (!node) {
            node = createEmptyModel(classIri);
            nodes.set(classIri, node);
        }

        appendLabel(node.label, binding.label);
        if (binding.parent) {
            const parentIri = binding.parent.value as ElementTypeIri;
            edges.add([classIri, parentIri]);
        }
        if (binding.instcount) {
            node.count = parseCount(binding.instcount);
        }
    }

    // ensuring parent will always be there
    for (const binding of response.results.bindings) {
        if (binding.parent) {
            const parentIri = binding.parent.value as ElementTypeIri;
            if (!nodes.has(parentIri)) {
                nodes.set(parentIri, createEmptyModel(parentIri));
            }
        }
    }

    function createEmptyModel(iri: ElementTypeIri): MutableClassModel {
        return {
            id: iri as ElementTypeIri,
            label: [],
            count: undefined,
        };
    }

    return {
        classes: Array.from(nodes.values()),
        subtypeOf: Array.from(edges.values()),
    };
}

export function getClassInfo(response: SparqlResponse<ClassBinding>): ClassModel[] {
    const classes = new Map<ElementTypeIri, MutableClassModel>();
    for (const binding of response.results.bindings) {
        if (!binding.class) { continue; }
        const id = binding.class.value as ElementTypeIri;
        const model = classes.get(id);
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
            classes.set(id, {
                id,
                label: binding.label ? [binding.label] : [],
                count: binding.instcount ? parseCount(binding.instcount) : undefined,
            });
        }
    }

    return Array.from(classes.values());
}

interface MutablePropertyModel {
    readonly id: PropertyTypeIri;
    label: Rdf.Literal[];
}

export function getPropertyInfo(response: SparqlResponse<PropertyBinding>): Dictionary<PropertyModel> {
    const models = new Map<PropertyTypeIri, MutablePropertyModel>();

    for (const binding of response.results.bindings) {
        const propertyTypeId = binding.property.value as PropertyTypeIri;
        const existing = models.get(propertyTypeId);
        if (existing) {
            appendLabel(existing.label, binding.label);
        } else {
            models.set(propertyTypeId, {
                id: binding.property.value as PropertyTypeIri,
                label: binding.label ? [binding.label] : [],
            });
        }
    }
    return mapToObject(models);
}

interface MutableLinkType {
    readonly id: LinkTypeIri;
    label: Rdf.Literal[];
    count?: number;
}

export function getLinkTypes(response: SparqlResponse<LinkTypeBinding>): LinkType[] {
    const linkTypes = new Map<LinkTypeIri, MutableLinkType>();

    for (const binding of response.results.bindings) {
        const linkTypeId = binding.link.value as LinkTypeIri;
        const existing = linkTypes.get(linkTypeId);
        if (existing) {
            appendLabel(existing.label, binding.label);
        } else {
            linkTypes.set(linkTypeId, getLinkTypeInfo(binding));
        }
    }

    return Array.from(linkTypes.values());
}

export function triplesToElementBinding(
    triples: ReadonlyArray<Rdf.Quad>,
): SparqlResponse<ElementBinding> {
    const map: Dictionary<ElementBinding> = {};
    const convertedResponse: SparqlResponse<ElementBinding> = {
        head: {
            vars: ['inst', 'class', 'label', 'blankType', 'propType', 'propValue'],
        },
        results: {
            bindings: [],
        },
    };
    for (const t of triples) {
        const subject = t.subject.value;
        if (!map[subject]) {
            map[subject] = createAndPushBinding(t);
        }

        if (t.predicate.value === LABEL_URI && isRdfLiteral(t.object)) { // Label
            if (map[subject].label) {
                map[subject] = createAndPushBinding(t);
            }
            map[subject].label = t.object;
        } else if ( // Class
            t.predicate.value === RDF_TYPE_URI &&
            isRdfIri(t.object) && isRdfIri(t.predicate)
        ) {
            if (map[subject].class) {
                map[subject] = createAndPushBinding(t);
            }
            map[subject].class = t.object;
        } else if (
            (isRdfIri(t.object) || isRdfLiteral(t.object)) &&
            isRdfIri(t.predicate)
        ) { // Property
            if (map[subject].propType) {
                map[subject] = createAndPushBinding(t);
            }
            map[subject].propType = t.predicate;
            map[subject].propValue = t.object;
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
    label: Rdf.Literal[];
    image?: string;
    properties: { [id: string]: Array<Rdf.NamedNode | Rdf.Literal> };
}

export function getElementsInfo(
    response: SparqlResponse<ElementBinding>,
    types: ReadonlyMap<ElementIri, ReadonlySet<ElementTypeIri>> = EMPTY_MAP,
    propertyByPredicate: ReadonlyMap<string, readonly PropertyConfiguration[]> = EMPTY_MAP,
    openWorldProperties = true,
): Dictionary<ElementModel> {
    const instances = new Map<ElementIri, MutableElementModel>();

    for (const binding of response.results.bindings) {
        if (!isRdfIri(binding.inst)) { continue; }
        const iri = binding.inst.value as ElementIri;
        let model = instances.get(iri);
        if (!model) {
            model = emptyElementInfo(iri);
            instances.set(iri, model);
        }
        enrichElement(model, binding);
    }

    if (!openWorldProperties || propertyByPredicate.size > 0) {
        for (const model of instances.values()) {
            const modelTypes = types.get(model.id);
            model.properties = mapPropertiesByConfig(
                model, modelTypes, propertyByPredicate, openWorldProperties
            );
        }
    }

    return mapToObject(instances);
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
    elementsInfo: Dictionary<ElementModel>,
): void {
    const respElements = response.results.bindings;
    for (const respEl of respElements) {
        const elementInfo = elementsInfo[respEl.inst.value];
        if (elementInfo) {
            (elementInfo as MutableElementModel).image = respEl.image.value;
        }
    }
}

export function getElementTypes(
    response: SparqlResponse<ElementTypeBinding>
): Map<ElementIri, Set<ElementTypeIri>> {
    const types = new Map<ElementIri, Set<ElementTypeIri>>();
    for (const binding of response.results.bindings) {
        if (isRdfIri(binding.inst) && isRdfIri(binding.class)) {
            const element = binding.inst.value as ElementIri;
            const type = binding.class.value as ElementTypeIri;
            getOrCreateSetInMap(types, element).add(type);
        }
    }
    return types;
}

interface MutableLinkModel {
    readonly linkTypeId: LinkTypeIri;
    readonly sourceId: ElementIri;
    readonly targetId: ElementIri;
    properties: { [id: string]: Array<Rdf.NamedNode | Rdf.Literal> };
}

export function getLinksInfo(
    response: SparqlResponse<LinkBinding>,
    types: ReadonlyMap<ElementIri, ReadonlySet<ElementTypeIri>> = EMPTY_MAP,
    linkByPredicateType: ReadonlyMap<string, readonly LinkConfiguration[]> = EMPTY_MAP,
    openWorldLinks: boolean = true
): LinkModel[] {
    const sparqlLinks = response.results.bindings;
    const links = new HashMap<LinkModel, MutableLinkModel>(hashLink, sameLink);

    for (const binding of sparqlLinks) {
        const model: MutableLinkModel = {
            sourceId: binding.source.value as ElementIri,
            linkTypeId: binding.type.value as LinkTypeIri,
            targetId: binding.target.value as ElementIri,
            properties: {},
        };
        const existing = links.get(model);
        if (existing) {
            // this can only happen due to error in sparql or when merging properties
            if (binding.propType && binding.propValue) {
                appendProperty(existing.properties, binding.propType, binding.propValue);
            }
        } else {
            if (binding.propType && binding.propValue) {
                appendProperty(model.properties, binding.propType, binding.propValue);
            }
            const linkConfigs = linkByPredicateType.get(model.linkTypeId);
            if (linkConfigs && linkConfigs.length > 0) {
                for (const linkConfig of linkConfigs) {
                    if (typeMatchesDomain(linkConfig, types.get(model.sourceId))) {
                        const mappedModel: MutableLinkModel = isDirectLink(linkConfig)
                            ? {...model, linkTypeId: linkConfig.id as LinkTypeIri} : model;
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

export function getLinksTypesOf(response: SparqlResponse<LinkCountBinding>): LinkCount[] {
    const sparqlLinkTypes = response.results.bindings.filter(b => !isRdfBlank(b.link));
    return sparqlLinkTypes.map((sLink: LinkCountBinding) => getLinkCount(sLink));
}

export function getLinksTypeIds(
    response: SparqlResponse<LinkTypeBinding>,
    linkByPredicateType: ReadonlyMap<string, readonly LinkConfiguration[]> = EMPTY_MAP,
    openWorldLinks: boolean = true
): LinkTypeIri[] {
    const linkTypes: LinkTypeIri[] = [];
    for (const binding of response.results.bindings) {
        if (!isRdfIri(binding.link)) { continue; }
        const linkConfigs = linkByPredicateType.get(binding.link.value);
        if (linkConfigs && linkConfigs.length > 0) {
            for (const linkConfig of linkConfigs) {
                const mappedLinkType = isDirectLink(linkConfig)
                    ? linkConfig.id : binding.link.value;
                linkTypes.push(mappedLinkType as LinkTypeIri);
            }
        } else if (openWorldLinks) {
            linkTypes.push(binding.link.value as LinkTypeIri);
        }
    }
    return linkTypes;
}

export function getLinkStatistics(response: SparqlResponse<LinkCountBinding>): LinkCount | undefined {
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
    openWorldLinks: boolean
): LinkedElement[] {
    const predicateToConfig = linkByPredicateType ?? EMPTY_MAP;

    const instances = new Map<ElementIri, MutableElementModel>();
    const resultTypes = new Map<ElementIri, Set<ElementTypeIri>>();
    const outPredicates = new Map<ElementIri, Set<string>>();
    const inPredicates = new Map<ElementIri, Set<string>>();

    for (const binding of response.results.bindings) {
        if (!isRdfIri(binding.inst) && !isRdfBlank(binding.inst)) {
            continue;
        }

        const iri = binding.inst.value as ElementIri;
        let model = instances.get(iri);
        if (!model) {
            model = emptyElementInfo(iri);
            instances.set(iri, model);
        }
        enrichElement(model, binding);

        if (isRdfIri(binding.classAll)) {
            getOrCreateSetInMap(resultTypes, iri).add(binding.classAll.value as ElementTypeIri);
        }

        if (!openWorldLinks && binding.link && binding.direction) {
            const predicates = (
                binding.direction.value === 'in' ? inPredicates :
                binding.direction.value === 'out' ? outPredicates :
                undefined
            );
            if (predicates) {
                getOrCreateSetInMap(predicates, model.id).add(binding.link.value);
            }
        }
    }

    const linkedElements: LinkedElement[] = [];
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
                    yield link.id as LinkTypeIri;
                }
            }
        } else if (openWorldLinks) {
            yield predicate as LinkTypeIri;
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
            if (types.has(type as ElementTypeIri)) {
                return true;
            }
        }
        return false;
    }
}

export function enrichElement(element: MutableElementModel, binding: ElementBinding) {
    if (!element) { return; }
    appendLabel(element.label, binding.label);
    if (binding.class && element.types.indexOf(binding.class.value as ElementTypeIri) < 0) {
        element.types.push(binding.class.value as ElementTypeIri);
    }
    if (binding.propType && binding.propValue && binding.propType.value !== LABEL_URI) {
        appendProperty(element.properties, binding.propType, binding.propValue);
    }
}

function appendLabel(container: Rdf.Literal[], newLabel: Rdf.Literal | undefined) {
    if (!newLabel) { return; }
    for (const existing of container) {
        if (Rdf.equalTerms(existing, newLabel)) { return; }
    }
    container.push(newLabel);
}

function appendProperty(
    properties: { [id: string]: Array<Rdf.NamedNode | Rdf.Literal> },
    propType: Rdf.NamedNode,
    propValue: Rdf.NamedNode | Rdf.Literal
): void {
    let values = Object.prototype.hasOwnProperty.call(properties, propType.value)
        ? properties[propType.value] : undefined;
    if (values) {
        for (const existing of values) {
            if (Rdf.equalTerms(existing, propValue)) {
                return;
            }
        }
    } else {
        values = [];
        properties[propType.value] = values;
    }
    values.push(propValue);
}

function parseCount(countLiteral: Rdf.Literal): number {
    const numericCount = +countLiteral.value;
    return Number.isFinite(numericCount) ? numericCount : 0;
}

function getLinkCount(sLinkType: LinkCountBinding): LinkCount {
    return {
        id: sLinkType.link.value as LinkTypeIri,
        inCount: parseCount(sLinkType.inCount),
        outCount: parseCount(sLinkType.outCount),
    };
}

function emptyElementInfo(id: ElementIri): MutableElementModel {
    const elementInfo: MutableElementModel = {
        id: id,
        label: [],
        types: [],
        properties: {},
    };
    return elementInfo;
}

function getLinkTypeInfo(binding: LinkTypeBinding): MutableLinkType {
    return {
        id: binding.link.value as LinkTypeIri,
        label: binding.label ? [binding.label] : [],
        count: binding.instcount ? parseCount(binding.instcount) : undefined,
    };
}

export function prependAdditionalBindings<Binding>(
    base: SparqlResponse<Binding>,
    additional: SparqlResponse<Binding> | undefined,
): SparqlResponse<Binding> {
    if (!additional) {
        return base;
    }
    return {
        head: {vars: base.head.vars},
        results: {
            bindings: [...additional.results.bindings, ...base.results.bindings]
        },
    };
}
