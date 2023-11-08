export type Listener<Data, Key extends keyof Data> = (data: Data[Key], key: Key) => void;
export type AnyListener<Data> = (data: Partial<Data>, key: string) => void;
export type Unsubscribe = () => void;

export interface PropertyChange<Source, Value> {
    readonly source: Source;
    readonly previous: Value;
}

export interface AnyEvent<Data> {
    readonly key: string;
    readonly data: Partial<Data>;
}

export interface Events<out Data> {
    on<Key extends keyof Data>(eventKey: Key, listener: Listener<Data, Key>): void;
    off<Key extends keyof Data>(eventKey: Key, listener: Listener<Data, Key>): void;
    onAny(listener: AnyListener<Data>): void;
    offAny(listener: AnyListener<Data>): void;
}

export interface EventTrigger<in Data> {
    trigger<Key extends keyof Data>(eventKey: Key, data: Data[Key]): void;
}

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
                listener(data, eventKey);
            }
        }

        if (this.anyListeners) {
            for (const anyListener of this.anyListeners) {
                anyListener({[eventKey]: data} as any, eventKey as string);
            }
        }
    }
}

export class EventObserver {
    private unsubscribeByKey = new Map<string, Unsubscribe[]>();
    private onDispose: Array<Unsubscribe> = [];

    listen<Data, Key extends keyof Data>(
        events: Events<Data>, eventKey: Key, listener: Listener<Data, Key>
    ) {
        events.on(eventKey, listener);
        this.onDispose.push(() => events.off(eventKey, listener));
    }

    listenAny<Data>(events: Events<Data>, listener: AnyListener<Data>) {
        events.onAny(listener);
        this.onDispose.push(() => events.offAny(listener));
    }

    listenOnce<Data, Key extends keyof Data>(
        events: Events<Data>, eventKey: Key, listener: Listener<Data, Key>
    ) {
        let handled = false;
        const onceListener: Listener<Data, Key> = (data, key) => {
            handled = true;
            events.off(eventKey, onceListener);
            listener(data, key);
        };
        events.on(eventKey, onceListener);
        this.onDispose.push(() => {
            if (handled) { return; }
            events.off(eventKey, onceListener);
        });
    }

    stopListening() {
        for (const unsubscribe of this.onDispose) {
            unsubscribe();
        }
        this.onDispose.length = 0;

        this.unsubscribeByKey.forEach(unsubscribers => {
            for (const unsubscribe of unsubscribers) {
                unsubscribe();
            }
        });
        this.unsubscribeByKey.clear();
    }
}
