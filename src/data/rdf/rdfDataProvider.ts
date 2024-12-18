import { HashMap, HashSet } from '../../coreUtils/hashMap';

import {
    ElementTypeGraph, ElementTypeModel, LinkTypeModel, ElementModel, LinkModel, PropertyTypeModel,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri, SubtypeEdge,
    hashSubtypeEdge, equalSubtypeEdges,
} from '../model';
import {
    DataProvider, DataProviderLinkCount, DataProviderLookupParams, DataProviderLookupItem,
} from '../provider';

import { MemoryDataset, IndexQuadBy, indexedDataset } from './memoryDataset';
import * as Rdf from './rdfModel';

/**
 * Options for {@link RdfDataProvider}.
 *
 * @see {@link RdfDataProvider}
 */
export interface RdfDataProviderOptions {
    /**
     * Whether to support blank node terms when accessing the data.
     *
     * @default true
     */
    readonly acceptBlankNodes?: boolean;
    /**
     * RDF/JS-compatible term factory to create RDF terms.
     */
    readonly factory?: Rdf.DataFactory;
    /**
     * @default "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
     */
    readonly typePredicate?: string;
    /**
     * @default "http://www.w3.org/2000/01/rdf-schema#label"
     */
    readonly labelPredicate?: string | null;
    /**
     * @default "https://schema.org/thumbnailUrl"
     */
    readonly imagePredicate?: string | null;
    /**
     * **Default**:
     * ```json
     * [
     *   "http://www.w3.org/2002/07/owl#Class",
     *   "http://www.w3.org/2000/01/rdf-schema#Class"
     * ]
     * ```
     */
    readonly elementTypeBaseTypes?: ReadonlyArray<string>;
    /**
     * @default "http://www.w3.org/2000/01/rdf-schema#subClassOf"
     */
    readonly elementSubtypePredicate?: string | null;
    /**
     * **Default**:
     * ```json
     * [
     *   "http://www.w3.org/2002/07/owl#ObjectProperty",
     *   "http://www.w3.org/1999/02/22-rdf-syntax-ns#Property"
     * ]
     * ```
     */
    readonly linkTypeBaseTypes?: ReadonlyArray<string>;
}

const BLANK_PREFIX = 'urn:reactodia:blank:rdf:';

const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const OWL_DATATYPE_PROPERTY = 'http://www.w3.org/2002/07/owl#DatatypeProperty';
const OWL_OBJECT_PROPERTY = 'http://www.w3.org/2002/07/owl#ObjectProperty';

const RDF_PROPERTY = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#Property';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

const RDFS_CLASS = 'http://www.w3.org/2000/01/rdf-schema#Class';
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const RDFS_SUB_CLASS_OF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';

const SCHEMA_THUMBNAIL_URL = 'https://schema.org/thumbnailUrl';

/**
 * Provides graph data from in-memory [RDF/JS-compatible](https://rdf.js.org/data-model-spec/)
 * graph dataset.
 *
 * @category Data
 */
export class RdfDataProvider implements DataProvider {
    readonly factory: Rdf.DataFactory;

    private readonly dataset: MemoryDataset;
    private readonly acceptBlankNodes: boolean;

    private readonly typePredicate: Rdf.NamedNode;
    private readonly labelPredicate: Rdf.NamedNode | null;
    private readonly imagePredicate: Rdf.NamedNode | null;
    private readonly elementTypeBaseTypes: ReadonlyArray<Rdf.NamedNode>;
    private readonly elementSubtypePredicate: Rdf.NamedNode | null;
    private readonly linkTypeBaseTypes: ReadonlyArray<Rdf.NamedNode>;

    private readonly EMPTY_LINKS: ReadonlySet<LinkTypeIri> = new Set();

    constructor(options: RdfDataProviderOptions = {}) {
        this.factory = options.factory ?? Rdf.DefaultDataFactory;
        this.dataset = indexedDataset(
            IndexQuadBy.S |
            IndexQuadBy.SP |
            IndexQuadBy.O |
            IndexQuadBy.OP
        );
        this.acceptBlankNodes = options.acceptBlankNodes ?? true;
        this.typePredicate = this.factory.namedNode(options.typePredicate ?? RDF_TYPE);
        this.labelPredicate = options.labelPredicate === null
            ? null : this.factory.namedNode(options.labelPredicate ?? RDFS_LABEL);
        this.imagePredicate = options.imagePredicate === null
            ? null : this.factory.namedNode(options.imagePredicate ?? SCHEMA_THUMBNAIL_URL);
        this.elementTypeBaseTypes = (options.elementTypeBaseTypes ?? [OWL_CLASS, RDFS_CLASS])
            .map(iri => this.factory.namedNode(iri));
        this.elementSubtypePredicate = options.elementSubtypePredicate === null
            ? null : this.factory.namedNode(options.elementSubtypePredicate ?? RDFS_SUB_CLASS_OF);
        this.linkTypeBaseTypes = (options.linkTypeBaseTypes ?? [OWL_OBJECT_PROPERTY, RDF_PROPERTY])
            .map(iri => this.factory.namedNode(iri));
    }

    addGraph(quads: Iterable<Rdf.Quad>): void {
        if (this.acceptBlankNodes) {
            this.dataset.addAll(quads);
        } else {
            for (const q of quads) {
                if (!(
                    q.subject.termType === 'BlankNode' ||
                    q.object.termType === 'BlankNode' ||
                    q.graph.termType === 'BlankNode'
                )) {
                    this.dataset.add(q);
                }
            }
        }
    }

    encodeTerm(term: Rdf.NamedNode | Rdf.BlankNode): string {
        return encodeTerm(term);
    }

    decodeTerm(
        iri: ElementIri | ElementTypeIri | LinkTypeIri | PropertyTypeIri
    ): Rdf.NamedNode | Rdf.BlankNode {
        return decodeTerm(iri, this.factory);
    }

    knownElementTypes(params: {
        signal?: AbortSignal;
    }): Promise<ElementTypeGraph> {
        const typeCounts = this.computeTypeCounts();
        for (const baseType of this.elementTypeBaseTypes) {
            for (const t of this.dataset.iterateMatches(null, this.typePredicate, baseType)) {
                if (isResourceTerm(t.subject)) {
                    const elementTypeId = this.encodeTerm(t.subject) as ElementTypeIri;
                    if (!typeCounts.has(elementTypeId)) {
                        typeCounts.set(elementTypeId, 0);
                    }
                }
            }
        }
        const foundEdges = new HashSet(hashSubtypeEdge, equalSubtypeEdges);
        if (this.elementSubtypePredicate) {
            for (const t of this.dataset.iterateMatches(null, this.elementSubtypePredicate, null)) {
                if (isResourceTerm(t.subject) && isResourceTerm(t.object)) {
                    const derivedTypeId = this.encodeTerm(t.subject) as ElementTypeIri;
                    if (!typeCounts.has(derivedTypeId)) {
                        typeCounts.set(derivedTypeId, 0);
                    }
                    const baseTypeId = this.encodeTerm(t.object) as ElementTypeIri;
                    if (!typeCounts.has(baseTypeId)) {
                        typeCounts.set(baseTypeId, 0);
                    }
                    foundEdges.add([
                        this.encodeTerm(t.subject) as ElementTypeIri,
                        this.encodeTerm(t.object) as ElementTypeIri
                    ]);
                }
            }
        }
        const elementTypes: ElementTypeModel[] = [];
        const excluded = new Set<ElementTypeIri>();
        for (const [typeId, count] of typeCounts) {
            const typeIri = this.decodeTerm(typeId);
            const label = this.labelPredicate
                ? findLiterals(this.dataset, typeIri, this.labelPredicate)
                : [];
            if (typeIri.termType === 'BlankNode' && label.length === 0) {
                excluded.add(typeId);
            } else {
                elementTypes.push({id: typeId, label, count});
            }
        }
        const subtypeOf: SubtypeEdge[] = [];
        for (const edge of foundEdges.values()) {
            const [from, to] = edge;
            if (!excluded.has(from) && !excluded.has(to)) {
                subtypeOf.push(edge);
            }
        }
        const classTree: ElementTypeGraph = {elementTypes, subtypeOf};
        return Promise.resolve(classTree);
    }

    knownLinkTypes(params: {
        signal?: AbortSignal;
    }): Promise<LinkTypeModel[]> {
        const linkCounts = this.computeLinkCounts();
        for (const baseType of this.linkTypeBaseTypes) {
            for (const t of this.dataset.iterateMatches(null, this.typePredicate, baseType)) {
                if (isResourceTerm(t.subject)) {
                    const linkTypeId = this.encodeTerm(t.subject) as LinkTypeIri;
                    if (!linkCounts.has(linkTypeId)) {
                        linkCounts.set(linkTypeId, 0);
                    }
                }
            }
        }
        const models = new Map<LinkTypeIri, LinkTypeModel>();
        for (const [linkTypeId, count] of linkCounts) {
            const linkTypeIri = this.decodeTerm(linkTypeId);
            const label = this.labelPredicate
                ? findLiterals(this.dataset, linkTypeIri, this.labelPredicate)
                : [];
            if (linkTypeIri.termType === 'BlankNode' && label.length === 0) {
                continue;
            }
            models.set(linkTypeId, {id: linkTypeId, label, count});
        }
        return Promise.resolve(Array.from(models.values()));
    }

    elementTypes(params: {
        classIds: ReadonlyArray<ElementTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<ElementTypeIri, ElementTypeModel>> {
        const {classIds} = params;
        const models = new Map<ElementTypeIri, ElementTypeModel>();
        for (const classId of classIds) {
            const classIri = this.decodeTerm(classId);
            let instanceCount = 0;
            for (const t of this.dataset.iterateMatches(null, this.typePredicate, classIri)) {
                instanceCount++;
            }
            const model: ElementTypeModel = {
                id: classId,
                label: this.labelPredicate
                    ? findLiterals(this.dataset, classIri, this.labelPredicate)
                    : [],
                count: instanceCount,
            };
            models.set(classId, model);
        }
        return Promise.resolve(models);
    }

    propertyTypes(params: {
        propertyIds: ReadonlyArray<PropertyTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<PropertyTypeIri, PropertyTypeModel>> {
        const {propertyIds} = params;
        const models = new Map<PropertyTypeIri, PropertyTypeModel>();
        for (const propertyId of propertyIds) {
            const propertyIri = this.decodeTerm(propertyId);
            const model: PropertyTypeModel = {
                id: propertyId,
                label: this.labelPredicate
                    ? findLiterals(this.dataset, propertyIri, this.labelPredicate)
                    : [],
            };
            models.set(propertyId, model);
        }
        return Promise.resolve(models);
    }

    linkTypes(params: {
        linkTypeIds: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<LinkTypeIri, LinkTypeModel>> {
        const {linkTypeIds} = params;        
        const linkCounts = this.computeLinkCounts(linkTypeIds);
        const models = new Map<LinkTypeIri, LinkTypeModel>();
        for (const linkTypeId of linkTypeIds) {
            const linkTypeIri = this.decodeTerm(linkTypeId);
            const model: LinkTypeModel = {
                id: linkTypeId,
                label: this.labelPredicate
                    ? findLiterals(this.dataset, linkTypeIri, this.labelPredicate)
                    : [],
                count: linkCounts.get(linkTypeId) ?? 0,
            };
            models.set(linkTypeId, model);
        }
        return Promise.resolve(models);
    }

    elements(params: {
        elementIds: ReadonlyArray<ElementIri>;
        signal?: AbortSignal;
    }): Promise<Map<ElementIri, ElementModel>> {
        const {elementIds} = params;
        const result = new Map<ElementIri, ElementModel>();
        for (const elementId of elementIds) {
            const elementIri = this.decodeTerm(elementId);
            if (this.dataset.hasMatches(elementIri, null, null)) {
                const imageTerm = this.imagePredicate
                    ? findFirstIriOrLiteral(this.dataset, elementIri, this.imagePredicate)
                    : undefined;
                const model: ElementModel = {
                    id: elementId,
                    types: findTypes(this.dataset, elementIri, this.typePredicate),
                    label: this.labelPredicate
                        ? findLiterals(this.dataset, elementIri, this.labelPredicate)
                        : [],
                    image: imageTerm ? imageTerm.value : undefined,
                    properties: findProperties(this.dataset, elementIri),
                };
                result.set(elementId, model);
            }
        }
        return Promise.resolve(result);
    }

    links(params: {
        primary: ReadonlyArray<ElementIri>;
        secondary: ReadonlyArray<ElementIri>;
        linkTypeIds?: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<LinkModel[]> {
        const {primary, secondary, linkTypeIds} = params;

        const primarySet = new HashSet<Rdf.NamedNode | Rdf.BlankNode>(Rdf.hashTerm, Rdf.equalTerms);
        for (const elementIri of primary) {
            primarySet.add(this.decodeTerm(elementIri));
        }

        const secondarySet = new HashSet<Rdf.NamedNode | Rdf.BlankNode>(Rdf.hashTerm, Rdf.equalTerms);
        for (const elementIri of secondary) {
            secondarySet.add(this.decodeTerm(elementIri));
        }

        const linkTypeSet = linkTypeIds ? new Set<string>(linkTypeIds) : undefined;
        const links: LinkModel[] = [];
        // TODO avoid full scan
        for (const t of this.dataset) {
            if (
                isResourceTerm(t.subject) &&
                t.predicate.termType === 'NamedNode' &&
                isResourceTerm(t.object) &&
                (
                    primarySet.has(t.subject) && secondarySet.has(t.object) ||
                    secondarySet.has(t.subject) && primarySet.has(t.object)
                ) &&
                (!linkTypeSet || !linkTypeSet.has(t.predicate.value))
            ) {
                const properties = findProperties(this.dataset, t);
                links.push({
                    sourceId: this.encodeTerm(t.subject) as ElementIri,
                    targetId: this.encodeTerm(t.object) as ElementIri,
                    linkTypeId: this.encodeTerm(t.predicate) as LinkTypeIri,
                    properties,
                });
            }
        }
        return Promise.resolve(links);
    }

    connectedLinkStats(params: {
        elementId: ElementIri;
        inexactCount?: boolean;
        signal?: AbortSignal;
    }): Promise<DataProviderLinkCount[]> {
        const {elementId} = params;
        const elementIri = this.decodeTerm(elementId);
        
        const outCounts = new Map<LinkTypeIri, number>();
        for (const t of this.dataset.iterateMatches(elementIri, null, null)) {
            if (t.predicate.termType === 'NamedNode' && isResourceTerm(t.object)) {
                const linkTypeIri = this.encodeTerm(t.predicate) as LinkTypeIri;
                outCounts.set(linkTypeIri, (outCounts.get(linkTypeIri) ?? 0) + 1);
            }
        }

        const inCounts = new Map<LinkTypeIri, number>();
        for (const t of this.dataset.iterateMatches(null, null, elementIri)) {
            if (t.predicate.termType === 'NamedNode' && isResourceTerm(t.subject)) {
                const linkTypeIri = this.encodeTerm(t.predicate) as LinkTypeIri;
                inCounts.set(linkTypeIri, (inCounts.get(linkTypeIri) ?? 0) + 1);
            }
        }

        const counts: DataProviderLinkCount[] = [];
        for (const [linkTypeId, outCount] of outCounts) {
            counts.push({
                id: linkTypeId,
                inCount: inCounts.get(linkTypeId) ?? 0,
                outCount,
            });
        }
        for (const [linkTypeId, inCount] of inCounts) {
            if (outCounts.has(linkTypeId)) {
                continue;
            }
            counts.push({
                id: linkTypeId,
                inCount,
                outCount: 0,
            });
        }
        return Promise.resolve(counts);
    }

    lookup(params: DataProviderLookupParams): Promise<DataProviderLookupItem[]> {
        interface ResultItem {
            readonly term: Rdf.NamedNode | Rdf.BlankNode;
            outLinks?: Set<LinkTypeIri>;
            inLinks?: Set<LinkTypeIri>;
        }

        const items = new HashMap<Rdf.NamedNode | Rdf.BlankNode, ResultItem>(
            Rdf.hashTerm, Rdf.equalTerms
        );
        let requiredTextFilter = params.text ? new RegExp(escapeRegexp(params.text), 'i') : undefined;

        if (params.refElementId) {
            const refElementIri = this.decodeTerm(params.refElementId);
            const refLinkIri = params.refElementLinkId
                ? this.decodeTerm(params.refElementLinkId) : null;
            if (!params.linkDirection || params.linkDirection === 'out') {
                for (const t of this.dataset.iterateMatches(refElementIri, refLinkIri, null)) {
                    if (t.predicate.termType === 'NamedNode' && isResourceTerm(t.object)) {
                        const term = t.object;
                        let item = items.get(term);
                        if (!item) {
                            item = {term};
                            items.set(term, item);
                        }
                        const predicate = this.encodeTerm(t.predicate) as LinkTypeIri;
                        if (!item.outLinks) {
                            item.outLinks = new Set();
                        }
                        item.outLinks.add(predicate);
                    }
                }
            }
            if (!params.linkDirection || params.linkDirection === 'in') {
                for (const t of this.dataset.iterateMatches(null, refLinkIri, refElementIri)) {
                    if (t.predicate.termType === 'NamedNode' && isResourceTerm(t.subject)) {
                        const term = t.subject;
                        let item = items.get(term);
                        if (!item) {
                            item = {term};
                            items.set(term, item);
                        }
                        const predicate = this.encodeTerm(t.predicate) as LinkTypeIri;
                        if (!item.inLinks) {
                            item.inLinks = new Set();
                        }
                        item.inLinks.add(predicate);
                    }
                }
            }
            // join with filtered by type
            if (params.elementTypeId) {
                const typeTerm = this.decodeTerm(params.elementTypeId);
                for (const item of Array.from(items.values())) {
                    if (!this.dataset.hasMatches(item.term, this.typePredicate, typeTerm)) {
                        items.delete(item.term);
                    }
                }
            }
        } else if (params.elementTypeId) {
            const typeTerm = this.decodeTerm(params.elementTypeId);
            for (const t of this.dataset.iterateMatches(null, this.typePredicate, typeTerm)) {
                if (isResourceTerm(t.subject) && !items.has(t.subject)) {
                    items.set(t.subject, {term: t.subject});
                }
            }
        } else if (requiredTextFilter && this.labelPredicate) {
            for (const t of this.dataset.iterateMatches(null, this.labelPredicate, null)) {
                if (
                    isResourceTerm(t.subject) &&
                    t.object.termType === 'Literal' &&
                    requiredTextFilter.test(t.object.value) &&
                    !items.has(t.subject)
                ) {
                    items.set(t.subject, {term: t.subject});
                }
            }
            requiredTextFilter = undefined;
        }

        const linkedElements: DataProviderLookupItem[] = [];
        const limit = typeof params.limit === 'number' ? params.limit : Number.POSITIVE_INFINITY;
        for (const item of items.values()) {
            if (linkedElements.length >= limit) {
                break;
            }
            let labels: Rdf.Literal[];
            if (this.labelPredicate) {
                labels = findLiterals(this.dataset, item.term, this.labelPredicate);
                if (requiredTextFilter) {
                    let foundMatch = false;
                    for (const label of labels) {
                        if (requiredTextFilter.test(label.value)) {
                            foundMatch = true;
                            break;
                        }
                    }
                    if (!foundMatch) {
                        continue;
                    }
                }
            } else {
                labels = [];
            }
            const imageTerm = this.imagePredicate
                ? findFirstIriOrLiteral(this.dataset, item.term, this.imagePredicate)
                : undefined;
            const model: ElementModel = {
                id: this.encodeTerm(item.term) as ElementIri,
                types: findTypes(this.dataset, item.term, this.typePredicate),
                label: labels,
                image: imageTerm ? imageTerm.value : undefined,
                properties: {},
            };
            linkedElements.push({
                element: model,
                inLinks: item.inLinks ?? this.EMPTY_LINKS,
                outLinks: item.outLinks ?? this.EMPTY_LINKS,
            });
        }

        return Promise.resolve(linkedElements);
    }

    private computeTypeCounts(): Map<ElementTypeIri, number> {
        const instanceCounts = new Map<ElementTypeIri, number>();
        for (const t of this.dataset.iterateMatches(null, this.typePredicate, null)) {
            if (isResourceTerm(t.object)) {
                const elementTypeId = this.encodeTerm(t.object) as ElementTypeIri;
                instanceCounts.set(elementTypeId, (instanceCounts.get(elementTypeId) ?? 0) + 1);
            }
        }
        return instanceCounts;
    }

    private computeLinkCounts(
        onlyLinkTypes?: ReadonlyArray<LinkTypeIri>
    ): Map<LinkTypeIri, number> {
        const linkTypeSet = onlyLinkTypes ? new Set(onlyLinkTypes) : undefined;
        const linkStats = new Map<LinkTypeIri, number>();
        for (const t of this.dataset) {
            if (t.predicate.termType === 'NamedNode') {
                const linkTypeId = this.encodeTerm(t.predicate) as LinkTypeIri;
                if (!linkTypeSet || linkTypeSet.has(linkTypeId)) {
                    linkStats.set(linkTypeId, (linkStats.get(linkTypeId) ?? 0) + 1);
                }
            }
        }
        return linkStats;
    }
}

function isResourceTerm(term: Rdf.Term): term is Rdf.NamedNode | Rdf.BlankNode {
    switch (term.termType) {
        case 'NamedNode':
        case 'BlankNode':
            return true;
        default:
            return false;
    }
}

function findFirstIriOrLiteral(
    dataset: MemoryDataset,
    subject: Rdf.NamedNode | Rdf.BlankNode | Rdf.Quad,
    predicate: Rdf.NamedNode
): Rdf.NamedNode | Rdf.Literal | undefined {
    for (const t of dataset.iterateMatches(subject, predicate, null)) {
        if (
            Rdf.equalTerms(t.predicate, predicate) &&
            (t.object.termType === 'NamedNode' || t.object.termType === 'Literal')
        ) {
            return t.object;
        }
    }
    return undefined;
}

function findTypes(
    dataset: MemoryDataset,
    subject: Rdf.NamedNode | Rdf.BlankNode | Rdf.Quad,
    predicate: Rdf.NamedNode
): ElementTypeIri[] {
    const typeSet = new Set<ElementTypeIri>();
    for (const t of dataset.iterateMatches(subject, predicate, null)) {
        if (isResourceTerm(t.object)) {
            const typeId = encodeTerm(t.object) as ElementTypeIri;
            typeSet.add(typeId);
        }
    }
    return Array.from(typeSet).sort();
}

function findLiterals(
    dataset: MemoryDataset,
    subject: Rdf.NamedNode | Rdf.BlankNode | Rdf.Quad,
    predicate: Rdf.NamedNode
): Rdf.Literal[] {
    const literals: Rdf.Literal[] = [];
    for (const t of dataset.iterateMatches(subject, predicate, null)) {
        if (Rdf.equalTerms(t.predicate, predicate) && t.object.termType === 'Literal') {
            literals.push(t.object);
        }
    }
    return literals;
}

function findProperties(
    dataset: MemoryDataset,
    subject: Rdf.NamedNode | Rdf.BlankNode | Rdf.Quad
): { [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> } {
    const properties: { [id: string]: Array<Rdf.NamedNode | Rdf.Literal> } = {};
    for (const t of dataset.iterateMatches(subject, null, null)) {
        if (t.predicate.termType === 'NamedNode' && t.object.termType === 'Literal') {
            const propertyId = encodeTerm(t.predicate);
            let values: Array<Rdf.NamedNode | Rdf.Literal>;
            if (Object.prototype.hasOwnProperty.call(properties, propertyId)) {
                values = properties[propertyId];
            } else {
                values = [];
                properties[propertyId] = values;
            }
            values.push(t.object);
        }
    }
    return properties;
}

function encodeTerm(term: Rdf.NamedNode | Rdf.BlankNode): string {
    switch (term.termType) {
        case 'NamedNode':
            return term.value;
        case 'BlankNode':
            return BLANK_PREFIX + term.value;
        default:
            throw new Error(
                `Unexpected term type to encode: ${(term as Rdf.Term).termType}`
            );
    }
}

function decodeTerm(
    iri: ElementIri | ElementTypeIri | LinkTypeIri | PropertyTypeIri,
    factory: Rdf.DataFactory
): Rdf.NamedNode | Rdf.BlankNode {
    if (iri.startsWith(BLANK_PREFIX)) {
        return factory.blankNode(iri.substring(BLANK_PREFIX.length));
    } else {
        return factory.namedNode(iri);
    }
}

function escapeRegexp(token: string): string {
    return token.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}
