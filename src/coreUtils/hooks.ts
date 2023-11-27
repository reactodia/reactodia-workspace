import * as React from 'react';
import { useSyncExternalStore } from 'use-sync-external-store/shim';

import type { Events } from './events';

export type SyncStore = (onChange: () => void) => (() => void);

export function useObservedProperty<E, K extends keyof E, R>(
    events: Events<E>,
    key: K,
    getSnapshot: () => R
): R {
    const subscribe = useEventStore(events, key);
    return useSyncStore(subscribe, getSnapshot);
}

export function useEventStore<E, K extends keyof E>(events: Events<E>, key: K): SyncStore {
    return React.useCallback((onStoreChange: () => void) => {
        events.on(key, onStoreChange);
        return () => events.off(key, onStoreChange);
    }, [events, key]);
}

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

export function useSyncStore<R>(
    subscribe: SyncStore,
    getSnapshot: () => R,
    equalResults?: (a: R, b: R) => boolean
) {
    const lastSnapshot = React.useRef<[R]>();
    return useSyncExternalStore(
        subscribe,
        equalResults ? (
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
        ) : getSnapshot
    );
}
