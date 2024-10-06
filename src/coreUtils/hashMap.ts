/**
 * Represents a read-only hash map data structure that can be cloned.
 *
 * @category Utilities
 */
export interface ReadonlyHashMap<K, V> extends ReadonlyMap<K, V> {
    /**
     * Creates a mutable copy of this map with the same hash
     * and equality functions.
     */
    clone(): HashMap<K, V>;
}

/**
 * Represents a read-only hash set data structure that can be cloned.
 *
 * @category Utilities
 */
export interface ReadonlyHashSet<K> extends ReadonlySet<K> {
    /**
     * Creates a mutable copy of this set with the same hash
     * and equality functions.
     */
    clone(): HashSet<K>;
}

type Bucket<K, V> = { readonly k: K; readonly v: V } | Array<{ readonly k: K; readonly v: V }>;

/**
 * Implements a basic hash map data structure with ability to pass custom hash
 * and equality comparison functions.
 *
 * @category Utilities
 */
export class HashMap<K, V> implements ReadonlyMap<K, V> {
    private readonly map = new Map<number, Bucket<K, V>>();
    private _size = 0;

    constructor(
        private hashKey: (key: K) => number,
        private equalKeys: (k1: K, k2: K) => boolean,
    ) { }

    get size() {
        return this._size;
    }

    has(key: K): boolean {
        const bucket = this.map.get(this.hashKey(key));
        if (!bucket) { return false; }
        if (Array.isArray(bucket)) {
            for (const item of bucket) {
                if (this.equalKeys(item.k, key)) { return true; }
            }
        } else {
            return this.equalKeys(bucket.k, key);
        }
        return false;
    }

    get(key: K): V | undefined {
        const bucket = this.map.get(this.hashKey(key));
        if (!bucket) { return undefined; }
        if (Array.isArray(bucket)) {
            for (const item of bucket) {
                if (this.equalKeys(item.k, key)) { return item.v; }
            }
        } else if (this.equalKeys(bucket.k, key)) {
            return bucket.v;
        }
        return undefined;
    }

    set(key: K, value: V): this {
        const hash = this.hashKey(key);
        let bucket = this.map.get(hash);
        if (!bucket) {
            bucket = { k: key, v: value };
            this.map.set(hash, bucket);
            this._size++;
        } else if (Array.isArray(bucket)) {
            let index = -1;
            for (let i = 0; i < bucket.length; i++) {
                if (this.equalKeys(bucket[i].k, key)) {
                    index = i;
                    break;
                }
            }
            if (index >= 0) {
                bucket.splice(index, 1);
            } else {
                this._size++;
            }
            bucket.push({ k: key, v: value });
        } else if (this.equalKeys(bucket.k, key)) {
            this.map.set(hash, { k: key, v: value });
        } else {
            const single = bucket;
            bucket = [single, { k: key, v: value }];
            this.map.set(hash, bucket);
            this._size++;
        }
        return this;
    }

    delete(key: K): boolean {
        const hash = this.hashKey(key);
        const bucket = this.map.get(hash);
        if (!bucket) { return false; }
        if (Array.isArray(bucket)) {
            for (let i = 0; i < bucket.length; i++) {
                if (this.equalKeys(bucket[i].k, key)) {
                    bucket.splice(i, 1);
                    this._size--;
                    if (bucket.length === 0) {
                        this.map.delete(hash);
                    }
                    return true;
                }
            }
        } else if (this.equalKeys(bucket.k, key)) {
            this.map.delete(hash);
            this._size--;
            return true;
        }
        return false;
    }

    clear(): void {
        this.map.clear();
        this._size = 0;
    }

    clone(): HashMap<K, V> {
        const clone = new HashMap<K, V>(this.hashKey, this.equalKeys);
        clone._size = this.size;
        for (const [hash, bucket] of this.map) {
            clone.map.set(hash, Array.isArray(bucket) ? [...bucket] : bucket);
        }
        return clone;
    }

    forEach(callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void) {
        for (const [key, value] of this) {
            callback(value, key, this);
        }
    }

    *keys(): IterableIterator<K> {
        for (const bucket of this.map.values()) {
            if (Array.isArray(bucket)) {
                for (const entry of bucket) {
                    yield entry.k;
                }
            } else {
                yield bucket.k;
            }
        }
    }

    *values(): IterableIterator<V> {
        for (const bucket of this.map.values()) {
            if (Array.isArray(bucket)) {
                for (const entry of bucket) {
                    yield entry.v;
                }
            } else {
                yield bucket.v;
            }
        }
    }

    *entries(): IterableIterator<[K, V]> {
        for (const bucket of this.map.values()) {
            if (Array.isArray(bucket)) {
                for (const entry of bucket) {
                    yield [entry.k, entry.v];
                }
            } else {
                yield [bucket.k, bucket.v];
            }
        }
    }

    [Symbol.iterator](): IterableIterator<[K, V]> {
        return this.entries();
    }
}

/**
 * Implements a basic hash set data structure with ability to pass custom hash
 * and equality comparison functions.
 *
 * @category Utilities
 */
export class HashSet<K> implements ReadonlyHashSet<K> {
    private map: HashMap<K, K>;

    constructor(
        private hashCode: (key: K) => number,
        private equals: (k1: K, k2: K) => boolean,
    ) {
        this.map = new HashMap(hashCode, equals);
    }

    get size() {
        return this.map.size;
    }

    has(key: K): boolean {
        return this.map.has(key);
    }

    add(key: K): this {
        this.map.set(key, key);
        return this;
    }

    delete(key: K): boolean {
        return this.map.delete(key);
    }

    clear(): void {
        this.map.clear();
    }

    clone(): HashSet<K> {
        const clone = new HashSet<K>(this.hashCode, this.equals);
        this.forEach(key => clone.add(key));
        return clone;
    }

    forEach(callback: (value: K, key: K, set: ReadonlySet<K>) => void) {
        this.map.forEach((value, key) => callback(value, key, this));
    }

    keys(): IterableIterator<K> {
        return this.map.keys();
    }

    values(): IterableIterator<K> {
        return this.map.values();
    }

    entries(): IterableIterator<[K, K]> {
        return this.map.entries();
    }

    [Symbol.iterator](): IterableIterator<K> {
        return this.map.keys();
    }
}
