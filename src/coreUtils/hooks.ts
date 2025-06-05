import * as React from 'react';
import { useSyncExternalStore } from 'use-sync-external-store/shim';

import type { Events } from './events';

/**
 * Represents an event store which can be subscribed to listen its changes.
 *
 * This store exactly the same as accepted by
 * [React.useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore) hook.
 */
export type SyncStore = (onChange: () => void) => (() => void);

/**
 * Subscribes to a value which changes are tracked by the specified event.
 *
 * @param events an observable object to subscribe with the result store
 * @param key event type from the `events` to subscribe with the result store
 * @param getSnapshot a function to get a snapshot of an observed property state
 * @param deps hook dependency list to re-subscribe to the store on changes
 * @category Hooks
 * @see {@link useEventStore}
 * @see {@link useSyncStore}
 */
export function useObservedProperty<E, K extends keyof E, R>(
    events: Events<E>,
    key: K,
    getSnapshot: () => R,
    deps?: React.DependencyList
): R {
    const subscribe = useEventStore(events, key, deps);
    return useSyncStore(subscribe, getSnapshot);
}

const NEVER_SYNC_STORE_DISPOSE = (): void => {};
const NEVER_SYNC_STORE: SyncStore = () => NEVER_SYNC_STORE_DISPOSE;

/**
 * An event store that never triggers any change.
 *
 * @category Utility
 */
export function neverSyncStore(): SyncStore {
    return NEVER_SYNC_STORE;
}

/**
 * Creates an event store which changes when an event triggers with the specified event type.
 *
 * @param events an observable object to subscribe with the result store
 * @param key event type from the `events` to subscribe with the result store
 * @param deps hook dependency list to re-subscribe to the store on changes
 * @category Hooks
 */
export function useEventStore<E, K extends keyof E>(
    events: Events<E> | undefined,
    key: K,
    deps?: React.DependencyList
): SyncStore {
    return React.useCallback((onStoreChange: () => void) => {
        if (events) {
            events.on(key, onStoreChange);
            return () => events.off(key, onStoreChange);
        } else {
            return NEVER_SYNC_STORE_DISPOSE;
        }
    }, deps ? [events, key, ...deps] : [events, key]);
}

/**
 * Transforms event store in a way that the result store debounces the changes
 * until the next rendered frame via
 * [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame).
 *
 * @category Hooks
 */
export function useFrameDebouncedStore(subscribe: SyncStore): SyncStore {
    return React.useCallback<SyncStore>(onChange => {
        let scheduled: number | undefined;
        const onFrame = () => {
            scheduled = undefined;
            onChange();
        };
        const dispose = subscribe(() => {
            if (scheduled === undefined) {
                scheduled = requestAnimationFrame(onFrame);
            }
        });
        return () => {
            if (scheduled !== undefined) {
                cancelAnimationFrame(scheduled);
            }
            dispose();
        };
    }, [subscribe]);
}

/**
 * Same as [React.useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
 * with a support shim for lower React versions.
 *
 * @category Hooks
 */
export function useSyncStore<R>(subscribe: SyncStore, getSnapshot: () => R): R {
    return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Same as [React.useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
 * with custom equality comparison for snapshot values.
 * 
 * Update will be skipped unless `equalResults()` called with previous and
 * current snapshot returns `false`.
 *
 * @category Hooks
 */
export function useSyncStoreWithComparator<R>(
    subscribe: SyncStore,
    getSnapshot: () => R,
    equalResults: (a: R, b: R) => boolean
) {
    const lastSnapshot = React.useRef<[R]>(undefined);
    return useSyncExternalStore(
        subscribe,
        () => {
            const result = getSnapshot();
            if (lastSnapshot.current) {
                const [lastResult] = lastSnapshot.current;
                if (equalResults(lastResult, result)) {
                    return lastResult;
                }
            }
            lastSnapshot.current = [result];
            return result;
        }
    );
}
