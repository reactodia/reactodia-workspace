import { HashSet } from '../../coreUtils/hashMap';

import {
    Dictionary, ClassModel, ClassGraphModel, LinkType, ElementModel, LinkModel, LinkCount, PropertyModel,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri, hashSubtypeEdge, equalSubtypeEdges,
} from '../model';
import { DataProvider, FilterParams, LinkedElement } from '../provider';

import { MemoryDataset, IndexQuadBy, makeIndexedDataset } from './memoryDataset';
import * as Rdf from './rdfModel';

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
     * @default "http://www.w3.org/2000/01/rdf-schema#type"
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

const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const OWL_DATATYPE_PROPERTY = 'http://www.w3.org/2002/07/owl#DatatypeProperty';
const OWL_OBJECT_PROPERTY = 'http://www.w3.org/2002/07/owl#ObjectProperty';

const RDF_PROPERTY = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#Property';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

const RDFS_CLASS = 'http://www.w3.org/2000/01/rdf-schema#Class';
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const RDFS_SUB_CLASS_OF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';

const SCHEMA_THUMBNAIL_URL = 'https://schema.org/thumbnailUrl';

export class RdfDataProvider implements DataProvider {
    readonly factory: Rdf.DataFactory;

    private readonly dataset: MemoryDataset;

    private readonly typePredicate: Rdf.NamedNode;
    private readonly labelPredicate: Rdf.NamedNode | null;
    private readonly imagePredicate: Rdf.NamedNode | null;
    private readonly elementTypeBaseTypes: ReadonlyArray<Rdf.NamedNode>;
    private readonly elementSubtypePredicate: Rdf.NamedNode | null;
    private readonly linkTypeBaseTypes: ReadonlyArray<Rdf.NamedNode>;

    private readonly EMPTY_LINKS: ReadonlySet<LinkTypeIri> = new Set();

    constructor(options: RdfDataProviderOptions = {}) {
        this.factory = options.factory ?? Rdf.DefaultDataFactory;
        this.dataset = makeIndexedDataset(
            IndexQuadBy.S |
            IndexQuadBy.SP |
            IndexQuadBy.O |
            IndexQuadBy.OP
        );
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
        this.dataset.addAll(quads);
    }

    encodeIri(iri: Rdf.NamedNode): string {
        return iri.value;
    }

    decodeIri(iri: ElementIri | ElementTypeIri | LinkTypeIri | PropertyTypeIri): Rdf.NamedNode {
        return this.factory.namedNode(iri);
    }

    classTree(params: {
        signal?: AbortSignal;
    }): Promise<ClassGraphModel> {
        const typeCounts = this.computeTypeCounts();
        for (const baseType of this.elementTypeBaseTypes) {
            for (const t of this.dataset.iterateMatches(null, this.typePredicate, baseType)) {
                if (t.subject.termType === 'NamedNode') {
                    const elementTypeId = this.encodeIri(t.subject) as ElementTypeIri;
                    if (!typeCounts.has(elementTypeId)) {
                        typeCounts.set(elementTypeId, 0);
                    }
                }
            }
        }
        const subtypeOf = new HashSet(hashSubtypeEdge, equalSubtypeEdges);
        if (this.elementSubtypePredicate) {
            for (const t of this.dataset.iterateMatches(null, this.elementSubtypePredicate, null)) {
                if (t.subject.termType === 'NamedNode' && t.object.termType === 'NamedNode') {
                    const derivedTypeId = this.encodeIri(t.subject) as ElementTypeIri;
                    if (!typeCounts.has(derivedTypeId)) {
                        typeCounts.set(derivedTypeId, 0);
                    }
                    const baseTypeId = this.encodeIri(t.object) as ElementTypeIri;
                    if (!typeCounts.has(baseTypeId)) {
                        typeCounts.set(baseTypeId, 0);
                    }
                    subtypeOf.add([
                        this.encodeIri(t.subject) as ElementTypeIri,
                        this.encodeIri(t.object) as ElementTypeIri
                    ]);
                }
            }
        }
        const classes: ClassModel[] = [];
        for (const [typeId, count] of typeCounts) {
            const typeIri = this.decodeIri(typeId);
            classes.push({
                id: typeId,
                label: this.labelPredicate
                    ? findLiterals(this.dataset, typeIri, this.labelPredicate)
                    : [],
                count,
            });
        }
        const classTree: ClassGraphModel = {
            classes,
            subtypeOf: Array.from(subtypeOf.values()),
        };
        return Promise.resolve(classTree);
    }

    linkTypes(params: {
        signal?: AbortSignal;
    }): Promise<LinkType[]> {
        const linkCounts = this.computeLinkCounts();
        for (const baseType of this.linkTypeBaseTypes) {
            for (const t of this.dataset.iterateMatches(null, this.typePredicate, baseType)) {
                if (t.subject.termType === 'NamedNode') {
                    const linkTypeId = this.encodeIri(t.subject) as LinkTypeIri;
                    if (!linkCounts.has(linkTypeId)) {
                        linkCounts.set(linkTypeId, 0);
                    }
                }
            }
        }
        const models = new Map<LinkTypeIri, LinkType>();
        for (const [linkTypeId, count] of linkCounts) {
            const linkTypeIri = this.decodeIri(linkTypeId);
            models.set(linkTypeId, {
                id: linkTypeId,
                label: this.labelPredicate
                    ? findLiterals(this.dataset, linkTypeIri, this.labelPredicate)
                    : [],
                count,
            });
        }
        return Promise.resolve(Array.from(models.values()));
    }

    classInfo(params: {
        classIds: ReadonlyArray<ElementTypeIri>;
        signal?: AbortSignal;
    }): Promise<ClassModel[]> {
        const {classIds} = params;
        const models: ClassModel[] = [];
        for (const classId of classIds) {
            const classIri = this.decodeIri(classId);
            let instanceCount = 0;
            for (const t of this.dataset.iterateMatches(null, this.typePredicate, classIri)) {
                instanceCount++;
            }
            const model: ClassModel = {
                id: classId,
                label: this.labelPredicate
                    ? findLiterals(this.dataset, classIri, this.labelPredicate)
                    : [],
                count: instanceCount,
            };
            models.push(model);
        }
        return Promise.resolve(models);
    }

    propertyInfo(params: {
        propertyIds: ReadonlyArray<PropertyTypeIri>;
        signal?: AbortSignal;
    }): Promise<Dictionary<PropertyModel>> {
        const {propertyIds} = params;
        const models: { [id: string]: PropertyModel } = {};
        for (const propertyId of propertyIds) {
            if (Object.prototype.hasOwnProperty.call(models, propertyId)) {
                continue;
            }
            const propertyIri = this.decodeIri(propertyId);
            const model: PropertyModel = {
                id: propertyId,
                label: this.labelPredicate
                    ? findLiterals(this.dataset, propertyIri, this.labelPredicate)
                    : [],
            };
            models[propertyId] = model;
        }
        return Promise.resolve(models);
    }

    linkTypesInfo(params: {
        linkTypeIds: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<LinkType[]> {
        const {linkTypeIds} = params;        
        const linkCounts = this.computeLinkCounts(linkTypeIds);
        const models: LinkType[] = [];
        for (const linkTypeId of linkTypeIds) {
            const linkTypeIri = this.decodeIri(linkTypeId);
            const model: LinkType = {
                id: linkTypeId,
                label: this.labelPredicate
                    ? findLiterals(this.dataset, linkTypeIri, this.labelPredicate)
                    : [],
                count: linkCounts.get(linkTypeId) ?? 0,
            };
            models.push(model);
        }
        return Promise.resolve(models);
    }

    elementInfo(params: {
        elementIds: ReadonlyArray<ElementIri>;
        signal?: AbortSignal;
    }): Promise<Dictionary<ElementModel>> {
        const {elementIds} = params;
        const result: { [id: string]: ElementModel } = {};
        for (const elementId of elementIds) {
            if (Object.prototype.hasOwnProperty.call(result, elementId)) {
                continue;
            }
            const elementIri = this.decodeIri(elementId);
            if (this.dataset.hasMatches(elementIri, null, null)) {
                const typeIris = findIris(this.dataset, elementIri, this.typePredicate);
                const imageTerm = this.imagePredicate
                    ? findFirstIriOrLiteral(this.dataset, elementIri, this.imagePredicate)
                    : undefined;
                const model: ElementModel = {
                    id: elementId,
                    types: typeIris.map(iri => this.encodeIri(iri) as ElementTypeIri),
                    label: this.labelPredicate
                        ? findLiterals(this.dataset, elementIri, this.labelPredicate)
                        : [],
                    image: imageTerm ? imageTerm.value : undefined,
                    properties: findProperties(this.dataset, elementIri),
                };
                result[elementId] = model;
            }
        }
        return Promise.resolve(result);
    }

    linksInfo(params: {
        elementIds: ReadonlyArray<ElementIri>;
        linkTypeIds?: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<LinkModel[]> {
        const {elementIds, linkTypeIds} = params;
        const targets = new Set<string>(elementIds);
        const linkTypeSet = linkTypeIds ? new Set<string>(linkTypeIds) : undefined;
        const links: LinkModel[] = [];
        // TODO avoid full scan
        for (const t of this.dataset) {
            if (
                t.subject.termType === 'NamedNode' &&
                t.predicate.termType === 'NamedNode' &&
                t.object.termType === 'NamedNode' &&
                (targets.has(t.subject.value) || targets.has(t.object.value)) &&
                (!linkTypeSet || !linkTypeSet.has(t.predicate.value))
            ) {
                const properties = findProperties(this.dataset, t);
                links.push({
                    sourceId: this.encodeIri(t.subject) as ElementIri,
                    targetId: this.encodeIri(t.object) as ElementIri,
                    linkTypeId: this.encodeIri(t.predicate) as LinkTypeIri,
                    properties,
                });
            }
        }
        return Promise.resolve(links);
    }

    linkTypesOf(params: {
        elementId: ElementIri;
        signal?: AbortSignal;
    }): Promise<LinkCount[]> {
        const {elementId} = params;
        const elementIri = this.decodeIri(elementId);
        
        const outCounts = new Map<LinkTypeIri, number>();
        for (const t of this.dataset.iterateMatches(elementIri, null, null)) {
            if (t.predicate.termType === 'NamedNode' && t.object.termType === 'NamedNode') {
                const linkTypeIri = this.encodeIri(t.predicate) as LinkTypeIri;
                outCounts.set(linkTypeIri, (outCounts.get(linkTypeIri) ?? 0) + 1);
            }
        }

        const inCounts = new Map<LinkTypeIri, number>();
        for (const t of this.dataset.iterateMatches(null, null, elementIri)) {
            if (t.predicate.termType === 'NamedNode' && t.subject.termType === 'NamedNode') {
                const linkTypeIri = this.encodeIri(t.predicate) as LinkTypeIri;
                outCounts.set(linkTypeIri, (outCounts.get(linkTypeIri) ?? 0) + 1);
            }
        }

        const counts: LinkCount[] = [];
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

    filter(params: FilterParams): Promise<LinkedElement[]> {
        interface ResultItem {
            readonly iri: Rdf.NamedNode;
            outLinks?: Set<LinkTypeIri>;
            inLinks?: Set<LinkTypeIri>;
        }

        const items = new Map<string, ResultItem>();
        let requiredTextFilter = params.text ? new RegExp(escapeRegexp(params.text), 'i') : undefined;

        if (params.refElementId) {
            const refElementIri = this.decodeIri(params.refElementId);
            const refLinkIri = params.refElementLinkId
                ? this.decodeIri(params.refElementLinkId) : null;
            for (const t of this.dataset.iterateMatches(refElementIri, refLinkIri, null)) {
                if (t.predicate.termType === 'NamedNode' && t.object.termType === 'NamedNode') {
                    const iri = t.object;
                    let item = items.get(iri.value);
                    if (!item) {
                        item = {iri};
                        items.set(iri.value, item);
                    }
                    const predicate = this.encodeIri(t.predicate) as LinkTypeIri;
                    if (!item.outLinks) {
                        item.outLinks = new Set();
                    }
                    item.outLinks.add(predicate);
                }
            }
            for (const t of this.dataset.iterateMatches(null, refLinkIri, refElementIri)) {
                if (t.predicate.termType === 'NamedNode' && t.subject.termType === 'NamedNode') {
                    const iri = t.subject;
                    let item = items.get(iri.value);
                    if (!item) {
                        item = {iri};
                        items.set(iri.value, item);
                    }
                    const predicate = this.encodeIri(t.predicate) as LinkTypeIri;
                    if (!item.inLinks) {
                        item.inLinks = new Set();
                    }
                    item.inLinks.add(predicate);
                }
            }
            // join with filtered by type
            if (params.elementTypeId) {
                const typeIri = this.decodeIri(params.elementTypeId);
                for (const item of Array.from(items.values())) {
                    if (!this.dataset.hasMatches(item.iri, this.typePredicate, typeIri)) {
                        items.delete(item.iri.value);
                    }
                }
            }
        } else if (params.elementTypeId) {
            const typeIri = this.decodeIri(params.elementTypeId);
            for (const t of this.dataset.iterateMatches(null, this.typePredicate, typeIri)) {
                if (t.subject.termType === 'NamedNode' && !items.has(t.subject.value)) {
                    items.set(t.subject.value, {iri: t.subject});
                }
            }
        } else if (requiredTextFilter && this.labelPredicate) {
            for (const t of this.dataset.iterateMatches(null, this.labelPredicate, null)) {
                if (
                    t.subject.termType === 'NamedNode' &&
                    t.object.termType === 'Literal' &&
                    requiredTextFilter.test(t.object.value) &&
                    !items.has(t.subject.value)
                ) {
                    items.set(t.subject.value, {iri: t.subject});
                }
            }
            requiredTextFilter = undefined;
        }

        const linkedElements: LinkedElement[] = [];
        const limit = typeof params.limit === 'number' ? params.limit : Number.POSITIVE_INFINITY;
        for (const item of items.values()) {
            if (linkedElements.length >= limit) {
                break;
            }
            let labels: Rdf.Literal[];
            if (this.labelPredicate) {
                labels = findLiterals(this.dataset, item.iri, this.labelPredicate);
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
            const typeIris = findIris(this.dataset, item.iri, this.typePredicate);
            const imageTerm = this.imagePredicate
                ? findFirstIriOrLiteral(this.dataset, item.iri, this.imagePredicate)
                : undefined;
            const model: ElementModel = {
                id: this.encodeIri(item.iri) as ElementIri,
                types: typeIris.map(iri => this.encodeIri(iri) as ElementTypeIri),
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
            if (t.object.termType === 'NamedNode') {
                const elementTypeId = this.encodeIri(t.object) as ElementTypeIri;
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
                const linkTypeId = this.encodeIri(t.predicate) as LinkTypeIri;
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

function findIris(
    dataset: MemoryDataset,
    subject: Rdf.NamedNode | Rdf.BlankNode | Rdf.Quad,
    predicate: Rdf.NamedNode
): Rdf.NamedNode[] {
    const iris: Rdf.NamedNode[] = [];
    for (const t of dataset.iterateMatches(subject, predicate, null)) {
        if (t.object.termType === 'NamedNode') {
            iris.push(t.object);
        }
    }
    return iris;
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
        if (t.object.termType === 'Literal') {
            let values: Array<Rdf.NamedNode | Rdf.Literal>;
            if (Object.prototype.hasOwnProperty.call(properties, t.predicate.value)) {
                values = properties[t.predicate.value];
            } else {
                values = [];
                properties[t.predicate.value] = values;
            }
            values.push(t.object);
        }
    }
    return properties;
}

function escapeRegexp(token: string): string {
    return token.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}
