import { RdfExpression } from './expression';
import * as Rdf from '../rdf/rdfModel';
import { rdf, xsd as xsdVocab, vocabulary } from '../rdf/vocabulary';

export interface EvaluateContext {
    evaluate: (expr: RdfExpression) => EvaluationResult;
    call: (
        functionName: string,
        self: RdfExpression,
        args: readonly RdfExpression[]
    ) => EvaluationResult;
    factory: Rdf.DataFactory;
    boolean: (value: boolean) => Rdf.Literal;
    error: (expr: RdfExpression, code?: EvaluationErrorCode) => EvaluationError;
}

export type EvaluationResult = Rdf.Term | EvaluationError;

export interface EvaluationError {
    readonly termType: 'EvaluationError';
    readonly expression: RdfExpression;
    readonly code: EvaluationErrorCode;
}

export type EvaluationErrorCode =
    | 'NOT_IMPLEMENTED'
    | 'INVALID_CALL_ARGS'
    | 'INVALID_OPERATOR_ARGS'
    | 'UNEXPECTED'
    | 'UNKNOWN_FUNCTION';

type SignatureArg =
    | { readonly type: 'any' }
    | { readonly type: 'numeric' }
    | { readonly type: 'namedNode' }
    | { readonly type: 'literal'; readonly datatype?: string };

type SignatureParam =
    | SignatureArg
    | readonly ['optional', SignatureArg]
    | readonly ['zeroOrMore', SignatureArg];

export const arg = {
    any: {type: 'any'} as const satisfies SignatureArg,
    numeric: {type: 'numeric'} as const satisfies SignatureArg,
    namedNode: {type: 'namedNode'} as const satisfies SignatureArg,
    literal: {type: 'literal'} as const satisfies SignatureArg,
    of: (datatype: string) => ({type: 'literal', datatype} as const satisfies SignatureArg),
    optional: <A extends SignatureArg>(arg: A) => ['optional', arg] as const,
    zeroOrMore: <A extends SignatureArg>(arg: A) => ['zeroOrMore', arg] as const,
} as const;

type SignatureArgMap = { [K in SignatureArg['type']]: any };

export interface DefinedFunction<E extends SignatureArgMap, Signature extends readonly SignatureParam[]> {
    readonly signature: Signature;
    readonly body: (
        context: EvaluateContext,
        self: RdfExpression,
        args: FunctionArgs<E, Signature>
    ) => EvaluationResult;
}

type FunctionArgs<E extends SignatureArgMap, Signature> =
    Signature extends readonly [{ type: infer A extends keyof E }, ...infer Rest]
        ? readonly [E[A], ...FunctionArgs<E, Rest>] :
    Signature extends readonly [readonly ['optional', { type: infer A extends keyof E }], ...infer Rest]
        ? readonly [E[A]?, ...FunctionArgs<E, Rest>] :
    Signature extends readonly [readonly ['zeroOrMore', { type: infer A extends keyof E }]]
        ? readonly [...E[A][]] :
    Signature extends readonly [] ? readonly [] : never;

type RdfExpressionArgMap = {
    any: RdfExpression;
    numeric: RdfExpression;
    namedNode: RdfExpression;
    literal: RdfExpression;
};

type RdfTermArgMap = {
    any: Rdf.Term;
    numeric: Rdf.Literal;
    namedNode: Rdf.NamedNode;
    literal: Rdf.Literal;
};

export function defineLazy<const S extends readonly SignatureParam[]>(
    func: DefinedFunction<RdfExpressionArgMap, S>
): DefinedFunction<RdfExpressionArgMap, S> {
    return func;
}

export function defineEager<const S extends readonly SignatureParam[]>(
    func: DefinedFunction<RdfTermArgMap, S>
): DefinedFunction<RdfExpressionArgMap, S> {
    return {
        ...func,
        body: (context, self, args) => {
            const untypedArgs = args as readonly (RdfExpression | undefined)[];
            const evaluatedArgs = untypedArgs.map(arg =>
                arg === undefined ? undefined : context.evaluate(arg)
            );
            const erroredArg = evaluatedArgs.find(arg => arg !== undefined && isError(arg));
            if (erroredArg) {
                return erroredArg;
            }
            if (!areValidArgs(func.signature, evaluatedArgs as readonly (Rdf.Term | undefined)[])) {
                return context.error(self, 'INVALID_CALL_ARGS');
            }
            return func.body(context, self, evaluatedArgs as unknown as FunctionArgs<RdfTermArgMap, S>);
        }
    };
}

function areValidArgs(
    signature: readonly SignatureParam[],
    args: readonly (Rdf.Term | undefined)[]
): boolean {
    for (let i = 0; i < signature.length; i++) {
        const param = signature[i];
        if (Array.isArray(param)) {
            const [kind, type] = param as Exclude<SignatureParam, SignatureArg>;
            if (kind === 'optional') {
                if (!(i < args.length && areValidArg(type, args[i], false))) {
                    return false;
                }
            } else if (kind === 'zeroOrMore') {
                for (let j = i; j < args.length; j++) {
                    if (!areValidArg(type, args[j], true)) {
                        return false;
                    }
                }
                return true;
            }
        } else {
            if (!(i < args.length && areValidArg(param as SignatureArg, args[i], true))) {
                return false;
            }
        }
    }
    return args.length <= signature.length;
}

function areValidArg(param: SignatureArg, arg: Rdf.Term | undefined, required: boolean): boolean {
    if (arg === undefined) {
        return !required;
    }
    switch (param.type) {
        case 'namedNode': {
            return arg.termType === 'NamedNode';
        }
        case 'literal': {
            return arg.termType === 'Literal';
        }
        case 'numeric': {
            return arg.termType === 'Literal' && isNumericType(arg.datatype);
        }
        default: {
            return true;
        }
    }
}

export type RdfFunctionBundle = Record<string, DefinedFunction<RdfExpressionArgMap, any>>;

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
        signature: [arg.zeroOrMore(arg.any)],
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
        signature: [arg.any, arg.any, arg.any],
        body: ({evaluate}, _, [condition, thenExpr, elseExpr]) => {
            const value = evaluate(condition);
            return evaluate(effectiveBoolean(value) ? thenExpr : elseExpr);
        },
    }),
    [coreFn['logical-or']]: defineLazy({
        signature: [arg.any, arg.any],
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
        signature: [arg.any, arg.any],
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
        signature: [arg.any, arg.any],
        body: ({boolean}, _, [a, b]) => {
            return boolean(Rdf.equalTerms(a, b));
        },
    }),
    [rdfFn['is-named']]: defineEager({
        signature: [arg.any],
        body: ({boolean}, _, [value]) => {
            return boolean(value.termType === 'NamedNode');
        },
    }),
    [rdfFn['is-blank']]: defineEager({
        signature: [arg.any],
        body: ({boolean}, _, [value]) => {
            return boolean(value.termType === 'BlankNode');
        },
    }),
    [rdfFn['is-literal']]: defineEager({
        signature: [arg.any],
        body: ({boolean}, _, [value]) => {
            return boolean(value.termType === 'Literal');
        },
    }),
    [rdfFn['value-of']]: defineEager({
        signature: [arg.any],
        body: ({factory}, _, [value]) => {
            return factory.literal(value.value);
        },
    }),
    [rdfFn['datatype-of']]: defineEager({
        signature: [arg.literal],
        body: (_, self, [value]) => {
            return value.datatype;
        },
    }),
    [rdfFn['language-of']]: defineEager({
        signature: [arg.literal],
        body: ({factory}, self, [value]) => {
            return factory.literal(value.language);
        },
    }),
    [rdfFn.named]: defineEager({
        signature: [arg.any],
        body: ({factory, error}, self, [value]) => {
            if (value.termType === 'NamedNode') {
                return value;
            } else if (isPlainString(value)) {
                return factory.namedNode(value.value);
            } else {
                return error(self, 'INVALID_CALL_ARGS');
            }
        },
    }),
    [rdfFn.blank]: defineEager({
        signature: [arg.optional(arg.of(xsd.string))],
        body: ({factory}, self, [value]) => {
            return factory.blankNode(value?.value);
        },
    }),
    [rdfFn.literal]: defineEager({
        signature: [arg.of(xsd.string), arg.optional(arg.namedNode)],
        body: ({factory}, self, [value, datatype]) => {
            return datatype ? factory.literal(value.value, datatype) : value;
        },
    }),
    [rdfFn['lang-literal']]: defineEager({
        signature: [arg.of(xsd.string), arg.of(xsd.string)],
        body: ({factory}, self, [value, lang]) => {
            return factory.literal(value.value, lang.value);
        },
    }),
    [rdfFn['lang-matches']]: defineEager({
        signature: [arg.of(xsd.string), arg.of(xsd.string)],
        body: ({boolean}, self, [langTag, langRange]) => {
            return boolean(langMatchesExtendedFilter(langTag.value, langRange.value));
        },
    }),
    [rdfFn.now]: defineEager({
        signature: [],
        body: ({factory}) => {
            return factory.literal(new Date().toISOString(), factory.namedNode(xsd.dateTime));
        },
    }),
    [rdfFn.tz]: defineEager({
        signature: [arg.of(xsd.dateTime)],
        body: ({factory}, _, [dateTime]) => {
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
