import { HashSet } from '@reactodia/hashmap';

import {
    ElementTypeGraph, ElementTypeModel, LinkTypeModel, ElementModel, LinkModel, PropertyTypeModel,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri, SubtypeEdge,
    hashSubtypeEdge, equalSubtypeEdges,
} from '../model';
import {
    DataProvider, DataProviderLinkCount, DataProviderLookupParams, DataProviderLookupItem,
    DataProviderPatternSupport, LookupPattern, lookupPatternOf,
} from '../dataProvider';
import { RdfExpressionEvaluator, StandardFunctions } from '../rdfExpressions';
import { makeCaseInsensitiveFilter } from '../utils';

import { matchPattern, encodeTerm, decodeTerm, isResourceTerm } from './datasetLookup';
import { MemoryDataset, IndexQuadBy, indexedDataset } from './memoryDataset';
import * as Rdf from './rdfModel';
import { owl, rdf, rdfs, schema } from './vocabulary';

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
     * RDF graph predicate to determine resource types.
     *
     * @default "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
     */
    readonly typePredicate?: string;
    /**
     * RDF graph predicate for entity, type and property labels.
     *
     * @default "http://www.w3.org/2000/01/rdf-schema#label"
     */
    readonly labelPredicate?: string | null;
    /**
     * RDF graph predicate for entity thumbnail IRIs.
     *
     * @default "https://schema.org/thumbnailUrl"
     */
    readonly imagePredicate?: string | null;
    /**
     * RDF graph predicates which should be treated as "datatype properties"
     * for entities and relations.
     *
     * @default []
     */
    readonly datatypePredicates?: readonly string[];
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
     *   "http://www.w3.org/1999/02/22-rdf-syntax-ns#Property"
     * ]
     * ```
     */
    readonly propertyOrLinkBaseTypes?: ReadonlyArray<string>;
    /**
     * **Default**:
     * ```json
     * [
     *   "http://www.w3.org/2002/07/owl#DatatypeProperty"
     * ]
     * ```
     */
    readonly propertyTypeBaseTypes?: ReadonlyArray<string>;
    /**
     * **Default**:
     * ```json
     * [
     *   "http://www.w3.org/2002/07/owl#ObjectProperty"
     * ]
     * ```
     */
    readonly linkTypeBaseTypes?: ReadonlyArray<string>;
    /**
     * Whether to compute {@link LinkTypeModel.count} value based on links in the dataset.
     *
     * @default false
     */
    readonly countLinks?: boolean;
}

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

    private readonly evaluator: RdfExpressionEvaluator;

    private readonly typePredicate: Rdf.NamedNode;
    private readonly labelPredicate: Rdf.NamedNode | null;
    private readonly imagePredicate: Rdf.NamedNode | null;
    private readonly datatypePredicates: ReadonlySet<PropertyTypeIri>;
    private readonly elementTypeBaseTypes: ReadonlyArray<Rdf.NamedNode>;
    private readonly elementSubtypePredicate: Rdf.NamedNode | null;
    private readonly propertyOrLinkBaseTypes: ReadonlyArray<Rdf.NamedNode>;
    private readonly propertyTypeBaseTypes: ReadonlyArray<Rdf.NamedNode>;
    private readonly linkTypeBaseTypes: ReadonlyArray<Rdf.NamedNode>;
    private readonly countLinks: boolean;

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
        this.evaluator = new RdfExpressionEvaluator({
            factory: this.factory,
            functions: StandardFunctions,
        });
        this.typePredicate = this.factory.namedNode(options.typePredicate ?? rdf.type);
        this.labelPredicate = options.labelPredicate === null
            ? null : this.factory.namedNode(options.labelPredicate ?? rdfs.label);
        this.imagePredicate = options.imagePredicate === null
            ? null : this.factory.namedNode(options.imagePredicate ?? schema.thumbnailUrl);
        this.datatypePredicates = new Set(options.datatypePredicates ?? []);
        this.elementTypeBaseTypes = (options.elementTypeBaseTypes ?? [owl.Class, rdfs.Class])
            .map(iri => this.factory.namedNode(iri));
        this.elementSubtypePredicate = options.elementSubtypePredicate === null
            ? null : this.factory.namedNode(options.elementSubtypePredicate ?? rdfs.subClassOf);
        this.propertyOrLinkBaseTypes = (options.propertyOrLinkBaseTypes ?? [rdf.Property])
            .map(iri => this.factory.namedNode(iri));
        this.propertyTypeBaseTypes = (options.propertyTypeBaseTypes ?? [owl.DatatypeProperty])
            .map(iri => this.factory.namedNode(iri));
        this.linkTypeBaseTypes = (options.linkTypeBaseTypes ?? [owl.ObjectProperty])
            .map(iri => this.factory.namedNode(iri));
        this.countLinks = options.countLinks ?? false;
    }

    /**
     * Adds [RDF/JS-compatible](https://rdf.js.org/data-model-spec/) graph in a form of quads (triplets)
     * to be able to query it via this provider's methods.
     */
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

    /**
     * Removes all previously added graphs to this provider so it becomes empty.
     */
    clear(): void {
        this.dataset.clear();
    }

    /**
     * Encodes [RDF/JS-compatible](https://rdf.js.org/data-model-spec/) resource-like term
     * (named node or blank) into a plain string:
     *  - IRI (named node) value is returned as-is;
     *  - blank node is value is prepended with a prefix `urn:reactodia:blank:rdf:`.
     *
     * @see {@link RdfDataProvider.decodeTerm}
     */
    encodeTerm(term: Rdf.NamedNode | Rdf.BlankNode): string {
        return encodeTerm(term);
    }

    /**
     * Decodes a previously encoded by {@link RdfDataProvider.encodeTerm} resource-like term
     * (named node or blank) back from a plain string.
     *
     * @see {@link RdfDataProvider.encodeTerm}
     */
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
                    const elementTypeId: ElementTypeIri = this.encodeTerm(t.subject);
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
                    const derivedTypeId: ElementTypeIri = this.encodeTerm(t.subject);
                    if (!typeCounts.has(derivedTypeId)) {
                        typeCounts.set(derivedTypeId, 0);
                    }
                    const baseTypeId: ElementTypeIri = this.encodeTerm(t.object);
                    if (!typeCounts.has(baseTypeId)) {
                        typeCounts.set(baseTypeId, 0);
                    }
                    foundEdges.add([
                        this.encodeTerm(t.subject),
                        this.encodeTerm(t.object),
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

    lookupElementTypes(params: {
        text: string;
        limit?: number;
        signal?: AbortSignal;
    }): Promise<ElementTypeModel[]> {
        const {text, limit} = params;
        return Promise.resolve(this.lookupSchemaItems({
            includeTypes: this.elementTypeBaseTypes,
            excludeTypes: [],
            allowBlanks: true,
            createItem: (id, label): ElementTypeModel => ({id: this.encodeTerm(id), label}),
            text,
            limit,
        }));
    }

    lookupPropertyTypes(params: {
        text: string;
        limit?: number;
        signal?: AbortSignal;
    }): Promise<PropertyTypeModel[]> {
        const {text, limit} = params;
        return Promise.resolve(this.lookupSchemaItems({
            includeTypes: [
                ...this.propertyOrLinkBaseTypes,
                ...this.propertyTypeBaseTypes,
            ],
            excludeTypes: this.linkTypeBaseTypes,
            createItem: (id, label): PropertyTypeModel => ({id: this.encodeTerm(id), label}),
            text,
            limit,
        }));
    }

    lookupLinkTypes(params: {
        text: string;
        limit?: number;
        signal?: AbortSignal;
    }): Promise<LinkTypeModel[]> {
        const {text, limit} = params;
        const linkCounts = this.computeLinkCounts();
        return Promise.resolve(this.lookupSchemaItems({
            includeTypes: [
                ...this.propertyOrLinkBaseTypes,
                ...this.linkTypeBaseTypes,
            ],
            excludeTypes: this.propertyTypeBaseTypes,
            createItem: (idTerm, label): LinkTypeModel => {
                const id = this.encodeTerm(idTerm);
                const count = linkCounts.get(id);
                return {id, label, count};
            },
            text,
            limit,
        }));
    }

    private lookupSchemaItems<T>(params: {
        includeTypes: readonly Rdf.NamedNode[],
        excludeTypes: readonly Rdf.NamedNode[],
        allowBlanks?: boolean,
        createItem: (id: Rdf.NamedNode | Rdf.BlankNode, label: Rdf.Literal[]) => T,
        text: string;
        limit?: number;
    }): T[] {
        const {includeTypes, excludeTypes, allowBlanks, createItem, text} = params;
        const limit = typeof params.limit === 'number' ? params.limit : Number.POSITIVE_INFINITY;
        const seenIds = new HashSet<Rdf.NamedNode | Rdf.BlankNode>(Rdf.hashTerm, Rdf.equalTerms);
        const items: T[] = [];
        const textFilter = makeCaseInsensitiveFilter(text);
        lookup: for (const baseType of includeTypes) {
            const includeMatches = this.dataset.iterateMatches(null, this.typePredicate, baseType);
            nextId: for (const {subject: id} of includeMatches) {
                if (items.length >= limit) {
                    break lookup;
                }
                if (
                    !(id.termType === 'NamedNode' || (allowBlanks && id.termType === 'BlankNode')) ||
                    seenIds.has(id)
                ) {
                    continue nextId;
                }

                seenIds.add(id);

                for (const excludedType of excludeTypes) {
                    if (this.dataset.hasMatches(id, this.typePredicate, excludedType)) {
                        continue nextId;
                    }
                }

                const label = this.labelPredicate
                    ? findLiterals(this.dataset, id, this.labelPredicate)
                    : [];
                if (label.some(v => textFilter(v.value))) {
                    items.push(createItem(id, label));
                }
            }
        }
        return items;
    }

    knownLinkTypes(params: {
        signal?: AbortSignal;
    }): Promise<LinkTypeModel[]> {
        const linkCounts = this.computeLinkCounts();
        for (const baseType of this.linkTypeBaseTypes) {
            for (const t of this.dataset.iterateMatches(null, this.typePredicate, baseType)) {
                if (isResourceTerm(t.subject)) {
                    const linkTypeId: LinkTypeIri = this.encodeTerm(t.subject);
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
                const model: ElementModel = {
                    id: elementId,
                    types: findTypes(this.dataset, elementIri, this.typePredicate),
                    properties: findProperties(this.dataset, elementIri, this.datatypePredicates),
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
                (!linkTypeSet || linkTypeSet.has(t.predicate.value))
            ) {
                const properties = findProperties(this.dataset, t, this.datatypePredicates);
                links.push({
                    sourceId: this.encodeTerm(t.subject),
                    targetId: this.encodeTerm(t.object),
                    linkTypeId: this.encodeTerm(t.predicate),
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
                const linkTypeIri: LinkTypeIri = this.encodeTerm(t.predicate);
                outCounts.set(linkTypeIri, (outCounts.get(linkTypeIri) ?? 0) + 1);
            }
        }

        const inCounts = new Map<LinkTypeIri, number>();
        for (const t of this.dataset.iterateMatches(null, null, elementIri)) {
            if (t.predicate.termType === 'NamedNode' && isResourceTerm(t.subject)) {
                const linkTypeIri: LinkTypeIri = this.encodeTerm(t.predicate);
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

    supportsPattern(pattern: LookupPattern): DataProviderPatternSupport {
        return {ok: true, errors: []};
    }

    lookup(params: DataProviderLookupParams): Promise<DataProviderLookupItem[]> {
        const fullPattern = lookupPatternOf(params);
        const items = matchPattern(fullPattern, {
            factory: this.factory,
            dataset: this.dataset,
            evaluator: this.evaluator,
            typePredicate: this.typePredicate,
            labelPredicate: this.labelPredicate,
        });

        const linkedElements: DataProviderLookupItem[] = [];
        const limit = typeof params.limit === 'number' ? params.limit : Number.POSITIVE_INFINITY;
        for (const item of items.values()) {
            if (linkedElements.length >= limit) {
                break;
            }

            let properties: ElementModel['properties'] = {};

            if (this.labelPredicate) {
                const labels = findLiterals(this.dataset, item.term, this.labelPredicate);
                properties = {
                    ...properties,
                    [this.labelPredicate.value]: labels,
                };
            }

            if (this.imagePredicate) {
                const imageTerm = findFirstIriOrLiteral(this.dataset, item.term, this.imagePredicate);
                if (imageTerm) {
                    properties = {
                        ...properties,
                        [this.imagePredicate.value]: [imageTerm],
                    };
                }
            }

            const model: ElementModel = {
                id: this.encodeTerm(item.term),
                types: findTypes(this.dataset, item.term, this.typePredicate),
                properties,
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
                const elementTypeId: ElementTypeIri = this.encodeTerm(t.object);
                instanceCounts.set(elementTypeId, (instanceCounts.get(elementTypeId) ?? 0) + 1);
            }
        }
        return instanceCounts;
    }

    private computeLinkCounts(
        onlyLinkTypes?: ReadonlyArray<LinkTypeIri>
    ): Map<LinkTypeIri, number> {
        const linkStats = new Map<LinkTypeIri, number>();
        if (!this.countLinks) {
            return linkStats;
        }
        const linkTypeSet = onlyLinkTypes ? new Set(onlyLinkTypes) : undefined;
        for (const t of this.dataset) {
            if (t.predicate.termType === 'NamedNode') {
                const linkTypeId: LinkTypeIri = this.encodeTerm(t.predicate);
                if (!linkTypeSet || linkTypeSet.has(linkTypeId)) {
                    linkStats.set(linkTypeId, (linkStats.get(linkTypeId) ?? 0) + 1);
                }
            }
        }
        return linkStats;
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
            const typeId: ElementTypeIri = encodeTerm(t.object);
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
    subject: Rdf.NamedNode | Rdf.BlankNode | Rdf.Quad,
    datatypePredicates: ReadonlySet<PropertyTypeIri>
): { [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> } {
    const properties: { [id: string]: Array<Rdf.NamedNode | Rdf.Literal> } = {};
    for (const {predicate, object: v} of dataset.iterateMatches(subject, null, null)) {
        if (predicate.termType !== 'NamedNode') {
            continue;
        }
        if (
            v.termType === 'Literal' ||
            v.termType === 'NamedNode' && datatypePredicates.has(predicate.value)
        ) {
            const propertyId = encodeTerm(predicate);
            let values: Array<Rdf.NamedNode | Rdf.Literal>;
            if (Object.prototype.hasOwnProperty.call(properties, propertyId)) {
                values = properties[propertyId];
            } else {
                values = [];
                properties[propertyId] = values;
            }
            values.push(v);
        }
    }
    return properties;
}

