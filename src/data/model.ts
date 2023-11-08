import { shallowArrayEqual } from '../coreUtils/collections';

import { hashFnv32a } from '../data/utils';
import * as Rdf from './rdf/rdfModel';

/**
 * @deprecated
 */
export interface Dictionary<T> { [key: string]: T; }

export type ElementIri = string & { readonly elementBrand: void };
export type ElementTypeIri = string & { readonly classBrand: void };
export type LinkTypeIri = string & { readonly linkTypeBrand: void };
export type PropertyTypeIri = string & { readonly propertyTypeBrand: void };

export interface ClassGraphModel {
    readonly classes: ReadonlyArray<ClassModel>;
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

export interface ClassModel {
    readonly id: ElementTypeIri;
    readonly label: ReadonlyArray<Rdf.Literal>;
    readonly count?: number;
}

export interface LinkCount {
    readonly id: LinkTypeIri;
    readonly inCount: number;
    readonly outCount: number;
}

export interface LinkType {
    readonly id: LinkTypeIri;
    readonly label: ReadonlyArray<Rdf.Literal>;
    readonly count?: number;
}

export interface PropertyModel {
    readonly id: PropertyTypeIri;
    readonly label: ReadonlyArray<Rdf.Literal>;
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

export function sameLink(left: LinkModel, right: LinkModel) {
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

export function sameElement(a: ElementModel, b: ElementModel): boolean {
    return (
        a.id === b.id &&
        shallowArrayEqual(a.types, b.types) &&
        termArrayEqual(a.label, b.label) &&
        a.image === b.image &&
        propertiesEqual(a.properties, b.properties)
    );
}

function termArrayEqual(a: ReadonlyArray<Rdf.Term>, b: ReadonlyArray<Rdf.Term>): boolean {
    if (a.length !== b.length) { return false; }
    for (let i = 0; i < a.length; i++) {
        if (!Rdf.equalTerms(a[i], b[i])) {
            return false;
        }
    }
    return true;
}

function propertiesEqual(
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
            if (!termArrayEqual(aValues, bValues)) {
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
