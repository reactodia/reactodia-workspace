import { shallowArrayEqual } from '../coreUtils/collections';

import { hashFnv32a } from '../data/utils';
import * as Rdf from './rdf/rdfModel';

/**
 * Nominal (branded) type for element IRI, i.e. unique ID string.
 */
export type ElementIri = string & { readonly elementBrand: void };
/**
 * Nominal (branded) type for element type IRI, i.e. unique ID string.
 */
export type ElementTypeIri = string & { readonly classBrand: void };
/**
 * Nominal (branded) type for link type IRI, i.e. unique ID string.
 */
export type LinkTypeIri = string & { readonly linkTypeBrand: void };
/**
 * Nominal (branded) type for property type IRI, i.e. unique ID string.
 */
export type PropertyTypeIri = string & { readonly propertyTypeBrand: void };

export type LinkDirection = 'in' | 'out';

/**
 * Describes a graph of element types (nodes) and "subtype of" relations
 * between them (edges).
 */
export interface ElementTypeGraph {
    readonly elementTypes: ReadonlyArray<ElementTypeModel>;
    readonly subtypeOf: ReadonlyArray<SubtypeEdge>;
}

export type SubtypeEdge = readonly [ElementTypeIri, ElementTypeIri];

export interface ElementModel {
    readonly id: ElementIri;
    readonly types: ReadonlyArray<ElementTypeIri>;
    readonly label: ReadonlyArray<Rdf.Literal>;
    readonly image?: string;
    readonly properties: { readonly [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> };
}

export interface LinkModel {
    readonly linkTypeId: LinkTypeIri;
    readonly sourceId: ElementIri;
    readonly targetId: ElementIri;
    readonly properties: { readonly [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> };
}

export interface ElementTypeModel {
    readonly id: ElementTypeIri;
    readonly label: ReadonlyArray<Rdf.Literal>;
    readonly count?: number;
}

export interface LinkTypeModel {
    readonly id: LinkTypeIri;
    readonly label: ReadonlyArray<Rdf.Literal>;
    readonly count?: number;
}

export interface PropertyTypeModel {
    readonly id: PropertyTypeIri;
    readonly label: ReadonlyArray<Rdf.Literal>;
}

export interface LinkCount {
    readonly id: LinkTypeIri;
    readonly inCount: number;
    readonly outCount: number;
    /**
     * If `true`, then `inCount` and `outCount` values might be not exact
     * in case when the values are non-zero.
     */
    readonly inexact?: boolean;
}

/**
 * Describes an element with information on which link types and directions
 * are used to connect it to other elements.
 */
export interface LinkedElement {
    readonly element: ElementModel;
    readonly inLinks: ReadonlySet<LinkTypeIri>;
    readonly outLinks: ReadonlySet<LinkTypeIri>;
}

export function isEncodedBlank(iri: string): boolean {
    return iri.startsWith('urn:reactodia:blank:');
}

export function hashSubtypeEdge(edge: SubtypeEdge): number {
    const [from, to] = edge;
    let hash = Rdf.hashString(from);
    hash = Rdf.chainHash(hash, Rdf.hashString(to));
    return Rdf.dropHighestNonSignBit(hash);
}

export function equalSubtypeEdges(a: SubtypeEdge, b: SubtypeEdge): boolean {
    const [aFrom, aTo] = a;
    const [bFrom, bTo] = b;
    return aFrom === bFrom && aTo === bTo;
}

export function equalLinks(left: LinkModel, right: LinkModel) {
    return (
        left.linkTypeId === right.linkTypeId &&
        left.sourceId === right.sourceId &&
        left.targetId === right.targetId
    );
}

export function hashLink(link: LinkModel): number {
    const {linkTypeId, sourceId, targetId} = link;
    let hash = hashFnv32a(linkTypeId);
    hash = hash * 31 + hashFnv32a(sourceId);
    hash = hash * 31 + hashFnv32a(targetId);
    return hash;
}

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

function equalProperties(
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
