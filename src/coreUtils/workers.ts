import * as React from 'react';

import type { WorkerCall, WorkerCallSuccess, WorkerCallError, WorkerConstructor } from '../worker-protocol';

export function defineWorker<T extends WorkerConstructor<unknown[], unknown>>(
    workerUrl: string,
    constructorArgs: ConstructorParameters<T>
): WorkerDefinition<InstanceType<T>> {
    return {
        [WORKER_CONSTRUCT]: () => {
            return {
                instance: new LazyWorkerProxy(workerUrl, constructorArgs),
                refCount: 0,
            };
        },
        [WORKER_STATE]: undefined,
    };
}

const WORKER_CONSTRUCT = Symbol('Reactodia.RegisteredWorker.construct');
const WORKER_STATE = Symbol('Reactodia.RegisteredWorker.state');

export interface WorkerDefinition<T> {
    readonly [WORKER_CONSTRUCT]: () => RefCountedWorkerState<T>;
    [WORKER_STATE]: RefCountedWorkerState<T> | undefined;
}

interface RefCountedWorkerState<T> {
    readonly instance: LazyWorkerProxy<T>;
    refCount: number;
}

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
                    exitState.instance.dispose();
                    worker[WORKER_STATE] = undefined;
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
    readonly workerUrl: string;
    readonly constructorArgs: unknown[];
}

interface LazyWorkerProxyConnectedState {
    readonly type: 'connected';
    readonly connection: Promise<readonly [WorkerConnection, AbortSignal]>;
    readonly controller: AbortController;
}

interface LazyWorkerProxyDisposedState {
    readonly type: 'disposed';
}

type LazyWorkerProxyMethod = (...args: unknown[]) => Promise<unknown>;

class LazyWorkerProxy<T> {
    private static readonly PROXY_OWNER = Symbol('LazyWorkerProxy.owner');

    private connectionState:
        | LazyWorkerProxyInitialState
        | LazyWorkerProxyConnectedState
        | LazyWorkerProxyDisposedState;
    private readonly methods = new Map<string, LazyWorkerProxyMethod>();

    readonly proxy: T;

    constructor(workerUrl: string, constructorArgs: unknown[]) {
        this.connectionState = {type: 'initial', workerUrl, constructorArgs};
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
                const {workerUrl, constructorArgs} = this.connectionState;
                const controller = new AbortController();
                const connection = (async () => {
                    controller.signal.throwIfAborted();
                    const rawConnection = new WorkerConnection(new Worker(workerUrl));
                    await rawConnection.call('constructor', constructorArgs, {
                        signal: controller.signal,
                    });
                    return [rawConnection, controller.signal] as const;
                })();
                this.connectionState = {type: 'connected', connection, controller};
                return connection;
            }
            case 'connected': {
                const {connection} = this.connectionState;
                return connection;
            }
            case 'disposed': {
                throw new Error('LazyWorkerProxy was disposed');
            }
        }
    }

    dispose() {
        switch (this.connectionState.type) {
            case 'initial': {
                this.connectionState = {type: 'disposed'};
                break;
            }
            case 'connected': {
                const {controller} = this.connectionState;
                controller.abort();
                this.connectionState = {type: 'disposed'};
                break;
            }
        }
    }
}

class WorkerConnection {
    private readonly worker: Worker;
    private readonly requests = new Map<number, WorkerRequest>();
    private nextCallId = 1;

    constructor(worker: Worker) {
        this.worker = worker;
        this.worker.addEventListener('message', this.onMessage);
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

    dispose() {
        this.worker.removeEventListener('message', this.onMessage);
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
