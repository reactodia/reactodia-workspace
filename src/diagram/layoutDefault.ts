import type { DefaultLayouts } from '../layout.worker';

import { WorkerDefinition, defineWorker } from '../coreUtils/workers';

/**
 * @category Utilities
 */
export function defineLayoutWorker(workerFactory: () => Worker): WorkerDefinition<DefaultLayouts> {
    return defineWorker<typeof DefaultLayouts>(workerFactory, []);
}

export type { DefaultLayouts };
