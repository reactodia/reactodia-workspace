import * as Rdf from '../rdf/rdfModel';

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
    /** May be unbound e.g. when an endpoint aggregates over an empty solution group. */
    inCount?: Rdf.Literal;
    /** May be unbound e.g. when an endpoint aggregates over an empty solution group. */
    outCount?: Rdf.Literal;
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
