export abstract class BatchingScheduler {
    private useAnimationFrame: boolean;
    // TODO: fix
    private scheduled: any;

    constructor(readonly waitingTime = 0) {
        this.useAnimationFrame = waitingTime === 0;
        this.runSynchronously = this.runSynchronously.bind(this);
    }

    protected schedule() {
        if (typeof this.scheduled === 'undefined') {
            if (this.useAnimationFrame) {
                this.scheduled = requestAnimationFrame(this.runSynchronously);
            } else {
                this.scheduled = setTimeout(this.runSynchronously, this.waitingTime);
            }
        }
    }

    protected abstract run(): void;

    runSynchronously() {
        const wasScheduled = this.cancelScheduledTimeout();
        if (wasScheduled) {
            this.run();
        }
    }

    dispose() {
        this.cancelScheduledTimeout();
    }

    private cancelScheduledTimeout(): boolean {
        if (typeof this.scheduled !== 'undefined') {
            if (this.useAnimationFrame) {
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

export class BufferingQueue<Key extends string> extends BatchingScheduler {
    private queuedItems = new Set<Key>();

    constructor(
        private onFetch: (keys: Key[]) => void,
        waitingTime = 200
    ) {
        super(waitingTime);
    }

    has(key: Key): boolean {
        return this.queuedItems.has(key);
    }

    push(key: Key): void {
        this.queuedItems.add(key);
        this.schedule();
    }

    clear(): void {
        this.queuedItems.clear();
    }

    protected run(): void {
        const {queuedItems, onFetch} = this;
        const keys = Array.from(queuedItems);
        queuedItems.clear();
        onFetch(keys);
    }
}

export class Debouncer extends BatchingScheduler {
    private callback: (() => void) | undefined;

    call(callback: () => void) {
        this.callback = callback;
        this.schedule();
    }

    protected run() {
        const callback = this.callback;
        callback?.();
    }
}

export function animateInterval(
    duration: number,
    onProgress: (progress: number) => void,
    signal?: AbortSignal
): Promise<void> {
    return new Promise(resolve => {
        let animationFrameId: number;
        let start: number;
        let cleanupAbort: (() => void) | undefined;

        const animate = (time: number) => {
            if (signal && signal.aborted) { return; }

            start = start || time;
            let timePassed = time - start;
            if (timePassed > duration) { timePassed = duration; }

            onProgress(timePassed / duration);

            if (timePassed < duration) {
                animationFrameId = requestAnimationFrame(animate);
            } else {
                cleanupAbort?.();
                resolve();
            }
        };

        if (signal) {
            const onAbort = () => {
                cancelAnimationFrame(animationFrameId);
                cleanupAbort?.();
                resolve();
            };
            cleanupAbort = () => {
                signal.removeEventListener('abort', onAbort);
            };
            signal.addEventListener('abort', onAbort);
        }
        animationFrameId = requestAnimationFrame(animate);
    });
}

export function easeInOutBezier(t: number) {
    if (t < 0) { return 0; }
    if (t > 1) { return 1; }
    return t * t * (3.0 - 2.0 * t);
}
