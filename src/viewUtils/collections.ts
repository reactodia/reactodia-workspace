export function getOrCreateArrayInMap<K, V>(map: Map<K, V[]>, key: K): V[] {
    let values = map.get(key);
    if (!values) {
        values = [];
        map.set(key, values);
    }
    return values;
}

export function getOrCreateSetInMap<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
    let values = map.get(key);
    if (!values) {
        values = new Set();
        map.set(key, values);
    }
    return values;
}

export function mapToObject<K extends string, V>(map: ReadonlyMap<K, V>): { [key: string]: V } {
    const result: { [key: string]: V } = {};
    for (const [k, v] of map) {
        result[k] = v;
    }
    return result;
}

export class OrderedMap<V> {
    private mapping = new Map<string, V>();
    private ordered: V[] = [];

    reorder(compare: (a: V, b: V) => number) {
        this.ordered.sort(compare);
    }

    get items(): ReadonlyArray<V> {
        return this.ordered;
    }

    get(key: string): V | undefined {
        return this.mapping.get(key);
    }

    push(key: string, value: V) {
        if (this.mapping.has(key)) {
            const previous = this.mapping.get(key)!;
            if (previous === value) { return; }
            const index = this.ordered.indexOf(previous);
            this.ordered.splice(index, 1);
        }
        this.mapping.set(key, value);
        this.ordered.push(value);
    }

    delete(key: string): V | undefined {
        if (!this.mapping.has(key)) {
            return undefined;
        }
        const previous = this.mapping.get(key)!;
        const index = this.ordered.indexOf(previous);
        this.ordered.splice(index, 1);
        this.mapping.delete(key);
        return previous;
    }
}

export enum MoveDirection {
    ToStart = -1,
    ToEnd = 1,
}

export function makeMoveComparator<T>(
    items: ReadonlyArray<T>,
    selected: ReadonlyArray<T>,
    moveDirection: MoveDirection,
): (a: T, b: T) => number {
    const orderMap = new Map<T, number>();
    const selectionIndexOffset = moveDirection * items.length;

    items.forEach((item, index) => {
        orderMap.set(item, index);
    });

    for (const selectedItem of selected) {
        orderMap.set(selectedItem, selectionIndexOffset + orderMap.get(selectedItem)!);
    }

    return (a: T, b: T) => {
        const orderA = orderMap.get(a)!;
        const orderB = orderMap.get(b)!;
        return (
            orderA > orderB ? 1 :
            orderA < orderB ? -1 :
            0
        );
    };
}
