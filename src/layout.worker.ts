import * as cola from 'webcola';

import { connectWorker } from './worker-protocol';
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
     * Default layout algorithm, the same as `blockingDefaultLayout()`
     * but non-blocking due to being run in a worker.
     *
     * @see blockingDefaultLayout()
     */
    async defaultLayout(
        graph: LayoutGraph,
        state: LayoutState,
        options?: DefaultLayoutOptions
    ): Promise<LayoutState> {
        return blockingDefaultLayout(graph, state, options);
    }

    /**
     * Force-directed layout algorithm from [cola.js](https://ialab.it.monash.edu/webcola/).
     */
    async forceLayout(
        graph: LayoutGraph,
        state: LayoutState,
        options?: ColaForceLayoutOptions
    ): Promise<LayoutState> {
        return colaForceLayout(graph, state, options);
    }

    /**
     * Flow layout algorithm from [cola.js](https://ialab.it.monash.edu/webcola/).
     */
    async flowLayout(
        graph: LayoutGraph,
        state: LayoutState,
        options?: ColaFlowLayoutOptions
    ): Promise<LayoutState> {
        return colaFlowLayout(graph, state, options);
    }

    /**
     * Remove overlaps algorithm from [cola.js](https://ialab.it.monash.edu/webcola/).
     */
    async removeOverlaps(
        graph: LayoutGraph,
        state: LayoutState
    ): Promise<LayoutState> {
        return colaRemoveOverlaps(state);
    }
}

export type { DefaultLayouts };

connectWorker(DefaultLayouts);
