import * as N3 from 'n3';
import * as RdfJs from '@rdfjs/types';

import { hashFnv32a } from '../utils';
import { escapeRdfValue } from './rdfEscape';

export type NamedNode<T extends string = string> = RdfJs.NamedNode<T>;
export type BlankNode = RdfJs.BlankNode;
export type Literal = RdfJs.Literal;
export type Variable = RdfJs.Variable;
export type DefaultGraph = RdfJs.DefaultGraph;
export type Quad = RdfJs.Quad;

export type Term = NamedNode | BlankNode | Literal | Variable | DefaultGraph | Quad;
export type DataFactory = RdfJs.DataFactory;

export const DefaultDataFactory: RdfJs.DataFactory = N3.DataFactory;

export function looksLikeTerm(value: unknown): value is Term {
    if (!(
        typeof value === 'object' && value &&
        'termType' in value &&
        'equals' in value &&
        typeof value.equals === 'function'
    )) {
        return false;
    }
    const {termType} = value as Term;
    switch (termType) {
        case 'NamedNode':
        case 'Literal':
        case 'BlankNode':
        case 'DefaultGraph':
        case 'Variable':
        case 'Quad':
            return true;
        default:
            return false;
    }
}

export function termToString(node: Term): string {
    switch (node.termType) {
        case 'NamedNode':
            return `<${escapeRdfValue(node.value)}>`;
        case 'BlankNode':
            return `_:${node.value}`;
        case 'Literal': {
            const { value, language, datatype } = node;
            const stringLiteral = `"${escapeRdfValue(value)}"`;
            if (language) {
                return stringLiteral + `@${language}`;
            } else if (datatype) {
                return stringLiteral + '^^' + termToString(datatype);
            } else {
                return stringLiteral;
            }
        }
        case 'DefaultGraph':
            return '(default graph)';
        case 'Variable':
            return `?${node.value}`;
        case 'Quad': {
            let str = '<< ';
            str += termToString(node.subject) + ' ';
            str += termToString(node.predicate) + ' ';
            str += termToString(node.object) + ' ';
            if (node.graph.termType !== 'DefaultGraph') {
                str += termToString(node.graph) + ' ';
            }
            str += '>>';
            return str;
        }
    }
}

export function hashTerm(node: Term): number {
    let hash = 0;
    switch (node.termType) {
        case 'NamedNode':
        case 'BlankNode':
            hash = hashFnv32a(node.value);
            break;
        case 'Literal':
            hash = hashFnv32a(node.value);
            if (node.datatype) {
                hash = (Math.imul(hash, 31) + hashFnv32a(node.datatype.value)) | 0;
            }
            if (node.language) {
                hash = (Math.imul(hash, 31) + hashFnv32a(node.language)) | 0;
            }
            break;
        case 'Variable':
            hash = hashFnv32a(node.value);
            break;
        case 'Quad': {
            hash = (Math.imul(hash, 31) + hashTerm(node.subject)) | 0;
            hash = (Math.imul(hash, 31) + hashTerm(node.predicate)) | 0;
            hash = (Math.imul(hash, 31) + hashTerm(node.object)) | 0;
            hash = (Math.imul(hash, 31) + hashTerm(node.graph)) | 0;
            break;
        }
    }
    return dropHighestNonSignBit(hash);
}

export function hashString(str: string): number {
    return hashFnv32a(str);
}

export function chainHash(hash: number, added: number): number {
    return (Math.imul(hash, 31) + added) | 0;
}

export function dropHighestNonSignBit(i32: number): number {
    return ((i32 >>> 1) & 0x40000000) | (i32 & 0xBFFFFFFF);
}

export function equalTerms(a: Term, b: Term): boolean {
    if (a.termType !== b.termType) {
        return false;
    }
    switch (a.termType) {
        case 'NamedNode':
        case 'BlankNode':
        case 'Variable':
        case 'DefaultGraph': {
            const { value } = b as NamedNode | BlankNode | Variable | DefaultGraph;
            return a.value === value;
        }
        case 'Literal': {
            const { value, language, datatype } = b as Literal;
            return a.value === value
                && a.datatype.value === datatype.value
                && a.language === language;
        }
        case 'Quad': {
            const { subject, predicate, object, graph } = b as Quad;
            return (
                equalTerms(a.subject, subject) &&
                equalTerms(a.predicate, predicate) &&
                equalTerms(a.object, object) &&
                equalTerms(a.graph, graph)
            );
        }
    }
}

export function hashQuad(quad: Quad): number {
    return hashTerm(quad);
}

export function equalQuads(a: Quad, b: Quad): boolean {
    return equalTerms(a, b);
}
