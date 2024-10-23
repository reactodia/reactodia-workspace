import type { ElementIri } from '../model';

export function validateChunkSize(chunkSize: number | undefined): boolean {
    if (typeof chunkSize === 'number') {
        return chunkSize === Infinity || (
            Number.isSafeInteger(chunkSize) && chunkSize > 0
        );
    }
    return true;
}

export async function processChunked<T extends string>(
    items: readonly T[],
    callback: (batch: readonly T[]) => Promise<void>,
    chunkSize: number
): Promise<void> {
    if (!Number.isFinite(chunkSize)) {
        return callback(items);
    }
    const tasks: Array<Promise<void>> = [];
    for (let offset = 0; offset < items.length; offset += chunkSize) {
        tasks.push(callback(items.slice(offset, offset + chunkSize)));
    }
    await Promise.all(tasks);
}
