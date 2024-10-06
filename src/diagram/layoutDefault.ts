import type { DefaultLayouts } from '../layout.worker';

import { WorkerDefinition, defineWorker } from '../coreUtils/workers';

/**
 * Creates a definition for a a Web Worker with the default layout algorithms.
 *
 * @category Utilities
 */
export function defineLayoutWorker(workerFactory: () => Worker): WorkerDefinition<DefaultLayouts> {
    return defineWorker<typeof DefaultLayouts>(workerFactory, []);
}

export type { DefaultLayouts };
