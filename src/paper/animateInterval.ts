/**
 * Runs specified callback on each rendered frame for the `duration` interval
 * using [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame).
 *
 * @category Utilities
 */
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
