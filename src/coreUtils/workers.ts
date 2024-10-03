import * as React from 'react';

import type { WorkerCall, WorkerCallSuccess, WorkerCallError, WorkerConstructor } from '../worker-protocol';

/**
 * Creates a ref-counted Web Worker definition.
 *
 * The worker module should follow a specific communication protocol,
 * defined by `@reactodia/workspace/worker-protocol` module.
 *
 * **Example**:
 * ```
 * const worker = defineWorker(() => new Worker('./worker.js'), []);
 * 
 * function Component() {
 *   const instance = useWorker(worker);
 *   ...
 * }
 * ```
 *
 * @category Utilities
 * @see useWorker()
 */
export function defineWorker<T extends WorkerConstructor<unknown[], unknown>>(
    workerFactory: () => Worker,
    constructorArgs: ConstructorParameters<T>
): WorkerDefinition<InstanceType<T>> {
    return {
        [WORKER_CONSTRUCT]: () => {
            return {
                instance: new LazyWorkerProxy(workerFactory, constructorArgs),
                refCount: 0,
            };
        },
        [WORKER_STATE]: undefined,
    };
}

const WORKER_CONSTRUCT = Symbol('WorkerDefinition.construct');
const WORKER_STATE = Symbol('WorkerDefinition.state');

export interface WorkerDefinition<T> {
    /** @hidden */
    readonly [WORKER_CONSTRUCT]: () => RefCountedWorkerState<T>;
    /** @hidden */
    [WORKER_STATE]: RefCountedWorkerState<T> | undefined;
}

interface RefCountedWorkerState<T> {
    readonly instance: LazyWorkerProxy<T>;
    refCount: number;
}

/**
 * Gets a shared instance of the defined worker.
 *
 * The worker instance will be created on the first call and
 * disposed when the last component using the hook is unmounted.
 *
 * @category Hooks
 * @see defineWorker()
 */
export function useWorker<T>(worker: WorkerDefinition<T>): T {
    React.useEffect(() => {
        let enterState = worker[WORKER_STATE];
        if (!enterState) {
            enterState = worker[WORKER_CONSTRUCT]();
            worker[WORKER_STATE] = enterState;
        }
        enterState.refCount++;

        return () => {
            const exitState = worker[WORKER_STATE];
            if (exitState) {
                exitState.refCount--;
                if (exitState.refCount <= 0) {
                    exitState.instance.disconnect();
                }
            }
        };
    }, [worker]);

    let state = worker[WORKER_STATE];
    if (!state) {
        state = worker[WORKER_CONSTRUCT]();
        worker[WORKER_STATE] = state;
    }
    return state.instance.proxy;
}

interface LazyWorkerProxyInitialState {
    readonly type: 'initial';
    
}

interface LazyWorkerProxyConnectingState {
    readonly type: 'connecting';
    readonly request: Promise<readonly [WorkerConnection, AbortSignal]>;
    readonly controller: AbortController;
}

interface LazyWorkerProxyConnectedState {
    readonly type: 'connected';
    readonly connection: WorkerConnection;
    readonly controller: AbortController;
}

type LazyWorkerProxyMethod = (...args: unknown[]) => Promise<unknown>;

class LazyWorkerProxy<T> {
    private static readonly PROXY_OWNER = Symbol('LazyWorkerProxy.owner');

    private connectionState:
        | LazyWorkerProxyInitialState
        | LazyWorkerProxyConnectingState
        | LazyWorkerProxyConnectedState;
    private readonly methods = new Map<string, LazyWorkerProxyMethod>();

    readonly proxy: T;

    constructor(
        private readonly workerFactory: () => Worker,
        private readonly constructorArgs: unknown[]
    ) {
        this.connectionState = {type: 'initial'};
        const proxyTarget = {
            [LazyWorkerProxy.PROXY_OWNER]: this,
        };
        this.proxy = new Proxy(proxyTarget, {
            get: (target, property) => {
                if (typeof property !== 'string') {
                    return undefined;
                }
                const owner = target[LazyWorkerProxy.PROXY_OWNER];
                return owner.getMethod(property);
            }
        }) as T;
    }

    private getMethod(methodName: string): LazyWorkerProxyMethod {
        let method = this.methods.get(methodName);
        if (!method) {
            method = async (...args: unknown[]): Promise<unknown> => {
                const [connection, signal] = await this.ensureConnection();
                return connection.call(methodName, args, {signal});
            };
        }
        return method;
    }

    private async ensureConnection(): Promise<readonly [WorkerConnection, AbortSignal]> {
        switch (this.connectionState.type) {
            case 'initial': {
                const initialState = this.connectionState;
                const controller = new AbortController();
                const request = this.connect(initialState, controller.signal)
                    .then(result => {
                        const [connection, signal] = result;
                        if (signal.aborted) {
                            connection.dispose();
                        }
                        signal.throwIfAborted();
                        this.connectionState = {
                            type: 'connected',
                            connection,
                            controller,
                        };
                        return result;
                    });
                this.connectionState = {type: 'connecting', request, controller};
                return request;
            }
            case 'connecting': {
                const {request} = this.connectionState;
                return request;
            }
            case 'connected': {
                const {connection, controller} = this.connectionState;
                return Promise.resolve([connection, controller.signal] as const);
            }
        }
    }

    private async connect(
        state: LazyWorkerProxyInitialState,
        signal: AbortSignal
    ): Promise<readonly [WorkerConnection, AbortSignal]> {
        signal.throwIfAborted();
        const {workerFactory, constructorArgs} = this;
        const rawConnection = new WorkerConnection(workerFactory());
        await rawConnection.call('constructor', constructorArgs, {signal});
        return [rawConnection, signal] as const;
    }

    disconnect() {
        switch (this.connectionState.type) {
            case 'connecting': {
                const {controller} = this.connectionState;
                controller.abort();
                break;
            }
            case 'connected': {
                const {connection, controller} = this.connectionState;
                controller.abort();
                connection.dispose();
                break;
            }
        }
        this.connectionState = {type: 'initial'};
    }
}

class WorkerConnection {
    private readonly worker: Worker;
    private readonly requests = new Map<number, WorkerRequest>();
    private nextCallId = 1;

    constructor(worker: Worker) {
        this.worker = worker;
        this.worker.addEventListener('message', this.onMessage);
        this.worker.addEventListener('error', this.onError);
    }

    call(
        method: string,
        args: readonly unknown[],
        options?: { signal?: AbortSignal }
    ): Promise<unknown> {
        const id = this.nextCallId++;
        const promise = new Promise<unknown>((resolve, reject) => {
            this.requests.set(id, {resolve, reject});
        });
        const call: WorkerCall = {type: 'call', id, method, args};
        this.worker.postMessage(call);
        return promise;
    }

    private onMessage = (e: MessageEvent) => {
        type ResponseMessage = WorkerCallSuccess | WorkerCallError
        const message = e.data as ResponseMessage;
        const request = this.requests.get(message.id);
        if (request) {
            this.requests.delete(message.id);

            switch (message.type) {
                case 'success': {
                    request.resolve(message.result);
                    break;
                }
                case 'error': {
                    request.reject(message.error);
                    break;
                }
                default: {
                    console.warn(
                        `Unexpected worker response type: ${(message as ResponseMessage).type}`
                    );
                    break;
                }
            }
        }
    };

    private onError = (e: ErrorEvent) => {
        const activeRequests = Array.from(this.requests.values());
        this.requests.clear();
        for (const request of activeRequests) {
            request.reject(e);
        }
    };

    dispose() {
        this.worker.removeEventListener('message', this.onMessage);
        this.worker.removeEventListener('error', this.onError);
        this.worker.terminate();
    }

    [Symbol.dispose]() {
        this.dispose();
    }
}

interface WorkerRequest {
    readonly resolve: (result: unknown) => void;
    readonly reject: (err: unknown) => void;
}
