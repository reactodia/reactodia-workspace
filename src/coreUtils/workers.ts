import type { RefCountedWorker } from '@reactodia/worker-proxy';
import * as React from 'react';

/**
 * Gets a shared instance of the ref-counted worker proxy.
 *
 * The worker instance will be created on the first call and
 * disposed when the last component using the hook is unmounted.
 *
 * See [`@reactodia/worker-proxy`](https://github.com/reactodia/worker-proxy)
 * for more information on working with transparent Web Worker proxies.
 *
 * @category Hooks
 * @see {defineLayoutWorker}
 */
export function useWorker<T>(worker: RefCountedWorker<T>): T {
    React.useEffect(() => {
        worker.acquire();
        return () => worker.release();
    }, [worker]);
    return worker.getProxy();
}
