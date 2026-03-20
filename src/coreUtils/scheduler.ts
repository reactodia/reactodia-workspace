/**
 * Debounces a function call such that only one is performed if multiple
 * requests are made since initial one for the waiting time.
 *
 * If `timeout` is 'frame', then the timeout is assumed to be up until next
 * rendered frame via
 * [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame).
 *
 * @category Utilities
 */
export class Debouncer {
    private scheduled: number | undefined;

    private _timeout: number | 'frame';
    private callback: (() => void) | undefined;

    constructor(timeout: number | 'frame' = 'frame') {
        this._timeout = timeout;
        this.runSynchronously = this.runSynchronously.bind(this);
    }

    get timeout(): number | 'frame' {
        return this._timeout;
    }

    setTimeout(timeout: number | 'frame'): void {
        this._timeout = timeout;
    }

    call(callback: () => void) {
        this.callback = callback;
        this.schedule();
    }

    private schedule() {
        if (this.scheduled === undefined) {
            if (this.timeout === 'frame') {
                this.scheduled = requestAnimationFrame(this.runSynchronously);
            } else {
                this.scheduled = setTimeout(this.runSynchronously, this.timeout) as unknown as number;
            }
        }
    }

    private run() {
        const callback = this.callback;
        callback?.();
    }

    runSynchronously = () => {
        const wasScheduled = this.cancelScheduledTimeout();
        if (wasScheduled) {
            this.run();
        }
    };

    dispose() {
        this.cancelScheduledTimeout();
    }

    private cancelScheduledTimeout(): boolean {
        if (typeof this.scheduled !== 'undefined') {
            if (this.timeout === 'frame') {
                cancelAnimationFrame(this.scheduled);
            } else {
                clearTimeout(this.scheduled);
            }
            this.scheduled = undefined;
            return true;
        }
        return false;
    }
}

export class BufferingQueue<Key extends string> {
    private readonly debouncer: Debouncer;
    private readonly queuedItems = new Set<Key>();

    constructor(
        private onFetch: (keys: Key[]) => void,
        waitingTime = 200
    ) {
        this.debouncer = new Debouncer(waitingTime);
    }

    has(key: Key): boolean {
        return this.queuedItems.has(key);
    }

    push(key: Key): void {
        this.queuedItems.add(key);
        this.debouncer.call(this.run);
    }

    clear(): void {
        this.queuedItems.clear();
    }

    private run = (): void => {
        const {queuedItems, onFetch} = this;
        const keys = Array.from(queuedItems);
        queuedItems.clear();
        onFetch(keys);
    };
}
