export type Listener<Data, Key extends keyof Data> = (data: Data[Key]) => void;
export type AnyListener<Data> = (data: Partial<Data>) => void;
/** @hidden */
export type Unsubscribe = () => void;

export interface PropertyChange<Source, Value> {
    readonly source: Source;
    readonly previous: Value;
}

export interface AnyEvent<Data> {
    readonly data: Partial<Data>;
}

/**
 * @category Core
 */
export interface Events<out Data> {
    on<Key extends keyof Data>(eventKey: Key, listener: Listener<Data, Key>): void;
    off<Key extends keyof Data>(eventKey: Key, listener: Listener<Data, Key>): void;
    onAny(listener: AnyListener<Data>): void;
    offAny(listener: AnyListener<Data>): void;
}

/**
 * @category Core
 */
export interface EventTrigger<in Data> {
    trigger<Key extends keyof Data>(eventKey: Key, data: Data[Key]): void;
}

/**
 * @category Core
 */
export class EventSource<Data> implements Events<Data>, EventTrigger<Data> {
    private listeners = new Map<keyof Data, Set<Listener<Data, any>>>();
    private anyListeners: Set<AnyListener<Data>> | undefined;

    on<Key extends keyof Data>(eventKey: Key, listener: Listener<Data, Key>): void {
        let listeners = this.listeners.get(eventKey);
        if (!listeners) {
            listeners = new Set();
            this.listeners.set(eventKey, listeners);
        }
        listeners.add(listener);
    }

    onAny(listener: AnyListener<Data>): void {
        let listeners = this.anyListeners;
        if (!listeners) {
            listeners = new Set();
            this.anyListeners = listeners;
        }
        listeners.add(listener);
    }

    off<Key extends keyof Data>(eventKey: Key, listener: Listener<Data, Key>): void {
        const listeners = this.listeners.get(eventKey);
        if (listeners) {
            listeners.delete(listener);
        }
    }

    offAny(listener: AnyListener<Data>): void {
        const listeners = this.anyListeners;
        if (listeners) {
            listeners.delete(listener);
        }
    }

    trigger<Key extends keyof Data>(eventKey: Key, data: Data[Key]): void {
        const listeners = this.listeners.get(eventKey);
        if (listeners) {
            for (const listener of listeners) {
                listener(data);
            }
        }

        if (this.anyListeners) {
            for (const anyListener of this.anyListeners) {
                anyListener({[eventKey]: data} as any);
            }
        }
    }
}

/**
 * @category Core
 */
export class EventObserver {
    private onDispose = new Set<Unsubscribe>();

    listen<Data, Key extends keyof Data>(
        events: Events<Data>, eventKey: Key, listener: Listener<Data, Key>
    ) {
        events.on(eventKey, listener);
        this.onDispose.add(() => events.off(eventKey, listener));
    }

    listenAny<Data>(events: Events<Data>, listener: AnyListener<Data>) {
        events.onAny(listener);
        this.onDispose.add(() => events.offAny(listener));
    }

    listenOnce<Data, Key extends keyof Data>(
        events: Events<Data>, eventKey: Key, listener: Listener<Data, Key>
    ) {
        // eslint-disable-next-line prefer-const
        let unsubscribe: Unsubscribe;
        const onceListener: Listener<Data, Key> = (data) => {
            events.off(eventKey, onceListener);
            this.onDispose.delete(unsubscribe);
            listener(data);
        };
        unsubscribe = () => {
            events.off(eventKey, onceListener);
            this.onDispose.delete(unsubscribe);
        };
        events.on(eventKey, onceListener);
        this.onDispose.add(unsubscribe);
    }

    stopListening() {
        for (const unsubscribe of this.onDispose) {
            unsubscribe();
        }
        this.onDispose.clear();
    }
}
