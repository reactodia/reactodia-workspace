import { HashSet } from '@reactodia/hashmap';
import { describe, expect, it } from 'vitest';

import {
    DirectedChunk, chunkUndirectedCrossProduct,
} from '../../src/data/sparql/requestChunking';

describe('chunkUndirectedCrossProduct()', () => {
    it('handles cases with too small chunk size', () => {
        expect(Array.from(
            chunkUndirectedCrossProduct([1], [2], measureSingle, 0))
        ).toEqual(
            [
                {sources: [1], targets: [2]},
                {sources: [2], targets: [1]},
            ] satisfies ReadonlyArray<DirectedChunk<number>>
        );

        expect(Array.from(
            chunkUndirectedCrossProduct([0, 1], [2], measureSingle, 0))
        ).toEqual(
            [
                {sources: [0], targets: [2]},
                {sources: [1], targets: [2]},
                {sources: [2], targets: [0]},
                {sources: [2], targets: [1]},
            ] satisfies ReadonlyArray<DirectedChunk<number>>
        );

        expect(Array.from(
            chunkUndirectedCrossProduct([0, 1], [0, 2], measureSingle, 0))
        ).toEqual(
            [
                {sources: [0], targets: [0]},
                {sources: [0], targets: [2]},
                {sources: [1], targets: [0]},
                {sources: [1], targets: [2]},
                {sources: [0], targets: [0]},
                {sources: [0], targets: [1]},
                {sources: [2], targets: [0]},
                {sources: [2], targets: [1]},
            ] satisfies ReadonlyArray<DirectedChunk<number>>
        );
    });

    it('omits self-referenced items from targets if possible', () => {
        const main = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        const paired = [0, 1, 2, 3, 4];
        const result = Array.from(chunkUndirectedCrossProduct(main, paired, measureSingle, 100));
        expect(result).toEqual(
            [
                {
                    sources: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
                    targets: [0, 1, 2, 3, 4],
                },
                {
                    sources: [0, 1, 2, 3, 4],
                    targets: [5, 6, 7, 8, 9],
                },
            ] satisfies ReadonlyArray<DirectedChunk<number>>
        );
    });

    it('puts everything in a single chunk per direction given enough size', () => {
        const main = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        const paired = [0, 1, 2, 3, 4, 10, 11, 12];
        const result = Array.from(chunkUndirectedCrossProduct(main, paired, measureSingle, 100));
        expect(result).toEqual(
            [
                {
                    sources: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
                    targets: [0, 1, 2, 3, 4, 10, 11, 12],
                },
                {
                    sources: [0, 1, 2, 3, 4, 10, 11, 12],
                    targets: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
                },
            ] satisfies ReadonlyArray<DirectedChunk<number>>
        );
    });

    it('splits request into multiple chunks', () => {
        const main = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        const paired = [0, 1, 2, 3, 4, 10, 11, 12];
        const result = Array.from(chunkUndirectedCrossProduct(main, paired, measureSingle, 14));
        expect(result).toEqual(
            [
                {
                    sources: [0, 1, 2, 3, 4, 5, 6],
                    targets: [0, 1, 2, 3, 4, 10, 11],
                },
                {
                    sources: [0, 1, 2, 3, 4, 5, 6],
                    targets: [12],
                },
                {
                    sources: [7, 8, 9],
                    targets: [0, 1, 2, 3, 4, 10, 11, 12],
                },
                {
                    sources: [0, 1, 2, 3, 4, 10, 11],
                    targets: [0, 1, 2, 3, 4, 5, 6],
                },
                {
                    sources: [0, 1, 2, 3, 4, 10, 11],
                    targets: [7, 8, 9],
                },
                {
                    sources: [12],
                    targets: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
                },
            ] satisfies ReadonlyArray<DirectedChunk<number>>
        );
    });

    it.for([
        [0, 1, 0, 0, 0],
        [0, 1, 1, 0, 2],
        [1, 1, 0, 0, 3],
        [0, 2, 1, 0, 4],
        [1, 1, 1, 0, 8],
        [5, 5, 3, 100, 2],
        [5, 5, 3, 14, 6],
        [100, 0, 1, 50, 23],
        [200, 50, 20, 100, 49],
    ])(
        'splits [common: %i, main: %i, paired: %i] with max size %i into %i chunks',
        ([selfCount, mainCount, pairedCount, chunkSize, expectedChunkCount]) => {
            const main: number[] = [];
            const paired: number[] = [];

            let nextItem = 0;
            for (let i = 0; i < selfCount; i++) {
                const item = nextItem++;
                main.push(item);
                paired.push(item);
            }

            for (let i = 0; i < mainCount; i++) {
                const item = nextItem++;
                main.push(item);
            }

            for (let i = 0; i < pairedCount; i++) {
                const item = nextItem++;
                paired.push(item);
            }

            const result = Array.from(chunkUndirectedCrossProduct(main, paired, measureSingle, chunkSize));
            expect(Array.from(computeNonCoveredLinks(main, paired, result))).to.have.members([]);
            expect(result).to.have.length(expectedChunkCount);
        }
    );
});

function measureSingle(): number {
    return 1;
}

function computeNonCoveredLinks(
    main: ReadonlyArray<number>,
    paired: ReadonlyArray<number>,
    result: ReadonlyArray<DirectedChunk<number>>
): HashSet<readonly [number, number]> {
    const allPairs = new HashSet<readonly [number, number]>(
        p => (p[0] + Math.imul(p[1], 1027)) | 0,
        (a, b) => a[0] === b[0] && a[1] === b[1]
    );

    for (const a of main) {
        for (const b of paired) {
            allPairs.add([a, b]);
            allPairs.add([b, a]);
        }
    }

    for (const chunk of result) {
        for (const source of chunk.sources) {
            for (const targets of chunk.targets) {
                allPairs.delete([source, targets]);
            }
        }
    }

    return allPairs;
}
