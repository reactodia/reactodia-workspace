import * as Rdf from '../rdf/rdfModel';
import { xsd } from '../rdf/vocabulary';

import {
    EvaluateContext, EvaluationError, EvaluationResult, RdfFunctionBundle,
    CoreFunctions, RdfFunctions, isError, isNumericType, effectiveBoolean, rdfFn,
} from './evaluationCore';
import { RdfExpression, UnaryExpression, BinaryExpression } from './expression';
import { xpathFn, XPathFunctions } from './xpathFunctions';
import {
    UNARY_OPERATORS, COMPUTE_OPERATORS, EQUAL_OPERATORS, COMPARE_OPERATORS,
    XPathOperators,
} from './xpathOperators';

export const StandardFunctions = {
    ...CoreFunctions,
    ...RdfFunctions,
    ...XPathFunctions,
    ...XPathOperators,
} as const satisfies RdfFunctionBundle;

// TODO: move to separate package (i.e. RAMP with dataset and expressions)
export class RdfExpressionEvaluator {
    readonly factory: Rdf.DataFactory;
    readonly functions: RdfFunctionBundle;

    private readonly _true: Rdf.Literal;
    private readonly _false: Rdf.Literal;

    constructor(options: {
        factory: Rdf.DataFactory;
        functions: RdfFunctionBundle;
    }) {
        const {factory, functions} = options;
        this.factory = factory;
        this.functions = functions;

        this._true = factory.literal('true', factory.namedNode(xsd.boolean));
        this._false = factory.literal('false', factory.namedNode(xsd.boolean));
    }

    evaluate(
        expression: RdfExpression,
        bounds: ReadonlyMap<string, Rdf.Term>
    ): EvaluationResult {
        const context: EvaluateContext = {
            evaluate: expr => {
                switch (expr.type) {
                    case 'term': {
                        const bound = expr.value.termType === 'Variable'
                            ? bounds.get(expr.value.value) : undefined;
                        return bound ?? expr.value;
                    }
                    case 'unary': {
                        return evaluateUnaryOperator(expr, context);
                    }
                    case 'binary': {
                        return evaluateBinaryOperator(expr, context);
                    }
                    case 'call': {
                        return context.call(expr.function.value, expr, expr.args);
                    }
                    default: {
                        return context.error(expr);
                    }
                }
            },
            call: (functionName, self, args) => {
                if (Object.prototype.hasOwnProperty.call(this.functions, functionName)) {
                    const func = this.functions[functionName];
                    return func.body(context, self, args);
                }
                return context.error(self, 'UNKNOWN_FUNCTION');
            },
            factory: this.factory,
            boolean: value => value ? this._true : this._false,
            error: (expr, code) => ({
                termType: 'EvaluationError',
                expression: expr,
                code: code ?? 'UNEXPECTED',
            }),
        };
        return context.evaluate(expression);
    }
}

function evaluateUnaryOperator(
    expr: UnaryExpression,
    context: EvaluateContext
): EvaluationResult {
    const match = UNARY_OPERATORS[expr.operator];
    if (match) {
        return context.call(match, expr, expr.args);
    }
    return context.error(expr, 'INVALID_OPERATOR_ARGS');
}

function evaluateBinaryOperator(
    expr: BinaryExpression,
    context: EvaluateContext
): EvaluationResult {
    const a = context.evaluate(expr.args[0]);
    const b = context.evaluate(expr.args[1]);
    if (isError(a)) {
        return a;
    } else if (isError(b)) {
        return b;
    }

    if (a.termType === 'Literal' && b.termType === 'Literal') {
        const aType = (
            isNumericType(a.datatype) ? 'numeric' :
            a.datatype.value
        );
        const bType = (
            isNumericType(b.datatype) ? 'numeric' :
            b.datatype.value
        );
        switch (expr.operator) {
            case '+':
            case '-':
            case '*':
            case '/':
            case 'idiv':
            case 'mod': {
                const match = COMPUTE_OPERATORS.get([expr.operator, aType, bType]);
                if (match) {
                    const argA: RdfExpression = {type: 'term', value: a};
                    const argB: RdfExpression = {type: 'term', value: b};
                    if (typeof match === 'string') {
                        return context.call(match, expr, [argA, argB]);
                    } else {
                        let result = context.call(
                            match.func,
                            expr,
                            match.switchArgs ? [argB, argA] : [argA, argB]
                        );
                        if (match.negate && !isError(result)) {
                            result = context.call(
                                xpathFn.not,
                                expr,
                                [{type: 'term', value: result}]
                            );
                        }
                        return result;
                    }
                }
                return context.error(expr, 'INVALID_OPERATOR_ARGS');
            }
            case '=':
            case '!=': {
                if (aType === bType) {
                    const match = EQUAL_OPERATORS[aType];
                    if (match) {
                        const argA: RdfExpression = {type: 'term', value: a};
                        const argB: RdfExpression = {type: 'term', value: b};
                        const result = context.call(match, expr, [argA, argB]);
                        if (isError(result)) {
                            return result;
                        }
                        return expr.operator === '!='
                            ? context.boolean(!effectiveBoolean(result)) : result;
                    } else {
                        break;
                    }
                } else {
                    return context.error(expr, 'INVALID_OPERATOR_ARGS');
                }
            }
            case '<':
            case '<=':
            case '>':
            case '>=': {
                if (aType === bType) {
                    const match = COMPARE_OPERATORS[aType];
                    if (match) {
                        const argA: RdfExpression = {type: 'term', value: a};
                        const argB: RdfExpression = {type: 'term', value: b};
                        const result = context.call(match, expr, [argA, argB]);
                        if (isError(result)) {
                            return result;
                        }
                        if (result.termType === 'Literal' && result.datatype.value === xsd.integer) {
                            const resultNum = Number(result);
                            if (resultNum === -1 || resultNum === 0 || resultNum === 1) {
                                return context.boolean(
                                    expr.operator === '<' ? resultNum < 0 :
                                    expr.operator === '<=' ? resultNum < 0 || resultNum === 0 :
                                    expr.operator === '>' ? resultNum > 0 :
                                    expr.operator === '>=' ? resultNum > 0 || resultNum === 0 :
                                    false
                                );
                            }
                        }
                        return context.error(expr);
                    } else {
                        break;
                    }
                } else {
                    return context.error(expr, 'INVALID_OPERATOR_ARGS');
                }
            }
        }
    }

    if ((expr.operator === '=' || expr.operator === '!=') && a.termType === b.termType) {
        const argA: RdfExpression = {type: 'term', value: a};
        const argB: RdfExpression = {type: 'term', value: b};
        const result = context.call(rdfFn.equal, expr, [argA, argB]);
        if (isError(result)) {
            return result;
        }
        return expr.operator === '!=' ? context.boolean(!effectiveBoolean(result)) : result;
    }

    return context.error(expr, 'INVALID_OPERATOR_ARGS');
}
