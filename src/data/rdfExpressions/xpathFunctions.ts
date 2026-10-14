import {
    type RdfFunctionBundle, defineEager, isPlainString, effectiveBoolean, arg, xsd,
} from './evaluationCore';
import * as Rdf from '../rdf/rdfModel';
import { vocabulary } from '../rdf/vocabulary';

export const xpathFn = vocabulary('http://www.w3.org/2005/xpath-functions#')<
    | 'compare'
    | 'concat'
    | 'encode-for-uri'
    | 'not'
    | 'string-length'
    | 'substring'
    | 'substring-before'
    | 'substring-after'
    | 'lower-case'
    | 'upper-case'
    | 'starts-with'
    | 'ends-with'
    | 'contains'
    | 'matches'
    | 'replace'
    | 'numeric-abs'
    | 'numeric-ceil'
    | 'numeric-floor'
    | 'numeric-round'
    | 'year-from-dateTime'
    | 'month-from-dateTime'
    | 'day-from-dateTime'
    | 'hours-from-dateTime'
    | 'minutes-from-dateTime'
    | 'seconds-from-dateTime'
    | 'timezone-from-dateTime'
>();

export const XPathFunctions = {
    [xpathFn.compare]: defineEager({
        signature: [arg.of(xsd.string), arg.of(xsd.string)],
        body: ({factory}, self, [a, b]) => {
            const result = (
                a.value < b.value ? -1 :
                a.value > b.value ? 1 :
                0
            );
            return factory.literal(String(result), factory.namedNode(xsd.integer));
        },
    }),
    [xpathFn.concat]: defineEager({
        signature: [arg.literal, arg.literal, arg.zeroOrMore(arg.literal)],
        body: ({factory}, self, values) => {
            let datatype: Rdf.NamedNode | undefined | null;
            let language: string | undefined | null;
            const parts: string[] = [];
            for (const value of values) {
                if (value.datatype && datatype !== null) {
                    datatype = (datatype === undefined || Rdf.equalTerms(datatype, value.datatype))
                        ? value.datatype : null;
                }
                if (value.language && language !== null) {
                    language = (language === undefined || language === value.language)
                        ? value.language : null;
                }
                parts.push(value.value);
            }
            const result = parts.join('');
            return factory.literal(result, language || datatype || undefined);
        },
    }),
    [xpathFn['encode-for-uri']]: defineEager({
        signature: [arg.of(xsd.string)],
        body: ({factory}, self, [value]) => {
            return factory.literal(encodeURIComponent(value.value));
        },
    }),
    [xpathFn.not]: defineEager({
        signature: [arg.any],
        body: ({boolean, error}, self, [value]) => {
            const valueAsBoolean = effectiveBoolean(value);
            return valueAsBoolean === undefined
                ? error(self, 'INVALID_CALL_ARGS')
                : boolean(!valueAsBoolean);
        },
    }),
    [xpathFn['string-length']]: defineEager({
        signature: [arg.literal],
        body: ({factory}, self, [text]) => {
            return factory.literal(
                String(text.value.length),
                factory.namedNode(xsd.integer)
            );
        },
    }),
    [xpathFn.substring]: defineEager({
        signature: [arg.literal, arg.literal, arg.optional(arg.numeric)],
        body: ({factory, error}, self, [text, start, length]) => {
            const startNum = Math.round(Number(start.value));
            const lengthNum = length ? Math.round(Number(length.value)) : undefined;
            if (Number.isNaN(startNum) || (lengthNum !== undefined && Number.isNaN(lengthNum))) {
                return error(self, 'INVALID_CALL_ARGS');
            }
            const startClamped = Math.max(0, Math.min(text.value.length, startNum));
            const endClamped = lengthNum === undefined
                ? text.value.length
                : Math.max(0, Math.min(text.value.length, startNum + lengthNum));
            return factory.literal(
                text.value.substring(startClamped, endClamped),
                text.language ? text.language : text.datatype
            );
        },
    }),
    [xpathFn['substring-before']]: defineEager({
        signature: [arg.literal, arg.literal],
        body: ({factory, error}, self, [text, needle]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathFn['substring-after']]: defineEager({
        signature: [arg.literal, arg.literal],
        body: ({factory, error}, self, [text, needle]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathFn['lower-case']]: defineEager({
        signature: [arg.literal],
        body: ({factory}, self, [text]) => {
            return factory.literal(
                text.value.toLowerCase(),
                text.language ? text.language : text.datatype
            );
        },
    }),
    [xpathFn['upper-case']]: defineEager({
        signature: [arg.literal],
        body: ({factory}, self, [text]) => {
            return factory.literal(
                text.value.toUpperCase(),
                text.language ? text.language : text.datatype
            );
        },
    }),
    [xpathFn['starts-with']]: defineEager({
        signature: [arg.literal, arg.literal],
        body: ({factory, error}, self, [text, needle]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathFn['ends-with']]: defineEager({
        signature: [arg.literal, arg.literal],
        body: ({factory, error}, self, [text, needle]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathFn.contains]: defineEager({
        signature: [arg.literal, arg.literal],
        body: ({factory, error}, self, [text, needle]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathFn.matches]: defineEager({
        signature: [arg.literal, arg.literal, arg.optional(arg.of(xsd.string))],
        body: ({factory, error}, self, [text, pattern, flags]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathFn.replace]: defineEager({
        signature: [arg.literal, arg.literal, arg.literal, arg.optional(arg.of(xsd.string))],
        body: ({factory, error}, self, [text, pattern, replacement, flags]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathFn['numeric-abs']]: defineEager({
        signature: [arg.numeric],
        body: ({factory, error}, self, [num]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathFn['numeric-ceil']]: defineEager({
        signature: [arg.numeric],
        body: ({factory, error}, self, [num]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathFn['numeric-floor']]: defineEager({
        signature: [arg.numeric],
        body: ({factory, error}, self, [num]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathFn['numeric-round']]: defineEager({
        signature: [arg.numeric],
        body: ({factory, error}, self, [num]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathFn['year-from-dateTime']]: defineEager({
        signature: [arg.of(xsd.dateTime)],
        body: ({factory, error}, self, [dateTime]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathFn['month-from-dateTime']]: defineEager({
        signature: [arg.of(xsd.dateTime)],
        body: ({factory, error}, self, [dateTime]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathFn['day-from-dateTime']]: defineEager({
        signature: [arg.of(xsd.dateTime)],
        body: ({factory, error}, self, [dateTime]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathFn['hours-from-dateTime']]: defineEager({
        signature: [arg.of(xsd.dateTime)],
        body: ({factory, error}, self, [dateTime]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathFn['minutes-from-dateTime']]: defineEager({
        signature: [arg.of(xsd.dateTime)],
        body: ({factory, error}, self, [dateTime]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathFn['seconds-from-dateTime']]: defineEager({
        signature: [arg.of(xsd.dateTime)],
        body: ({factory, error}, self, [dateTime]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathFn['timezone-from-dateTime']]: defineEager({
        signature: [arg.of(xsd.dateTime)],
        body: ({factory, error}, self, [dateTime]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xsd.string]: defineEager({
        signature: [arg.any],
        body: ({factory, error}, self, [value]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xsd.boolean]: defineEager({
        signature: [arg.any],
        body: ({factory, error}, self, [value]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xsd.integer]: defineEager({
        signature: [arg.any],
        body: ({factory, error}, self, [value]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xsd.decimal]: defineEager({
        signature: [arg.any],
        body: ({factory, error}, self, [value]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xsd.float]: defineEager({
        signature: [arg.any],
        body: ({factory, error}, self, [value]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xsd.double]: defineEager({
        signature: [arg.any],
        body: ({factory, error}, self, [value]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xsd.dateTime]: defineEager({
        signature: [arg.any],
        body: ({factory, error}, self, [value]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
} as const satisfies RdfFunctionBundle;
