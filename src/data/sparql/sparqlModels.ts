import * as Rdf from '../rdf/rdfModel';

type SparqlTerm = SparqlIri | SparqlLiteral | SparqlBlank;

interface SparqlIri {
    type: 'uri';
    value: string;
}

interface SparqlBlank {
    type: 'bnode';
    value: string;
}

interface SparqlLiteral {
    type: 'literal' | 'typed-literal';
    value: string;
    datatype?: string;
    'xml:lang': string;
}

export interface SparqlResponse<Binding> {
    head: {
        vars: string[];
    };
    results: {
        bindings: Binding[];
    };
}

export function mapSparqlResponseIntoRdfJs(
    response: SparqlResponse<any>,
    factory: Rdf.DataFactory
): SparqlResponse<any> {
    function mapSparqlBinding(binding: { [name: string]: SparqlTerm }): { [name: string]: Rdf.Term } {
        const mapped: { [name: string]: Rdf.Term } = {};
        for (const key in binding) {
            if (Object.prototype.hasOwnProperty.call(binding, key)) {
                const term = binding[key];
                switch (term.type) {
                    case 'uri': {
                        mapped[key] = factory.namedNode(term.value);
                        break;
                    }
                    case 'bnode': {
                        mapped[key] = factory.blankNode(term.value);
                        break;
                    }
                    case 'literal':
                    case 'typed-literal': {
                        mapped[key] = factory.literal(
                            term.value,
                            term['xml:lang'] ? term['xml:lang'] :
                            term.datatype ? factory.namedNode(term.datatype) :
                            undefined
                        );
                        break;
                    }
                    default: {
                        throw new Error(`Unexpected SPARQL term type: "${(term as SparqlTerm).type}"`);
                    }
                }
            }
        }
        return mapped;
    }

    return {
        ...response,
        results: {
            ...response.results,
            bindings: response.results.bindings.map(mapSparqlBinding),
        },
    };
}

export function isRdfIri(term: Rdf.Term | undefined): term is Rdf.NamedNode {
    return Boolean(term && term.termType === 'NamedNode');
}

export function isRdfBlank(term: Rdf.Term | undefined): term is Rdf.BlankNode {
    return Boolean(term && term.termType === 'BlankNode');
}

export function isRdfLiteral(term: Rdf.Term | undefined): term is Rdf.Literal {
    return Boolean(term && term.termType === 'Literal');
}

export interface ElementBinding {
    inst: Rdf.NamedNode | Rdf.BlankNode;
    class?: Rdf.NamedNode;
    label?: Rdf.Literal;
    propType?: Rdf.NamedNode;
    propValue?: Rdf.NamedNode | Rdf.Literal;
}

export interface ClassBinding {
    class: Rdf.NamedNode;
    instcount?: Rdf.Literal;
    label?: Rdf.Literal;
    parent?: Rdf.NamedNode;
}

export interface PropertyBinding {
    property: Rdf.NamedNode;
    label?: Rdf.Literal;
}

export interface LinkBinding {
    source: Rdf.NamedNode | Rdf.BlankNode;
    type: Rdf.NamedNode;
    target: Rdf.NamedNode | Rdf.BlankNode;
    propType?: Rdf.NamedNode;
    propValue?: Rdf.Literal;
}

export interface LinkCountBinding {
    link: Rdf.NamedNode | Rdf.BlankNode;
    inCount: Rdf.Literal;
    outCount: Rdf.Literal;
}

export interface ConnectedLinkTypeBinding {
    link: Rdf.NamedNode;
    direction?: Rdf.Literal;
}

export interface LinkTypeBinding {
    link: Rdf.NamedNode;
    label?: Rdf.Literal;
    instcount?: Rdf.Literal;
}

export interface ElementImageBinding {
    inst: Rdf.NamedNode;
    linkType: Rdf.NamedNode;
    image: Rdf.Literal;
}

export interface ElementTypeBinding {
    inst: Rdf.NamedNode;
    class: Rdf.NamedNode;
}

export interface FilterBinding {
    classAll?: Rdf.NamedNode;
    link?: Rdf.NamedNode;
    direction?: Rdf.Literal;
}
