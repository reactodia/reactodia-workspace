export interface WorkerCall {
    readonly type: 'call';
    readonly id: number;
    readonly method: string;
    readonly args: readonly unknown[];
}

export interface WorkerCallSuccess {
    readonly type: 'success';
    readonly id: number;
    readonly result: unknown;
}

export interface WorkerCallError {
    readonly type: 'error';
    readonly id: number;
    readonly error: unknown;
}

export type WorkerObject<T> = { [K in keyof T]: (...args: any[]) => Promise<any> };
export type WorkerConstructor<A extends any[], T> = new (...initArgs: A) => WorkerObject<T>;

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
