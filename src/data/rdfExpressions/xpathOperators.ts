import {
    HashMap, ReadonlyHashMap, hashString, hashTuple, dropHighestNonSignBit,
} from '@reactodia/hashmap';

import { BinaryExpression } from './expression';
import { type RdfFunctionBundle, defineEager, arg, xsd } from './evaluationCore';
import * as Rdf from '../rdf/rdfModel';
import { xpathFn } from './xpathFunctions';
import { vocabulary } from '../rdf/vocabulary';

export const xpathOp = vocabulary('http://ramp-shapes.github.io/xpath-operators#')<
    | 'numeric-unary-plus'
    | 'numeric-unary-minus'
    | 'numeric-equal'
    | 'numeric-compare'
    | 'numeric-add'
    | 'numeric-subtract'
    | 'numeric-multiply'
    | 'numeric-divide'
    | 'numeric-integer-divide'
    | 'numeric-mod'
    | 'boolean-equal'
    | 'boolean-compare'
    | 'date-equal'
    | 'date-compare'
    | 'time-equal'
    | 'time-compare'
    | 'dateTime-equal'
    | 'dateTime-compare'
    | 'duration-equal'
    | 'duration-compare'
    | 'add-dayTimeDuration-to-date'
    | 'add-dayTimeDuration-to-time'
    | 'add-dayTimeDuration-to-dateTime'
    | 'add-dayTimeDurations'
    | 'add-yearMonthDuration-to-date'
    | 'add-yearMonthDuration-to-dateTime'
    | 'add-yearMonthDurations'
    | 'subtract-dates'
    | 'subtract-times'
    | 'subtract-dateTimes'
    | 'subtract-dayTimeDurations'
    | 'subtract-dayTimeDuration-from-date'
    | 'subtract-dayTimeDuration-from-time'
    | 'subtract-dayTimeDuration-from-dateTime'
    | 'subtract-yearMonthDurations'
    | 'subtract-yearMonthDuration-from-date'
    | 'subtract-yearMonthDuration-from-dateTime'
    | 'multiply-dayTimeDuration'
    | 'multiply-yearMonthDuration'
    | 'divide-dayTimeDuration'
    | 'divide-dayTimeDuration-by-dayTimeDuration'
    | 'divide-yearMonthDuration'
    | 'divide-yearMonthDuration-by-yearMonthDuration'
>();

type OperatorSignature = readonly [BinaryExpression['operator'], string, string?];

function hashOperatorSignature(value: OperatorSignature): number {
    return dropHighestNonSignBit(hashTuple(
        hashString(value[0]),
        hashString(value[1]),
        value[2] ? hashString(value[2]) : 0
    ));
}

function equalOperatorSignatures(a: OperatorSignature, b: OperatorSignature): boolean {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export const UNARY_OPERATORS = {
    '!': xpathFn.not,
    '+': xpathOp['numeric-unary-plus'],
    '-': xpathOp['numeric-unary-minus'],
} as const;

export type ComputeImplemetation = string | ComputeImplemetationExtended;

interface ComputeImplemetationExtended {
    readonly func: string;
    readonly negate?: boolean;
    readonly switchArgs?: boolean;
}

export const COMPUTE_OPERATORS: ReadonlyHashMap<OperatorSignature, ComputeImplemetation> =
    new HashMap<OperatorSignature, ComputeImplemetation>(
        hashOperatorSignature,
        equalOperatorSignatures,
        [
            // See https://www.w3.org/TR/xpath20/#mapping
            [
                ['+', 'numeric', 'numeric'],
                xpathOp['numeric-add'],
                /* returns numeric */
            ],
            [
                ['+', xsd.date, xsd.yearMonthDuration],
                xpathOp['add-yearMonthDuration-to-date'],
                /* returns xsd.date */
            ],
            [
                ['+', xsd.yearMonthDuration, xsd.date],
                {func: xpathOp['add-yearMonthDuration-to-date'], switchArgs: true},
                /* returns xsd.date */
            ],
            [
                ['+', xsd.date, xsd.dayTimeDuration],
                xpathOp['add-dayTimeDuration-to-date'],
                /* returns xsd.date */
            ],
            [
                ['+', xsd.dayTimeDuration, xsd.date],
                {func: xpathOp['add-dayTimeDuration-to-date'], switchArgs: true},
                /* returns xsd.date */
            ],
            [
                ['+', xsd.time, xsd.dayTimeDuration],
                xpathOp['add-dayTimeDuration-to-time'],
                /* returns xsd.time */
            ],
            [
                ['+', xsd.dayTimeDuration, xsd.time],
                {func: xpathOp['add-dayTimeDuration-to-time'], switchArgs: true},
                /* returns xsd.time */
            ],
            [
                ['+', xsd.dateTime, xsd.yearMonthDuration],
                xpathOp['add-yearMonthDuration-to-dateTime'],
                /* returns xsd.dateTime */
            ],
            [
                ['+', xsd.yearMonthDuration, xsd.dateTime],
                {func: xpathOp['add-yearMonthDuration-to-dateTime'], switchArgs: true},
                /* returns xsd.dateTime */
            ],
            [
                ['+', xsd.dateTime, xsd.dayTimeDuration],
                xpathOp['add-dayTimeDuration-to-dateTime'],
                /* returns xsd.dateTime */
            ],
            [
                ['+', xsd.dayTimeDuration, xsd.dateTime],
                {func: xpathOp['add-dayTimeDuration-to-dateTime'], switchArgs: true},
                /* returns xsd.dateTime */
            ],
            [
                ['+', xsd.yearMonthDuration, xsd.yearMonthDuration],
                xpathOp['add-yearMonthDurations'],
                /* returns xsd.yearMonthDuration */
            ],
            [
                ['+', xsd.dayTimeDuration, xsd.dayTimeDuration],
                xpathOp['add-dayTimeDurations'],
                /* returns xsd.dayTimeDuration */
            ],
            [
                ['-', 'numeric', 'numeric'],
                xpathOp['numeric-subtract'],
                /* returns numeric */
            ],
            [
                ['-', xsd.date, xsd.date],
                xpathOp['subtract-dates'],
                /* returns xsd.dayTimeDuration */
            ],
            [
                ['-', xsd.date, xsd.yearMonthDuration],
                xpathOp['subtract-yearMonthDuration-from-date'],
                /* returns xsd.date */
            ],
            [
                ['-', xsd.date, xsd.dayTimeDuration],
                xpathOp['subtract-dayTimeDuration-from-date'],
                /* returns xsd.date */
            ],
            [
                ['-', xsd.time, xsd.time],
                xpathOp['subtract-times'],
                /* returns xsd.dayTimeDuration */
            ],
            [
                ['-', xsd.time, xsd.dayTimeDuration],
                xpathOp['subtract-dayTimeDuration-from-time'],
                /* returns xsd.time */
            ],
            [
                ['-', xsd.dateTime, xsd.dateTime],
                xpathOp['subtract-dateTimes'],
                /* returns xsd.dayTimeDuration */
            ],
            [
                ['-', xsd.dateTime, xsd.yearMonthDuration],
                xpathOp['subtract-yearMonthDuration-from-dateTime'],
                /* returns xsd.dateTime */
            ],
            [
                ['-', xsd.dateTime, xsd.dayTimeDuration],
                xpathOp['subtract-dayTimeDuration-from-dateTime'],
                /* returns xsd.dateTime */
            ],
            [
                ['-', xsd.yearMonthDuration, xsd.yearMonthDuration],
                xpathOp['subtract-yearMonthDurations'],
                /* returns xsd.yearMonthDuration */
            ],
            [
                ['-', xsd.dayTimeDuration, xsd.dayTimeDuration],
                xpathOp['subtract-dayTimeDurations'],
                /* returns xsd.dayTimeDuration */
            ],
            [
                ['*', 'numeric', 'numeric'],
                xpathOp['numeric-multiply'],
                /* returns numeric */
            ],
            [
                ['*', xsd.yearMonthDuration, 'numeric'],
                xpathOp['multiply-yearMonthDuration'],
                /* returns xsd.yearMonthDuration */
            ],
            [
                ['*', 'numeric', xsd.yearMonthDuration],
                {func: xpathOp['multiply-yearMonthDuration'], switchArgs: true},
                /* returns xsd.yearMonthDuration */
            ],
            [
                ['*', xsd.dayTimeDuration, 'numeric'],
                xpathOp['multiply-dayTimeDuration'],
                /* returns xsd.dayTimeDuration */
            ],
            [
                ['*', 'numeric', xsd.dayTimeDuration],
                {func: xpathOp['multiply-dayTimeDuration'], switchArgs: true},
                /* returns xsd.dayTimeDuration */
            ],
            [
                ['idiv', 'numeric', 'numeric'],
                xpathOp['numeric-integer-divide'],
                /* returns xsd.integer */
            ],
            [
                ['/', 'numeric', 'numeric'],
                xpathOp['numeric-divide'],
                /* returns numeric; but xsd.decimal if both operands are xsd.integer */
            ],
            [
                ['/', xsd.yearMonthDuration, 'numeric'],
                xpathOp['divide-yearMonthDuration'],
                /* returns xsd.yearMonthDuration */
            ],
            [
                ['/', xsd.dayTimeDuration, 'numeric'],
                xpathOp['divide-dayTimeDuration'],
                /* return xsd.dayTimeDuration */
            ],
            [
                ['/', xsd.yearMonthDuration, xsd.yearMonthDuration],
                xpathOp['divide-yearMonthDuration-by-yearMonthDuration'],
                /* returns xsd.decimal */
            ],
            [
                ['/', xsd.dayTimeDuration, xsd.dayTimeDuration],
                xpathOp['divide-dayTimeDuration-by-dayTimeDuration'],
                /* returns xsd.decimal */
            ],
            [
                ['mod', 'numeric', 'numeric'],
                xpathOp['numeric-mod'],
                /* returns numeric */
            ],
        ]
    );

type CompareImplementation = string;

export const EQUAL_OPERATORS: Record<string, CompareImplementation> = {
    ['numeric']: xpathOp['numeric-equal'],
    [xsd.boolean]: xpathOp['boolean-equal'],
    [xsd.string]: xpathFn.compare,
    [xsd.date]: xpathOp['date-equal'],
    [xsd.time]: xpathOp['time-equal'],
    [xsd.dateTime]: xpathOp['dateTime-equal'],
    [xsd.duration]: xpathOp['duration-equal'],
    [xsd.yearMonthDuration]: xpathOp['duration-equal'],
    [xsd.dayTimeDuration]: xpathOp['duration-equal'],
    // [xsd.hexBinary]: xpathOp['hex-binary-equal'],
    // [xsd.base64Binary]: xpathOp['base64-binary-equal'],
};

export const COMPARE_OPERATORS: Record<string, CompareImplementation> = {
    ['numeric']: xpathOp['numeric-compare'],
    [xsd.boolean]: xpathOp['boolean-compare'],
    [xsd.string]: xpathFn.compare,
    [xsd.date]: xpathOp['date-compare'],
    [xsd.time]: xpathOp['time-compare'],
    [xsd.dateTime]: xpathOp['dateTime-compare'],
    [xsd.yearMonthDuration]: xpathOp['duration-compare'],
    [xsd.dayTimeDuration]: xpathOp['duration-compare'],
};

export const XPathOperators = {
    [xpathOp['numeric-unary-plus']]: defineEager({
        signature: [arg.numeric],
        body: ({factory, error}, self, [value]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['numeric-unary-minus']]: defineEager({
        signature: [arg.numeric],
        body: ({factory, error}, self, [value]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['numeric-equal']]: defineEager({
        signature: [arg.numeric, arg.numeric],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['numeric-compare']]: defineEager({
        signature: [arg.numeric, arg.numeric],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['numeric-add']]: defineEager({
        signature: [arg.numeric, arg.numeric],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['numeric-subtract']]: defineEager({
        signature: [arg.numeric, arg.numeric],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['numeric-multiply']]: defineEager({
        signature: [arg.numeric, arg.numeric],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['numeric-divide']]: defineEager({
        signature: [arg.numeric, arg.numeric],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['numeric-integer-divide']]: defineEager({
        signature: [arg.numeric, arg.numeric],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['numeric-mod']]: defineEager({
        signature: [arg.numeric, arg.numeric],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['boolean-equal']]: defineEager({
        signature: [arg.of(xsd.boolean), arg.of(xsd.boolean)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['boolean-compare']]: defineEager({
        signature: [arg.of(xsd.boolean), arg.of(xsd.boolean)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['date-equal']]: defineEager({
        signature: [arg.of(xsd.date), arg.of(xsd.date)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['date-compare']]: defineEager({
        signature: [arg.of(xsd.date), arg.of(xsd.date)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['time-equal']]: defineEager({
        signature: [arg.of(xsd.time), arg.of(xsd.time)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['time-compare']]: defineEager({
        signature: [arg.of(xsd.time), arg.of(xsd.time)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['dateTime-equal']]: defineEager({
        signature: [arg.of(xsd.dateTime), arg.of(xsd.dateTime)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['dateTime-compare']]: defineEager({
        signature: [arg.of(xsd.dateTime), arg.of(xsd.dateTime)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['duration-equal']]: defineEager({
        signature: [arg.of(xsd.duration), arg.of(xsd.duration)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['duration-compare']]: defineEager({
        signature: [arg.of(xsd.duration), arg.of(xsd.duration)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['add-dayTimeDuration-to-date']]: defineEager({
        signature: [arg.of(xsd.dayTimeDuration), arg.of(xsd.date)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['add-dayTimeDuration-to-time']]: defineEager({
        signature: [arg.of(xsd.dayTimeDuration), arg.of(xsd.time)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['add-dayTimeDuration-to-dateTime']]: defineEager({
        signature: [arg.of(xsd.dayTimeDuration), arg.of(xsd.dateTime)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['add-dayTimeDurations']]: defineEager({
        signature: [arg.of(xsd.dayTimeDuration), arg.of(xsd.dayTimeDuration)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['add-yearMonthDuration-to-date']]: defineEager({
        signature: [arg.of(xsd.yearMonthDuration), arg.of(xsd.date)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['add-yearMonthDuration-to-dateTime']]: defineEager({
        signature: [arg.of(xsd.yearMonthDuration), arg.of(xsd.dateTime)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['add-yearMonthDurations']]: defineEager({
        signature: [arg.of(xsd.yearMonthDuration), arg.of(xsd.yearMonthDuration)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['subtract-dates']]: defineEager({
        signature: [arg.of(xsd.date), arg.of(xsd.date)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['subtract-times']]: defineEager({
        signature: [arg.of(xsd.time), arg.of(xsd.time)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['subtract-dateTimes']]: defineEager({
        signature: [arg.of(xsd.dateTime), arg.of(xsd.dateTime)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['subtract-dayTimeDurations']]: defineEager({
        signature: [arg.of(xsd.dayTimeDuration), arg.of(xsd.dayTimeDuration)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['subtract-dayTimeDuration-from-date']]: defineEager({
        signature: [arg.of(xsd.date), arg.of(xsd.dayTimeDuration)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['subtract-dayTimeDuration-from-time']]: defineEager({
        signature: [arg.of(xsd.time), arg.of(xsd.dayTimeDuration)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['subtract-dayTimeDuration-from-dateTime']]: defineEager({
        signature: [arg.of(xsd.dateTime), arg.of(xsd.dayTimeDuration)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['subtract-yearMonthDurations']]: defineEager({
        signature: [arg.of(xsd.yearMonthDuration), arg.of(xsd.yearMonthDuration)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['subtract-yearMonthDuration-from-date']]: defineEager({
        signature: [arg.of(xsd.date), arg.of(xsd.yearMonthDuration)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['subtract-yearMonthDuration-from-dateTime']]: defineEager({
        signature: [arg.of(xsd.dateTime), arg.of(xsd.yearMonthDuration)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['multiply-dayTimeDuration']]: defineEager({
        signature: [arg.any, arg.any],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['multiply-yearMonthDuration']]: defineEager({
        signature: [arg.any, arg.any],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['divide-dayTimeDuration']]: defineEager({
        signature: [arg.any, arg.any],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['divide-dayTimeDuration-by-dayTimeDuration']]: defineEager({
        signature: [arg.of(xsd.dayTimeDuration), arg.of(xsd.dayTimeDuration)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['divide-yearMonthDuration']]: defineEager({
        signature: [arg.any, arg.any],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
    [xpathOp['divide-yearMonthDuration-by-yearMonthDuration']]: defineEager({
        signature: [arg.of(xsd.yearMonthDuration), arg.of(xsd.yearMonthDuration)],
        body: ({factory, error}, self, [a, b]) => {
            return error(self, 'NOT_IMPLEMENTED');
        },
    }),
} as const satisfies RdfFunctionBundle;
