import { shallowArrayEqual } from '../coreUtils/collections';

import { hashFnv32a } from '../data/utils';
import * as Rdf from './rdf/rdfModel';

/**
 * Nominal (branded) type for element (graph node) IRI, i.e. unique ID string.
 */
export type ElementIri = string & { readonly __iriBrand?: 'element' };
/**
 * Nominal (branded) type for element (graph node) type IRI, i.e. unique ID string.
 */
export type ElementTypeIri = string & { readonly __iriBrand?: 'elementType' };
/**
 * Nominal (branded) type for link (graph edge) type IRI, i.e. unique ID string.
 */
export type LinkTypeIri = string & { readonly __iriBrand?: 'linkType' };
/**
 * Nominal (branded) type for property type IRI, i.e. unique ID string.
 */
export type PropertyTypeIri = string & { readonly __iriBrand?: 'propertyType' };

/**
 * Link (graph edge) direction: `in` for incoming, `out` for outgoing.
 */
export type LinkDirection = 'in' | 'out';

/**
 * Describes a graph of element types (nodes) and "subtype of" relations
 * between them (edges).
 *
 * @category Data
 */
export interface ElementTypeGraph {
    readonly elementTypes: ReadonlyArray<ElementTypeModel>;
    readonly subtypeOf: ReadonlyArray<SubtypeEdge>;
}

/**
 * "Subtype of" relation between derived element type and its base type.
 *
 * @category Data
 * @see {@link ElementTypeGraph}
 */
export type SubtypeEdge = readonly [derived: ElementTypeIri, base: ElementTypeIri];

/**
 * Element (graph node) data.
 *
 * @category Data
 */
export interface ElementModel {
    readonly id: ElementIri;
    readonly types: ReadonlyArray<ElementTypeIri>;
    readonly label: ReadonlyArray<Rdf.Literal>;
    readonly image?: string;
    readonly properties: { readonly [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> };
}

/**
 * A `{source, target, type}` tuple which uniquely identifies a link (graph edge).
 *
 * @category Data
 */
export interface LinkKey {
    readonly linkTypeId: LinkTypeIri;
    readonly sourceId: ElementIri;
    readonly targetId: ElementIri;
}

/**
 * Link (graph edge) data.
 *
 * @category Data
 */
export interface LinkModel {
    readonly linkTypeId: LinkTypeIri;
    readonly sourceId: ElementIri;
    readonly targetId: ElementIri;
    readonly properties: { readonly [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> };
}

/**
 * Element (graph node) type data.
 *
 * @category Data
 */
export interface ElementTypeModel {
    readonly id: ElementTypeIri;
    readonly label: ReadonlyArray<Rdf.Literal>;
    readonly count?: number;
}

/**
 * Link (graph edge) type data.
 *
 * @category Data
 */
export interface LinkTypeModel {
    readonly id: LinkTypeIri;
    readonly label: ReadonlyArray<Rdf.Literal>;
    readonly count?: number;
}

/**
 * Property type data.
 *
 * @category Data
 */
export interface PropertyTypeModel {
    readonly id: PropertyTypeIri;
    readonly label: ReadonlyArray<Rdf.Literal>;
}

/**
 * Returns `true` if IRI represents an anonymous entity specific to the data provider;
 * otherwise `false`.
 *
 * The represented entity can only be decoded by a {@link DataProvider} with a support
 * for the specific blank node subtype, determined by the IRI prefix, e.g.:
 *   - `urn:reactodia:blank:rdf:*` encodes RDF blank nodes from {@link RdfDataProvider};
 *   - `urn:reactodia:blank:sparql:*` encodes outer graph content for blank nodes
 *     from {@link SparqlDataProvider};
 *   - etc.
 *
 * @category Data
 */
export function isEncodedBlank(iri: string): boolean {
    return iri.startsWith('urn:reactodia:blank:');
}

/**
 * Computes a hash code for {@link SubtypeEdge} value.
 *
 * @category Data
 */
export function hashSubtypeEdge(edge: SubtypeEdge): number {
    const [from, to] = edge;
    let hash = Rdf.hashString(from);
    hash = Rdf.chainHash(hash, Rdf.hashString(to));
    return Rdf.dropHighestNonSignBit(hash);
}

/**
 * Computes whether {@link SubtypeEdge} values are the same.
 *
 * @category Data
 */
export function equalSubtypeEdges(a: SubtypeEdge, b: SubtypeEdge): boolean {
    const [aFrom, aTo] = a;
    const [bFrom, bTo] = b;
    return aFrom === bFrom && aTo === bTo;
}

/**
 * Computes whether {@link LinkKey} values are the same.
 *
 * @category Data
 */
export function equalLinks(left: LinkKey, right: LinkKey) {
    return (
        left.linkTypeId === right.linkTypeId &&
        left.sourceId === right.sourceId &&
        left.targetId === right.targetId
    );
}

/**
 * Computes a hash code for {@link LinkKey} value.
 *
 * @category Data
 */
export function hashLink(link: LinkKey): number {
    const {linkTypeId, sourceId, targetId} = link;
    let hash = hashFnv32a(linkTypeId);
    hash = hash * 31 + hashFnv32a(sourceId);
    hash = hash * 31 + hashFnv32a(targetId);
    return hash;
}

/**
 * Computes whether {@link ElementModel} values are the same, including property values.
 *
 * @category Data
 */
export function equalElements(a: ElementModel, b: ElementModel): boolean {
    return (
        a.id === b.id &&
        shallowArrayEqual(a.types, b.types) &&
        equalTermArrays(a.label, b.label) &&
        a.image === b.image &&
        equalProperties(a.properties, b.properties)
    );
}

function equalTermArrays(a: ReadonlyArray<Rdf.Term>, b: ReadonlyArray<Rdf.Term>): boolean {
    if (a.length !== b.length) { return false; }
    for (let i = 0; i < a.length; i++) {
        if (!Rdf.equalTerms(a[i], b[i])) {
            return false;
        }
    }
    return true;
}

export function equalProperties(
    a: { readonly [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> },
    b: { readonly [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> }
) {
    for (const key in a) {
        if (Object.prototype.hasOwnProperty.call(a, key)) {
            if (!Object.prototype.hasOwnProperty.call(b, key)) {
                return false;
            }
            const aValues = a[key];
            const bValues = b[key];
            if (!equalTermArrays(aValues, bValues)) {
                return false;
            }
        }
    }
    for (const key in b) {
        if (Object.prototype.hasOwnProperty.call(b, key)) {
            if (!Object.prototype.hasOwnProperty.call(a, key)) {
                return false;
            }
        }
    }
    return true;
}
