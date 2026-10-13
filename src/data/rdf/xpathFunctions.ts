import { type RdfFunctionBundle, defineEager, isPlainString, effectiveBoolean } from './rdfEvaluationCore';
import * as Rdf from './rdfModel';
import { xsd, vocabulary } from './vocabulary';

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
        signature: ['E', 'E'],
        body: ({factory, error}, self, [a, b]) => {
            if (isPlainString(a) && isPlainString(b)) {
                const result = (
                    a.value < b.value ? -1 :
                    a.value > b.value ? 1 :
                    0
                );
                return factory.literal(String(result), factory.namedNode(xsd.integer));
            }
            return error(self);
        },
    }),
    [xpathFn.concat]: defineEager({
        signature: ['E*'],
        body: ({factory, error}, self, values) => {
            let datatype: Rdf.NamedNode | undefined | null;
            let language: string | undefined | null;
            const parts: string[] = [];
            for (const value of values) {
                if (value.termType !== 'Literal') {
                    return error(self);
                }
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
        signature: ['E'],
        body: ({factory, error}, self, [value]) => {
            if (isPlainString(value)) {
                return factory.literal(encodeURIComponent(value.value));
            } else {
                return error(self);
            }
        },
    }),
    [xpathFn.not]: defineEager({
        signature: ['E'],
        body: ({boolean, error}, self, [value]) => {
            const valueAsBoolean = effectiveBoolean(value);
            return valueAsBoolean === undefined ? error(self) : boolean(!valueAsBoolean);
        },
    }),
    [xpathFn['string-length']]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [text]) => {
            if (text.termType === 'Literal') {
                return factory.literal(
                    String(text.value.length),
                    factory.namedNode(xsd.integer)
                );
            } else {
                return error(self);
            }
        },
    }),
    [xpathFn.substring]: defineEager({
        signature: ['E', 'E', 'E?'],
        body: ({factory, error}, self, [text, start, length]) => {
            if (!(
                text.termType === 'Literal' &&
                start.termType === 'Literal' &&
                (!length || length.termType === 'Literal')
            )) {
                return error(self);
            }
            const startNum = Math.round(Number(start.value));
            const lengthNum = length ? Math.round(Number(length.value)) : undefined;
            if (Number.isNaN(startNum) || (lengthNum !== undefined && Number.isNaN(lengthNum))) {
                return error(self);
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
        signature: ['E', 'E'],
        body: ({factory, error}, self, [text, needle]) => {
            
        },
    }),
    [xpathFn['substring-after']]: defineEager({
        signature: ['E', 'E'],
        body: ({factory, error}, self, [text, needle]) => {
            
        },
    }),
    [xpathFn['lower-case']]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [text]) => {
            if (text.termType === 'Literal') {
                return factory.literal(
                    text.value.toLowerCase(),
                    text.language ? text.language : text.datatype
                );
            }
            return error(self);
        },
    }),
    [xpathFn['upper-case']]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [text]) => {
            if (text.termType === 'Literal') {
                return factory.literal(
                    text.value.toUpperCase(),
                    text.language ? text.language : text.datatype
                );
            }
            return error(self);
        },
    }),
    [xpathFn['starts-with']]: defineEager({
        signature: ['E', 'E'],
        body: ({factory, error}, self, [text, needle]) => {
            
        },
    }),
    [xpathFn['ends-with']]: defineEager({
        signature: ['E', 'E'],
        body: ({factory, error}, self, [text, needle]) => {
            
        },
    }),
    [xpathFn.contains]: defineEager({
        signature: ['E', 'E'],
        body: ({factory, error}, self, [text, needle]) => {
            
        },
    }),
    [xpathFn.matches]: defineEager({
        signature: ['E', 'E', 'E?'],
        body: ({factory, error}, self, [text, pattern, flags]) => {
            
        },
    }),
    [xpathFn.replace]: defineEager({
        signature: ['E', 'E', 'E', 'E?'],
        body: ({factory, error}, self, [text, pattern, replacement, flags]) => {
            
        },
    }),
    [xpathFn['numeric-abs']]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [num]) => {
            
        },
    }),
    [xpathFn['numeric-ceil']]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [num]) => {
            
        },
    }),
    [xpathFn['numeric-floor']]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [num]) => {
            
        },
    }),
    [xpathFn['numeric-round']]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [num]) => {
            
        },
    }),
    [xpathFn['year-from-dateTime']]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [dateTime]) => {
            
        },
    }),
    [xpathFn['month-from-dateTime']]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [dateTime]) => {
            
        },
    }),
    [xpathFn['day-from-dateTime']]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [dateTime]) => {
            
        },
    }),
    [xpathFn['hours-from-dateTime']]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [dateTime]) => {
            
        },
    }),
    [xpathFn['minutes-from-dateTime']]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [dateTime]) => {
            
        },
    }),
    [xpathFn['seconds-from-dateTime']]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [dateTime]) => {
            
        },
    }),
    [xpathFn['timezone-from-dateTime']]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [dateTime]) => {
            
        },
    }),
    [xsd.string]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [value]) => {
            
        },
    }),
    [xsd.boolean]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [value]) => {
            
        },
    }),
    [xsd.integer]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [value]) => {
            
        },
    }),
    [xsd.decimal]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [value]) => {
            
        },
    }),
    [xsd.float]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [value]) => {
            
        },
    }),
    [xsd.double]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [value]) => {
            
        },
    }),
    [xsd.dateTime]: defineEager({
        signature: ['E'],
        body: ({factory, error}, self, [value]) => {
            
        },
    }),
} as const satisfies RdfFunctionBundle;
