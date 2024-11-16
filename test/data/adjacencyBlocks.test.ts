import { expect, describe, it } from 'vitest';

import {
    AdjacencyBlock, subtractAdjacencyBlocks, hashAdjacencyRange,
} from '../../src/data/decorated/adjacencyBlocks';

describe('subtractAdjacencyBlocks()', () => {
    it('computes adjacency block extensions', () => {
        const result = subtractAdjacencyBlocks(
            block([1, 2, 3, 5, 7, 9, 11, 17], [2, 3, 4, 8, 9]),
            [
                block([1, 2], [1, 2, 3, 4, 5]),
                block([3], [1, 2, 3, 4, 5, 6, 7, 8, 9]),
                block([5, 7, 9], [3, 4, 7, 8]),
            ]
        );
        expect(result).toEqual([
            block([1, 2], [8, 9]),
            block([5, 7, 9], [2, 9]),
            block([11, 17], [2, 3, 4, 8, 9]),
        ] satisfies ReturnType<typeof subtractAdjacencyBlocks>);
    });

    it('groups blocks with same result targets', () => {
        const result = subtractAdjacencyBlocks(
            block([1, 2, 3, 5, 7, 9, 11, 13, 15, 17], [2, 3, 4, 8, 9]),
            [
                block([1, 2], [1, 2, 3, 4, 5]),
                block([3], [1, 2, 3, 4, 5, 6, 7, 8, 9]),
                block([5, 7, 9], [2, 3, 4, 11]),
                block([11], [1, 2, 9]),
                block([13], [2, 9, 11]),
                block([15], [1, 5, 7]),
            ]
        );
        expect(result).toEqual([
            block([1, 2, 5, 7, 9], [8, 9]),
            block([11, 13], [3, 4, 8]),
            block([15, 17], [2, 3, 4, 8, 9]),
        ] satisfies ReturnType<typeof subtractAdjacencyBlocks>);
    });
});

type TestBlock = AdjacencyBlock<number>;

function block(
    sources: readonly number[],
    targets: readonly number[]
): TestBlock {
    return {
        sources: new Set(sources),
        targets: new Set(targets),
    };
}

describe('hashAdjacencyRange()', () => {
    it('produces a consistent content hash for ranges', async () => {
        expect(await hashAdjacencyRange(new Set([]))).toEqual(
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        );
        expect(await hashAdjacencyRange(new Set([]))).toEqual(
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        );
        expect(await hashAdjacencyRange(new Set([
            'http://example.com/sourceA',
            'http://example.com/sourceB',
            'http://example.com/sourceC',
        ]))).toEqual(
            '19fabb0ef72a478af74fe009feba1d856965aeef43ffc54a57188a5126f79d08'
        );
        expect(await hashAdjacencyRange(new Set([
            'http://example.com/sourceC',
            'http://example.com/sourceA',
            'http://example.com/sourceB',
        ]))).toEqual(
            '19fabb0ef72a478af74fe009feba1d856965aeef43ffc54a57188a5126f79d08'
        );
    });
});
