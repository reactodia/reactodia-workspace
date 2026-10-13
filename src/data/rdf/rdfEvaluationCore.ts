import { RdfExpression } from '../graphExpression';
import * as Rdf from './rdfModel';
import { rdf, xsd as xsdVocab, vocabulary } from './vocabulary';

export interface EvaluateContext {
    evaluate: (expr: RdfExpression) => EvaluationResult;
    call: (
        functionName: string,
        self: RdfExpression,
        args: readonly RdfExpression[]
    ) => EvaluationResult;
    factory: Rdf.DataFactory;
    boolean: (value: boolean) => Rdf.Literal;
    error: (expr: RdfExpression) => EvaluationError;
}

export type EvaluationResult = Rdf.Term | EvaluationError;

export interface EvaluationError {
    readonly termType: 'EvaluationError';
    readonly expression: RdfExpression;
}

type SignatureParam = 'E' | 'E?' | 'E*';

export interface DefinedFunction<E, Signature extends readonly SignatureParam[]> {
    readonly signature: Signature;
    readonly body: (
        context: EvaluateContext,
        self: RdfExpression,
        args: FunctionArgs<E, Signature>
    ) => EvaluationResult;
}

type FunctionArgs<E, Signature> =
    Signature extends readonly ['E', ...infer Rest] ? readonly [E, ...FunctionArgs<E, Rest>] :
    Signature extends readonly ['E?', ...infer Rest] ? readonly [E?, ...FunctionArgs<E, Rest>] :
    Signature extends readonly ['E*'] ? readonly [...E[]] :
    Signature extends readonly [] ? readonly [] :
    never;

export function defineLazy<const S extends readonly SignatureParam[]>(
    func: DefinedFunction<RdfExpression, S>
): DefinedFunction<RdfExpression, S> {
    return func;
}

export function defineEager<const S extends readonly SignatureParam[]>(
    func: DefinedFunction<Rdf.Term, S>
): DefinedFunction<RdfExpression, S> {
    return {
        ...func,
        body: (context, self, args) => {
            if (!areValidArgs(func.signature, args)) {
                return context.error(self);
            }
            const untypedArgs = args as readonly (RdfExpression | undefined)[];
            const evaluatedArgs = untypedArgs.map(arg =>
                arg === undefined ? undefined : context.evaluate(arg)
            );
            const erroredArg = evaluatedArgs.find(arg => arg !== undefined && isError(arg));
            if (erroredArg) {
                return erroredArg;
            }
            return func.body(context, self, evaluatedArgs as unknown as FunctionArgs<Rdf.Term, S>);
        }
    };
}

function areValidArgs<T>(
    signature: readonly SignatureParam[],
    args: readonly (T | undefined)[]
): boolean {
    let hasMany = false;
    for (let i = 0; i < signature.length; i++) {
        const param = signature[i];
        if (param === 'E') {
            if (i >= args.length || args[i] === undefined) {
                return false;
            }
        } else if (param === 'E*') {
            hasMany = true;
        }
    }
    return args.length <= signature.length || hasMany;
}

export type RdfFunctionBundle = Record<string, DefinedFunction<RdfExpression, any>>;

export const coreFn = vocabulary('http://ramp-shapes.github.io/core-functions#')<
    | 'coalesce'
    | 'if'
    | 'logical-or'
    | 'logical-and'
>();

export const rdfFn = vocabulary('http://ramp-shapes.github.io/rdf-functions#')<
    | 'equal'
    | 'is-named'
    | 'is-blank'
    | 'is-literal'
    | 'value-of'
    | 'datatype-of'
    | 'language-of'
    | 'named'
    | 'blank'
    | 'literal'
    | 'lang-literal'
    | 'lang-matches'
    | 'now'
    | 'tz'
>();

export const xsd = vocabulary(xsdVocab.$namespace)<
    | 'boolean'
    | 'integer'
    | 'decimal'
    | 'float'
    | 'double'
    | 'string'
    | 'date'
    | 'time'
    | 'dateTime'
    | 'duration'
    | 'dayTimeDuration'
    | 'yearMonthDuration'
    | 'gYear'
    | 'gYearMonth'
    | 'gMonth'
    | 'gMonthDay'
    | 'gDay'
>();

export const CoreFunctions = {
    [coreFn.coalesce]: defineLazy({
        signature: ['E*'],
        body: ({evaluate, error}, self, expressions) => {
            for (const expr of expressions) {
                const result = evaluate(expr);
                if (!isError(result)) {
                    return result;
                }
            }
            return error(self);
        },
    }),
    [coreFn.if]: defineLazy({
        signature: ['E', 'E', 'E'],
        body: ({evaluate}, _, [condition, thenExpr, elseExpr]) => {
            const value = evaluate(condition);
            return evaluate(effectiveBoolean(value) ? thenExpr : elseExpr);
        },
    }),
    [coreFn['logical-or']]: defineLazy({
        signature: ['E', 'E'],
        body: ({evaluate, boolean}, _, [a, b]) => {
            const aValue = evaluate(a);
            if (effectiveBoolean(aValue)) {
                return boolean(true);
            }

            const bValue = evaluate(b);
            if (effectiveBoolean(bValue)) {
                return boolean(true);
            }

            return (
                isError(aValue) ? aValue :
                isError(bValue) ? bValue :
                boolean(false)
            );
        },
    }),
    [coreFn['logical-and']]: defineLazy({
        signature: ['E', 'E'],
        body: ({evaluate, boolean}, _, [a, b]) => {
            const aValue = evaluate(a);
            if (!effectiveBoolean(aValue)) {
                return isError(aValue) ? aValue : boolean(false);
            }

            const bValue = evaluate(b);
            if (!effectiveBoolean(bValue)) {
                return isError(bValue) ? bValue : boolean(false);
            }

            return boolean(true);
        },
    }),
} as const satisfies RdfFunctionBundle;

export const RdfFunctions = {
    [rdfFn.equal]: defineEager({
        signature: ['E', 'E'],
        body: ({boolean}, _, [a, b]) => {
            return boolean(Rdf.equalTerms(a, b));
        },
    }),
    [rdfFn['is-named']]: defineEager({
        signature: ['E'],
        body: ({boolean}, _, [value]) => {
            return boolean(value.termType === 'NamedNode');
        },
    }),
    [rdfFn['is-blank']]: defineEager({
        signature: ['E'],
        body: ({boolean}, _, [value]) => {
            return boolean(value.termType === 'BlankNode');
        },
    }),
    [rdfFn['is-literal']]: defineEager({
        signature: ['E'],
        body: ({boolean}, _, [value]) => {
            return boolean(value.termType === 'Literal');
        },
    }),
    [rdfFn['value-of']]: defineEager({
        signature: ['E'],
        body: ({factory}, _, [value]) => {
            return factory.literal(value.value);
        },
    }),
    [rdfFn['datatype-of']]: defineEager({
        signature: ['E'],
        body: ({error}, self, [value]) => {
            if (value.termType !== 'Literal') {
                return error(self);
            }
            return value.datatype;
        },
    }),
    [rdfFn['language-of']]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [value]) => {
            if (value.termType !== 'Literal') {
                return error(self);
            }
            return factory.literal(value.language);
        },
    }),
    [rdfFn.named]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [value]) => {
            if (value.termType === 'NamedNode') {
                return value;
            } else if (isPlainString(value)) {
                return factory.namedNode(value.value);
            } else {
                return error(self);
            }
        },
    }),
    [rdfFn.blank]: defineEager({
        signature: ['E?'],
        body: ({factory, error}, self, [value]) => {
            if (!value) {
                return factory.blankNode();
            } else if (isPlainString(value)) {
                return factory.blankNode(value.value);
            } else {
                return error(self);
            }
        },
    }),
    [rdfFn.literal]: defineEager({
        signature: ['E', 'E?'],
        body: ({factory, error}, self, [value, datatype]) => {
            if (isPlainString(value)) {
                if (!datatype) {
                    return value;
                } else if (datatype.termType === 'NamedNode') {
                    return factory.literal(value.value, datatype);
                }
            }
            return error(self);
        },
    }),
    [rdfFn['lang-literal']]: defineEager({
        signature: ['E', 'E'],
        body: ({factory, error}, self, [value, lang]) => {
            if (isPlainString(value) && isPlainString(lang)) {
                return factory.literal(value.value, lang.value);
            }
            return error(self);
        },
    }),
    [rdfFn['lang-matches']]: defineEager({
        signature: ['E', 'E'],
        body: ({boolean, error}, self, [langTag, langRange]) => {
            if (isPlainString(langTag) && isPlainString(langRange)) {
                return boolean(langMatchesExtendedFilter(langTag.value, langRange.value));
            }
            return error(self);
        },
    }),
    [rdfFn.now]: defineEager({
        signature: [],
        body: ({factory}) => {
            return factory.literal(new Date().toISOString(), factory.namedNode(xsd.dateTime));
        },
    }),
    [rdfFn.tz]: defineEager({
        signature: ['E'],
        body: ({factory}, _, [dateTime]) => {
            if (!(dateTime.termType === 'Literal' && dateTime.datatype.value === xsd.dateTime)) {
                return dateTime;
            }
            const match = dateTime.value.match(/(Z|[+-]\d{2}:?\d{2})$/);
            return factory.literal(match ? match[0] : '');
        },
    }),
} as const satisfies RdfFunctionBundle;

export function isError(result: EvaluationResult): result is EvaluationError {
    return result.termType === 'EvaluationError';
}

export function isPlainString(result: EvaluationResult): result is Rdf.Literal {
    return result.termType === 'Literal' && result.datatype.value === xsd.string;
}

export function isNumericType(datatype: Rdf.NamedNode): boolean {
    switch (datatype.value) {
        case xsd.integer:
        case xsd.decimal:
        case xsd.float:
        case xsd.double: {
            return true;
        }
    }
    return false;
}

export function effectiveBoolean(term: EvaluationResult): boolean | undefined {
    if (term.termType === 'Literal') {
        switch (term.datatype.value) {
            case rdf.langString:
            case xsd.string: {
                return term.value.length > 0;
            }
            case xsd.boolean: {
                return term.value === 'true';
            }
            case xsd.integer: {
                return /[0-9]+/.test(term.value) && BigInt(term.value) !== 0n;
            }
            // TODO: other numeric types
        }
    }
    return undefined;
}

// https://www.rfc-editor.org/rfc/rfc4647.txt
function langMatchesExtendedFilter(tag: string, range: string): boolean {
    const tagParts = tag.split('-');
    const rangeParts = range.split('-');

    let i = 0;
    let j = 0;

    if (rangeParts[j] !== '*' && tagParts[i] !== rangeParts[j]) {
        return false;
    }

    i++;
    j++;

    while (j < rangeParts.length) {
        if (rangeParts[j] === '*') {
            j++;
        } else if (!tagParts[i]) {
            return false;
        } else if (tagParts[i] === rangeParts[j]) {
            i++;
            j++;
        } else if (tagParts[i].length === 1) {
            return false;
        } else {
            i++;
        }
    }

    return true;
}
