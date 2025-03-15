import { HashMap, hashString } from '@reactodia/hashmap';

import { Sha256 } from './sha256';

export type AdjacencyRange<K> = ReadonlySet<K>;

export interface AdjacencyBlock<K> {
    readonly sources: AdjacencyRange<K>;
    readonly targets: AdjacencyRange<K>;
}

export function subtractAdjacencyBlocks<K extends string | number>(
    base: AdjacencyBlock<K>,
    disjointBySources: ReadonlyArray<AdjacencyBlock<K>>
): Array<AdjacencyBlock<K>> {
    const leftoverSources = new Set(base.sources);
    interface PartialBlock {
        readonly sources: Set<K>;
        readonly targets: AdjacencyRange<K>;
    }
    const partialBlocks = new HashMap<AdjacencyRange<K>, PartialBlock>(hashRange, sameRange);
    const orderedBlocks: PartialBlock[] = [];

    const addBlock = (sources: AdjacencyRange<K>, targets: AdjacencyRange<K>) => {
        let block = partialBlocks.get(targets);
        if (block) {
            for (const source of sources) {
                block.sources.add(source);
            }
        } else {
            block = {
                targets,
                sources: new Set(sources),
            };
            partialBlocks.set(targets, block);
            orderedBlocks.push(block);
        }
    };

    for (const block of disjointBySources) {
        for (const foundSource of block.sources) {
            leftoverSources.delete(foundSource);
        }

        const leftoverTargets = new Set(base.targets);
        for (const foundTarget of block.targets) {
            leftoverTargets.delete(foundTarget);
        }

        if (leftoverTargets.size > 0) {
            addBlock(block.sources, leftoverTargets);
        }
    }

    if (leftoverSources.size > 0) {
        addBlock(leftoverSources, base.targets);
    }

    return orderedBlocks;
}

function hashRange<K extends string | number>(range: AdjacencyRange<K>): number {
    let hash = 0;
    for (const item of range) {
        hash = (hash | 0) + (hashString(String(item)) | 0);
    }
    return hash | 0;
}

function sameRange<K>(a: AdjacencyRange<K>, b: AdjacencyRange<K>): boolean {
    if (a.size !== b.size) {
        return false;
    }
    for (const item of a) {
        if (!b.has(item)) {
            return false;
        }
    }
    return true;
}

export function hashAdjacencyRange<K extends string>(
    range: AdjacencyRange<K>,
    hasher: Sha256
): string {
    const keys = Array.from(range).sort();
    const encoder = new TextEncoder();
    const resultDigest = hasher.create();
    const keyDigest = hasher.create();
    for (const key of keys) {
        const encodedKey = encoder.encode(key);
        keyDigest.start();
        keyDigest.update(encodedKey);
        resultDigest.update(keyDigest.digest());
    }
    const digestBytes = resultDigest.digest();
    const totalHashHex = Array.from(
        digestBytes,
        b => b.toString(16).padStart(2, '0')
    ).join('');
    return totalHashHex;
}
