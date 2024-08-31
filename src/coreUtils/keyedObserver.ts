import * as React from 'react';

import type { Unsubscribe } from './events';

/**
 * @category Utilities
 */
export class KeyedObserver<Key extends string> {
    private observedKeys = new Map<string, Unsubscribe>();

    constructor(
        private subscribe: (key: Key) => Unsubscribe | undefined
    ) {}

    setSubscribe(subscribe: (key: Key) => Unsubscribe | undefined): void {
        this.subscribe = subscribe;
    }

    observe(keys: ReadonlyArray<Key>) {
        if (keys.length === 0 && this.observedKeys.size === 0) {
            return;
        }
        const newObservedKeys = new Map<string, Unsubscribe>();

        for (const key of keys) {
            if (newObservedKeys.has(key)) { continue; }
            let unsubscribe = this.observedKeys.get(key);
            if (!unsubscribe) {
                unsubscribe = this.subscribe(key);
            }
            if (unsubscribe) {
                newObservedKeys.set(key, unsubscribe);
            }
        }

        this.observedKeys.forEach((unsubscribe, key) => {
            if (!newObservedKeys.has(key)) {
                unsubscribe();
            }
        });

        this.observedKeys = newObservedKeys;
    }

    stopListening() {
        this.observe([]);
    }
}

/**
 * Represents a per-key event store which can be subscribed to listen its changes.
 *
 * This store is similar to one accepted by `React.useSyncEventStore()` hook
 * but accepted by `useKeyedSyncStore()` instead.
 */
export type KeyedSyncStore<K, Context> = (
    key: K,
    context: Context,
    onStoreChange: () => void
) => () => void;

/**
 * @category Hooks
 */
export function useKeyedSyncStore<K extends string, Context>(
    store: KeyedSyncStore<K, Context>,
    keys: ReadonlyArray<K>,
    context: Context
): void {
    interface ObservedContext {
        readonly observer: KeyedObserver<K>;
        readonly forceUpdate: () => void;
        lastStore: typeof store;
    }

    const [, setVersion] = React.useState(0);
    const contextRef = React.useRef<ObservedContext>();

    let observedContext = contextRef.current;
    if (!observedContext) {
        const forceUpdate = () => setVersion(version => version + 1);
        const observer = new KeyedObserver<K>(key => store(key, context, forceUpdate));
        observedContext = {observer, forceUpdate, lastStore: store};
        contextRef.current = observedContext;
    }

    if (observedContext.lastStore !== store) {
        const {observer, forceUpdate} = observedContext;
        observer.setSubscribe(key => store(key, context, forceUpdate));
        observedContext.lastStore = store;
    }

    observedContext.observer.observe(keys);

    React.useEffect(() => {
        return () => contextRef.current?.observer.stopListening();
    }, []);
}
