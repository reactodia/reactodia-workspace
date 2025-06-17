import { connectWorker } from '@reactodia/worker-proxy/protocol';

import type { LayoutGraph, LayoutState } from './diagram/layout';
import {
    DefaultLayoutOptions, blockingDefaultLayout,
    ColaForceLayoutOptions, colaForceLayout,
    ColaFlowLayoutOptions, colaFlowLayout,
    colaRemoveOverlaps,
} from './diagram/layoutShared';

/**
 * Provides a web worker with basic diagram layout algorithms.
 */
class DefaultLayouts {
    /**
     * Default layout algorithm, the same as {@link blockingDefaultLayout}
     * but non-blocking due to being run in a worker.
     *
     * @see {@link blockingDefaultLayout}
     */
    defaultLayout = async (
        graph: LayoutGraph,
        state: LayoutState,
        options?: DefaultLayoutOptions
    ): Promise<LayoutState> => {
        return blockingDefaultLayout(graph, state, options);
    };

    /**
     * Force-directed layout algorithm from [cola.js](https://ialab.it.monash.edu/webcola/).
     */
    forceLayout = async (
        graph: LayoutGraph,
        state: LayoutState,
        options?: ColaForceLayoutOptions
    ): Promise<LayoutState> => {
        return Promise.resolve(colaForceLayout(graph, state, options));
    };

    /**
     * Flow layout algorithm from [cola.js](https://ialab.it.monash.edu/webcola/).
     */
    flowLayout = async (
        graph: LayoutGraph,
        state: LayoutState,
        options?: ColaFlowLayoutOptions
    ): Promise<LayoutState> => {
        return Promise.resolve(colaFlowLayout(graph, state, options));
    };

    /**
     * Remove overlaps algorithm from [cola.js](https://ialab.it.monash.edu/webcola/).
     */
    removeOverlaps = async (
        graph: LayoutGraph,
        state: LayoutState
    ): Promise<LayoutState> => {
        return Promise.resolve(colaRemoveOverlaps(state));
    };
}

export type { DefaultLayouts };

connectWorker(DefaultLayouts);
