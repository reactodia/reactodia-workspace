/**
 * @category Utilities
 */
export function mapAbortedToNull<T>(
    promise: Promise<T>,
    signal: AbortSignal | undefined
): Promise<T | null> {
    const onResolve = (value: T): T | null => {
        if (signal && signal.aborted) { return null; }
        return value;
    };
    const onReject = (err: unknown): null | Promise<null> => {
        if (signal && signal.aborted) { return null; }
        return Promise.reject(err);
    };
    return promise.then(onResolve, onReject);
}

/**
 * @category Utilities
 */
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

export async function raceHappyEyes<T, R>(
    variants: readonly T[],
    makeAttempt: (variant: T, signal: AbortSignal) => Promise<R>,
    options: {
        timeout: number;
        signal?: AbortSignal;
    }
): Promise<R> {
    const {timeout, signal: parentSignal} = options;

    type AttemptResult =
        | { type: 'resolve', result: R }
        | { type: 'reject', variant: T }
        | { type: 'timeout' };

    using scope = new AbortScope(parentSignal);
    const {signal} = scope;

    const attempts = new Map<T, Promise<AttemptResult>>();
    let previous: T | undefined;
    for (const variant of variants) {
        signal.throwIfAborted();
        attempts.set(variant, makeAttempt(variant, signal).then(
            (result): AttemptResult => ({type: 'resolve', result}),
            (): AttemptResult => ({type: 'reject', variant})
        ));

        const wait = delay(timeout, {signal}).then((): AttemptResult => ({type: 'timeout'}));
        waitForEvent: while (attempts.size > 0) {
            const raced = await Promise.race([...attempts.values(), wait]);
            switch (raced.type) {
                case 'resolve': {
                    return raced.result;
                }
                case 'reject': {
                    attempts.delete(raced.variant);
                    if (raced.variant === previous) {
                        break waitForEvent;
                    }
                    break;
                }
                case 'timeout': {
                    break waitForEvent;
                }
            }
        }
        previous = variant;
    }

    throw new Error('No variants left to attempt');
}

/**
 * @category Utilities
 */
export class AbortScope {
    private readonly controller: AbortController;
    private readonly parentSignal: AbortSignal | undefined;
    private onAbort: (() => void) | undefined;

    constructor(parentSignal: AbortSignal | undefined) {
        this.controller = new AbortController();
        if (parentSignal) {
            this.parentSignal = undefined;
            this.onAbort = () => this.controller.abort();
            parentSignal.addEventListener('abort', this.onAbort);
        }
    }

    get signal(): AbortSignal {
        return this.controller.signal;
    }

    [Symbol.dispose]() {
        this.controller.abort();
        if (this.parentSignal && this.onAbort) {
            this.parentSignal.removeEventListener('abort', this.onAbort);
        }
    }

    abort() {
        this[Symbol.dispose]();
    }
}

/**
 * @category Utilities
 */
export function delay(timeout: number, options?: { signal?: AbortSignal }): Promise<void> {
    const signal = options?.signal;
    return new Promise<void>((resolve, reject) => {
        let onAbort: (() => void) | undefined;

        const timeoutId = setTimeout(() => {
            if (signal && onAbort) {
                signal.removeEventListener('abort', onAbort);
            }
            resolve();
        }, timeout);

        if (signal) {
            if (signal.aborted) {
                try {
                    signal.throwIfAborted();
                } catch (err) {
                    reject(err);
                }
            }
            onAbort = () => {
                clearTimeout(timeoutId);
                signal.removeEventListener('abort', onAbort!);
                try {
                    signal.throwIfAborted();
                } catch (err) {
                    reject(err);
                }
            };
            signal.addEventListener('abort', onAbort);
        }
    });
}
