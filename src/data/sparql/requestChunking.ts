export function* chunkArray<T>(
    items: readonly T[],
    measure: (item: T) => number,
    maxChunkSize: number
): Iterable<readonly T[]> {
    if (!Number.isFinite(maxChunkSize)) {
        yield items;
        return;
    }
    const chunk: T[] = [];
    let chunkSize = 0;
    for (const item of items) {
        const addedSize = measure(item);
        if (chunkSize > 0 && chunkSize + addedSize > maxChunkSize) {
            yield [...chunk];
            chunk.length = 0;
            chunkSize = 0;
        }
        chunk.push(item);
        chunkSize += addedSize;
    }
    if (chunkSize > 0) {
        yield chunk;
    }
}

export interface DirectedChunk<T> {
    readonly sources: ReadonlyArray<T>;
    readonly targets: ReadonlyArray<T>;
}

export function* chunkUndirectedCrossProduct<T>(
    main: ReadonlyArray<T>,
    paired: ReadonlyArray<T>,
    measure: (item: T) => number,
    maxChunkSize: number
): Iterable<DirectedChunk<T>> {
    if (main.length < paired.length) {
        [main, paired] = [paired, main];
    }

    const pairedSet = new Set(paired);
    const selfSet = new Set<T>();
    for (const item of main) {
        if (pairedSet.has(item)) {
            selfSet.add(item);
        }
    }

    yield* chunkDirectedCrossProduct(main, paired, measure, maxChunkSize);
    yield* chunkDirectedCrossProduct(
        paired,
        main,
        measure,
        maxChunkSize,
        pairedSet.size === selfSet.size ? selfSet : undefined
    );
}

function* chunkDirectedCrossProduct<T>(
    from: ReadonlyArray<T>,
    to: ReadonlyArray<T>,
    measure: (item: T) => number,
    maxChunkSize: number,
    excludedTargets?: ReadonlySet<T>
): Iterable<DirectedChunk<T>> {
    const halfSize = Math.ceil(maxChunkSize / 2);

    const sources = new Set<T>();
    const targets: T[] = [];
    let sourceSize = 0;
    let targetSize = 0;

    function popPairedChunk(): DirectedChunk<T> {
        const chunk: DirectedChunk<T> = {
            sources: [...sources],
            targets: [...targets],
        };
        targets.length = 0;
        targetSize = 0;
        return chunk;
    }

    for (let i = 0; i < from.length; i++) {
        const fromItem = from[i];
        sources.add(fromItem);
        sourceSize += measure(fromItem);
        if (sourceSize >= halfSize || i === from.length - 1) {
            for (const toItem of to) {
                if (excludedTargets && excludedTargets.has(toItem)) {
                    continue;
                }
                const addedSize = measure(toItem);
                if (targetSize > 0 && sourceSize + targetSize + addedSize > maxChunkSize) {
                    yield popPairedChunk();
                }
                targets.push(toItem);
                
                targetSize += addedSize;
            }
            if (targetSize > 0) {
                yield popPairedChunk();
            }
            sources.clear();
            sourceSize = 0;
        }
    }
}
