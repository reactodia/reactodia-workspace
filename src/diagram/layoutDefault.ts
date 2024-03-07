import type { DefaultLayouts } from '../default-layouts.worker';

import { WorkerDefinition, defineWorker } from '../coreUtils/workers';

export function defineDefaultLayouts(workerUrl: string): WorkerDefinition<DefaultLayouts> {
    return defineWorker<typeof DefaultLayouts>(workerUrl, []);
}

export type { DefaultLayouts };
