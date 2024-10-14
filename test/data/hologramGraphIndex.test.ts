import { test, expect } from 'vitest';

import { multimapArrayAdd } from '../../src/coreUtils/collections';

test('HologramIndex', () => {
    expect(true).toBe(true);
});

interface HologramIndex {
    sourceBlocks: EdgeBlockIndex;
    targetBlocks: EdgeBlockIndex;
}

interface EdgeBlockIndex {
    readonly keys: string[];
    readonly blocks: number[];
}

interface SparseEdgeBlock {
    readonly sources: SparseNodeRange;
    readonly targets: SparseNodeRange;
}

type SparseNodeRange = readonly string[];

function fillHoles(store: HologramIndex, block: SparseEdgeBlock): SparseEdgeBlock[] {
    const sourceMatches = intersectRange(store.sourceBlocks, block.sources);
    const targetMatches = intersectRange(store.targetBlocks, block.targets);
    
    const leftovers: SparseEdgeBlock[] = [];
    for (const [block, sourceKeys] of sourceMatches) {
        const targetKeys = targetMatches.get(block);
        if (targetKeys) {
            excludeBlock(leftovers, {sources: sourceKeys, targets: targetKeys});
        }
    }
    return leftovers;
}

type BlockRangeMatches = Map<number, string[]>;

function intersectRange(blockIndex: EdgeBlockIndex, range: SparseNodeRange): BlockRangeMatches {
    let offset = 0;
    const intersections = new Map<number, string[]>();

    nextIntersection: for (const node of range) {
        offset = binarySearchForFirstEqualOrGreater(blockIndex.keys, node, offset);
        while (true) {
            if (offset >= blockIndex.keys.length) {
                break nextIntersection;
            }

            const key = blockIndex.keys[offset];
            if (key === node) {
                // result.keys.push(key);
                // result.blocks.push(blockIndex.blocks[offset]);
                multimapArrayAdd(intersections, blockIndex.blocks[offset], key);
                offset++;
            } else {
                break;
            }
        }
    }

    return intersections;
}

function binarySearchForFirstEqualOrGreater<T>(
    items: readonly T[],
    target: T,
    startIndex = 0,
    endIndex = items.length
): number {
    let left = startIndex;
    let right = endIndex;
    while (right - left > 1) {
        const next = Math.floor((right - left - 1) / 2);
        const item = items[next];
        if (item < target) {
            right = next;
        } else {
            left = next;
        }
    }
    return left;
}

function excludeBlock(from: SparseEdgeBlock[], subtracted: SparseEdgeBlock): void {

}
