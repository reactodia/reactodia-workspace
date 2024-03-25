import * as cola from 'webcola';

import { connectWorker } from './worker-protocol';
import type { LayoutGraph, LayoutState } from './diagram/layout';
import {
    DefaultLayoutOptions, blockingDefaultLayout,
    ColaForceLayoutOptions, colaForceLayout,
    ColaFlowLayoutOptions, colaFlowLayout,
    colaRemoveOverlaps,
} from './diagram/layoutShared';

class DefaultLayouts {
    async defaultLayout(
        graph: LayoutGraph,
        state: LayoutState,
        options?: DefaultLayoutOptions
    ): Promise<LayoutState> {
        return blockingDefaultLayout(graph, state, options);
    }

    async forceLayout(
        graph: LayoutGraph,
        state: LayoutState,
        options?: ColaForceLayoutOptions
    ): Promise<LayoutState> {
        return colaForceLayout(graph, state, options);
    }

    async flowLayout(
        graph: LayoutGraph,
        state: LayoutState,
        options?: ColaFlowLayoutOptions
    ): Promise<LayoutState> {
        return colaFlowLayout(graph, state, options);
    }

    async removeOverlaps(
        graph: LayoutGraph,
        state: LayoutState
    ): Promise<LayoutState> {
        return colaRemoveOverlaps(state);
    }
}

export type { DefaultLayouts };

connectWorker(DefaultLayouts);
