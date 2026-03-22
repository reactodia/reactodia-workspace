/**
 * Transforms `Promise` in such a way that resolved or rejected results
 * are mapped to `null` if specified abort `signal` is aborted.
 *
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
 * Waits a specified timeout in milliseconds the resolves the result promise.
 *
 * Can be cancelled via specified `AbortSignal`, in which case the promise
 * will be rejected with abort signal reason (an error with `name === "AbortError"`).
 *
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

export class AsyncLock {
    private active: AsyncLockItem | undefined;

    acquire(): Promise<AsyncLockToken> {
        let item!: AsyncLockItem;
        const promise = new Promise<AsyncLockToken>((resolve, reject) => {
            item = {
                resolve,
                reject,
                token: {
                    release: () => this.release(item),
                }
            };
        });
        
        if (this.active) {
            this.active.next = item;
        } else {
            this.active = item;
            this.activate();
        }

        return promise;
    }

    private release(item: AsyncLockItem): Promise<void> {
        if (this.active === item) {
            this.active = this.active.next;
            this.activate();
        }
        return Promise.resolve();
    }

    private activate(): void {
        if (this.active) {
            this.active.resolve(this.active.token);
        }
    }

    dispose(): void {
        let item = this.active;
        while (item) {
            item.reject(new Error('AsyncLock is disposed'));
            item = item.next;
        }
    }
}

interface AsyncLockItem {
    resolve: (token: AsyncLockToken) => void;
    reject: (error: unknown) => void;
    token: AsyncLockToken;
    next?: AsyncLockItem | undefined;
}

export interface AsyncLockToken {
    release(): Promise<void>;
}
