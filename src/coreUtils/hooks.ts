import * as React from 'react';
import { useSyncExternalStore } from 'use-sync-external-store/shim';

import { shallowArrayEqual } from './collections';
import type { Events } from './events';

export function useObservedProperty<E, K extends keyof E, R, Deps extends readonly unknown[]>(
    events: Events<E>,
    key: K,
    getSnapshot: () => R,
    getSnapshotDeps?: (result: R) => Deps,
): R {
    const subscribe = React.useCallback((onStoreChange: () => void) => {
        events.on(key, onStoreChange);
        return () => events.off(key, onStoreChange);
    }, [events, key]);
    const lastSnapshot = React.useRef<[R, Deps]>();
    return useSyncExternalStore(
        subscribe,
        getSnapshotDeps ? (
            () => {
                const result = getSnapshot();
                const deps = getSnapshotDeps(result);
                if (lastSnapshot.current) {
                    const [lastResult, lastDeps] = lastSnapshot.current;
                    if (shallowArrayEqual(lastDeps, deps)) {
                        return lastResult;
                    }
                }
                lastSnapshot.current = [result, deps];
                return result;
            }
        ) : getSnapshot
    );
}
