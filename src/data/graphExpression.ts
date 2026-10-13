import * as Rdf from './rdf/rdfModel';

export type RdfExpression =
    | TermExpression
    | UnaryExpression
    | BinaryExpression
    | CallExpression;

export interface TermExpression {
    readonly type: 'term';
    readonly value: Rdf.Term;
}

export interface UnaryExpression {
    readonly type: 'unary';
    readonly operator: '+' | '-' | '!';
    readonly args: readonly [RdfExpression];
}

export interface BinaryExpression {
    readonly type: 'binary';
    readonly operator:
        | '+' | '-' | '*' | '/' | 'idiv' | 'mod'
        | '=' | '!=' | '<' | '<=' | '>' | '>=';
    readonly args: readonly [RdfExpression, RdfExpression];
}

export interface CallExpression {
    readonly type: 'call';
    readonly function: Rdf.NamedNode;
    readonly args: readonly RdfExpression[];
}
