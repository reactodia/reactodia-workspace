import { describe, expect, it } from 'vitest';

import { validateChunkSize } from '../../src/data/sparql/requestChunking';

describe('validateChunkSize()', () => {
    it('accepts positive integer chunk sizes', () => {
        expect(validateChunkSize(1)).toBe(true);
        expect(validateChunkSize(2)).toBe(true);
        expect(validateChunkSize(10)).toBe(true);
        expect(validateChunkSize(211)).toBe(true);
        expect(validateChunkSize(100201)).toBe(true);
        expect(validateChunkSize(2_000_000_000)).toBe(true);
        expect(validateChunkSize(Number.MAX_SAFE_INTEGER)).toBe(true);
    });

    it('rejects zero and negative chunk sizes', () => {
        expect(validateChunkSize(0)).toBe(false);
        expect(validateChunkSize(-1)).toBe(false);
        expect(validateChunkSize(-10)).toBe(false);
        expect(validateChunkSize(-100_000)).toBe(false);
        expect(validateChunkSize(-Number.MAX_SAFE_INTEGER)).toBe(false);
        expect(validateChunkSize(-Infinity)).toBe(false);
    });

    it('rejects non-integer chunk sizes', () => {
        expect(validateChunkSize(0.5)).toBe(false);
        expect(validateChunkSize(100.1)).toBe(false);
        expect(validateChunkSize(-42.7)).toBe(false);
        expect(validateChunkSize(Number.MAX_SAFE_INTEGER * 2)).toBe(false);
        expect(validateChunkSize(Number.NaN)).toBe(false);
    });
});
