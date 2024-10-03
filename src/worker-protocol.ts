/** @hidden */
export interface WorkerCall {
    readonly type: 'call';
    readonly id: number;
    readonly method: string;
    readonly args: readonly unknown[];
}

/** @hidden */
export interface WorkerCallSuccess {
    readonly type: 'success';
    readonly id: number;
    readonly result: unknown;
}

/** @hidden */
export interface WorkerCallError {
    readonly type: 'error';
    readonly id: number;
    readonly error: unknown;
}

export type WorkerObject<T> = { [K in keyof T]: (...args: any[]) => Promise<any> };
export type WorkerConstructor<A extends any[], T> = new (...initArgs: A) => WorkerObject<T>;

/**
 * Establishes a specific connection protocol between the callee (worker) and external
 * caller (which created a worker via `new Worker(...)` constructor).
 *
 * The protocol assumes the worker exposes an RPC-like interface via a `class` where
 * every public method returns a `Promise`. This interface is transparently mapped
 * from the caller to the worker via messages.
 *
 * **Example**:
 * ```ts
 * // calc-worker.ts
 * class Calculator {
 *     constructor(precision: number) { ... }
 *     add(a: number, b: number): Promise<number> { ... }
 * }
 *
 * connectWorker(Calculator);
 * 
 * // component.ts
 * const calcWorker = defineWorker(() => new Worker('./calc-worker.js'), [0.1]);
 * ...
 * function Component() {
 *     const calc = useWorker(calcWorker);
 *     ...
 *     const result = await calc.add(2, 3);
 * }
 * ```
 */
export function connectWorker<A extends any[], T>(factory: WorkerConstructor<A, T>): void {
    let handler: Record<string, (...args: unknown[]) => Promise<any>>;
    onmessage = async e => {
        const message = e.data as WorkerCall;
        if (message.type === 'call') {
            let response: WorkerCallSuccess | WorkerCallError;
            try {
                if (handler) {
                    const result = await handler[message.method](...message.args);
                    response = {
                        type: 'success',
                        id: message.id,
                        result,
                    };
                } else {
                    if (message.method !== 'constructor') {
                        throw new Error('Cannot call worker method without initializing it first');
                    }
                    handler = new factory(...(message.args as A));
                    response = {
                        type: 'success',
                        id: message.id,
                        result: undefined,
                    };
                }
            } catch (err) {
                response = {
                    type: 'error',
                    id: message.id,
                    error: err,
                };
            }
            postMessage(response);
        }
    };
}
