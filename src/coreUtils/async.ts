export function mapAbortedToNull<T>(
    promise: Promise<T>,
    signal: AbortSignal | undefined
): Promise<T | null> {
    const onResolve = (value: T): T | null => {
        if (signal && signal.aborted) { return null; }
        return value;
    };
    const onReject = (err: any): null | Promise<null> => {
        if (signal && signal.aborted) { return null; }
        return Promise.reject(err);
    };
    return promise.then(onResolve, onReject);
}

export function raceAbortSignal<T>(
    promise: Promise<T>,
    signal: AbortSignal | undefined
): Promise<T> {
    if (!signal) {
        return promise;
    }
    let cleanup: (() => void) | undefined;
    const abortPromise = new Promise<T>((resolve, reject) => {
        cleanup = () => {
            signal.removeEventListener('abort', onAbort);
            cleanup = undefined;
        };
        const onAbort = () => {
            cleanup?.();
            try {
                signal.throwIfAborted();
            } catch (err) {
                reject(err);
            }
            reject(new Error('Failed to throw abort error'));
        };
        signal.addEventListener('abort', onAbort);
    });
    return Promise.race([promise, abortPromise]).then(result => {
        cleanup?.();
        return result;
    });
}

export function delay(timeout: number) {
    return new Promise<void>(resolve => setTimeout(() => resolve(), timeout));
}
