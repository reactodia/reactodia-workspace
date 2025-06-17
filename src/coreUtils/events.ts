/**
 * Event listener callback for a specific event type.
 *
 * @see {@link Events.on}
 */
export type Listener<Data, Key extends keyof Data> = (data: Data[Key]) => void;
/**
 * Event listener callback for all event types.
 *
 * @see {@link Events.onAny}
 */
export type AnyListener<Data> = (data: Partial<Data>) => void;
/** @hidden */
export type Unsubscribe = () => void;

/**
 * Event data for a property change event, i.e. event which is raised
 * when some property value changes to another.
 */
export interface PropertyChange<Source, Value> {
    /**
     * Event source (the object owning the property).
     */
    readonly source: Source;
    /**
     * Previous value for a property which has changed.
     */
    readonly previous: Value;
}

/**
 * Event data for combined (all) event types.
 *
 * @see {@link Events.onAny}
 */
export interface AnyEvent<Data> {
    readonly data: Partial<Data>;
}

/**
 * Defines an observable object with one or many event types to subscribe to.
 *
 * `Data` type variable is expected to be an interface type, where each property
 * is an event type and its value type is event data.
 *
 * @category Core
 * @see {@link EventTrigger}
 * @see {@link EventSource}
 */
export interface Events<out Data> {
    on<Key extends keyof Data>(eventKey: Key, listener: Listener<Data, Key>): void;
    off<Key extends keyof Data>(eventKey: Key, listener: Listener<Data, Key>): void;
    onAny(listener: AnyListener<Data>): void;
    offAny(listener: AnyListener<Data>): void;
}

/**
 * Defines an event emitter which can trigger one or many event types.
 *
 * `Data` type variable is expected to be an interface type, where each property
 * is an event type and its value type is event data.
 * 
 * @category Core
 * @see {@link Events}
 * @see {@link EventSource}
 */
export interface EventTrigger<in Data> {
    trigger<Key extends keyof Data>(eventKey: Key, data: Data[Key]): void;
}

/**
 * Implements an event bus, exposing both an observable object ({@link Events}) and
 * event emitter ({@link EventTrigger}) sides.
 *
 * **Example**:
 * ```ts
 * interface CollectionEvents {
 *     addItem: AddItemEvent;
 *     removeItem: RemoveItemEvent;
 * }
 * 
 * const source = new EventSource<CollectionEvents>();
 * const events: Events<CollectionEvents> = source;
 * 
 * events.on('addItem', e => { ... });
 *
 * source.trigger('addItem', { item: someItem });
 * ```
 * 
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
                anyListener({[eventKey]: data} as unknown as Partial<Data>);
            }
        }
    }
}

/**
 * Provides a convenient way to subscribe to one or many observable objects
 * and unsubscribe from all of them at once.
 * 
 * @category Core
 * @see {@link Events}
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
