import type * as RdfJs from '@rdfjs/types';
import { chainHash, dropHighestNonSignBit, hashString } from '@reactodia/hashmap';
import * as N3 from 'n3';

import { JsonLiteral } from './jsonLiteral';
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

export { JsonLiteral };

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
        case 'BlankNode': {
            hash = hashString(node.value);
            break;
        }
        case 'Literal': {
            const json = JsonLiteral.fromLiteral(node);
            if (json) {
                return JsonLiteral.hash(json);
            }
            hash = hashString(node.value);
            if (node.datatype) {
                hash = chainHash(hash, hashString(node.datatype.value));
            }
            if (node.language) {
                hash = chainHash(hash, hashString(node.language));
            }
            break;
        }
        case 'Variable': {
            hash = hashString(node.value);
            break;
        }
        case 'Quad': {
            hash = chainHash(hash, hashTerm(node.subject));
            hash = chainHash(hash, hashTerm(node.predicate));
            hash = chainHash(hash, hashTerm(node.object));
            hash = chainHash(hash, hashTerm(node.graph));
            break;
        }
    }
    return dropHighestNonSignBit(hash);
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
            const other = b as Literal;
            if (a.datatype.value !== other.datatype.value) {
                return false;
            } else if (a.datatype.value === Vocabulary.rdf.JSON) {
                const aJson = JsonLiteral.fromLiteral(a);
                const bJson = JsonLiteral.fromLiteral(other);
                if (aJson) {
                    return bJson ? JsonLiteral.equal(aJson, bJson) : false;
                } else if (bJson) {
                    return aJson ? JsonLiteral.equal(aJson, bJson) : false;
                }
            }
            return a.language === other.language && a.value === other.value;
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

/**
 * Extracts local name for URI the same way as it's done in [RDF4J](https://github.com/eclipse-rdf4j/rdf4j).
 */
export function getLocalName(uri: string): string | undefined {
    let index = uri.indexOf('#');
    if (index < 0) {
        index = uri.lastIndexOf('/');
    }
    if (index < 0) {
        index = uri.lastIndexOf(':');
    }
    if (index < 0) {
        return undefined;
    }
    return uri.substring(index + 1);
}

const NAMESPACE_RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const NAMESPACE_RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const NAMESPACE_SCHEMA = 'http://schema.org/';
const NAMESPACE_XSD = 'http://www.w3.org/2001/XMLSchema#';

export const Vocabulary = {
    rdf: {
        namespace: NAMESPACE_RDF,
        langString: `${NAMESPACE_RDF}langString`,
        type: `${NAMESPACE_RDF}type`,
        JSON: `${NAMESPACE_RDF}JSON`,
    },
    rdfs: {
        namespace: NAMESPACE_RDFS,
        label: `${NAMESPACE_RDFS}label`,
    },
    schema: {
        namespace: NAMESPACE_SCHEMA,
        thumbnailUrl: `${NAMESPACE_SCHEMA}thumbnailUrl`,
    },
    xsd: {
        namespace: NAMESPACE_XSD,
        string: `${NAMESPACE_XSD}string`,
    },
} as const;
