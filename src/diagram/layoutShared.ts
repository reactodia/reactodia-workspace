import * as cola from 'webcola';

import type { Rect, Vector } from './geometry';
import type { LayoutGraph, LayoutState } from './layout';

/**
 * @category Geometry
 */
export function evaluateColaLayout(
    graph: LayoutGraph,
    state: LayoutState,
    evaluateLayout: (
        nodes: Map<string, cola.Node>,
        links: cola.Link<number | cola.Node>[]
    ) => void
): LayoutState {
    const nodes = new Map<string, cola.Node>();
    const links: cola.Link<number | cola.Node>[] = [];

    for (const [id, node] of Object.entries(graph.nodes)) {
        const bounds = Object.hasOwn(state.bounds, id)
            ? state.bounds[id] : undefined;

        nodes.set(id, {
            x: bounds ? bounds.x : 0,
            y: bounds ? bounds.y : 0,
            width: bounds ? bounds.width : undefined,
            height: bounds ? bounds.height : undefined,
            fixed: node.fixed ? 1 : 0,
        });
    }

    for (const link of graph.links) {
        const source = nodes.get(link.source);
        const target = nodes.get(link.target);
        if (source && target) {
            links.push({source, target});
        }
    }

    evaluateLayout(nodes, links);

    const bounds = Object.create(null) as { [id: string]: Rect };
    for (const [id, node] of nodes) {
        bounds[id] = {
            x: node.x,
            y: node.y,
            width: node.width ?? 0,
            height: node.height ?? 0,
        };
    }

    return {bounds};
}

export interface ColaForceLayoutOptions {
    /** @default 200 */
    preferredLinkLength: number;
    /** @default true */
    avoidOverlaps?: boolean;
}

/**
 * @category Geometry
 */
export function colaForceLayout(
    graph: LayoutGraph,
    state: LayoutState,
    options?: ColaForceLayoutOptions
): LayoutState {
    const {
        preferredLinkLength = 200,
        avoidOverlaps = true,
    } = options ?? {};
    return evaluateColaLayout(graph, state, (nodes, links) => {
        const layout = new cola.Layout()
            .nodes(Array.from(nodes.values()))
            .links(links)
            .avoidOverlaps(avoidOverlaps)
            .convergenceThreshold(1e-9)
            .jaccardLinkLengths(preferredLinkLength)
            .handleDisconnected(true);

        layout.start(30, 0, 10, undefined, false);
    });
}

export interface ColaFlowLayoutOptions {
    /** @default "y" */
    axis: 'x' | 'y';
    /** @default 200 */
    minSeparation?: number;
    /** @default 50 */
    preferredLinkLength?: number;
    /** @default true */
    avoidOverlaps?: boolean;
}

/**
 * @category Geometry
 */
export function colaFlowLayout(
    graph: LayoutGraph,
    state: LayoutState,
    options?: ColaFlowLayoutOptions
): LayoutState {
    const {
        axis = 'y',
        minSeparation = 200,
        preferredLinkLength = 50,
        avoidOverlaps = true,
    } = options ?? {};
    return evaluateColaLayout(graph, state, (nodes, links) => {
        const layout = new cola.Layout()
            .nodes(Array.from(nodes.values()))
            .links(links)
            .avoidOverlaps(avoidOverlaps)
            .flowLayout(axis, minSeparation)
            .symmetricDiffLinkLengths(preferredLinkLength);
        
        layout.start(10, 20, 20, undefined, false);
    });
}

/**
 * @category Geometry
 */
export function colaRemoveOverlaps(state: LayoutState): LayoutState {
    const nodeRectangles = new Map<string, cola.Rectangle>();
    for (const [id, {x, y, width, height}] of Object.entries(state.bounds)) {
        nodeRectangles.set(id, new cola.Rectangle(
            x, x + width,
            y, y + height
        ));
    }

    cola.removeOverlaps(Array.from(nodeRectangles.values()));

    const bounds = Object.create(null) as { [id: string]: Rect };
    for (const [id, {x, y}] of nodeRectangles) {
        const nodeBounds = Object.hasOwn(state.bounds, id) ? state.bounds[id] : undefined;
        bounds[id] = {
            x, y,
            width: nodeBounds ? nodeBounds.width : 0,
            height: nodeBounds ? nodeBounds.height : 0,
        };
    }

    return {bounds};
}

export interface PaddedLayoutState {
    readonly state: LayoutState;
    readonly unwrap: (transformed: LayoutState) => LayoutState;
}

/**
 * @category Geometry
 */
export function layoutPadded(
    state: LayoutState,
    padding: Vector | undefined
): PaddedLayoutState {
    if (!padding) {
        return {state, unwrap: transformed => transformed};
    }
    const paddedBounds = Object.create(null) as { [id: string]: Rect };
    for (const [id, {x, y, width, height}] of Object.entries(state.bounds)) {
        paddedBounds[id] = {
            x: x - padding.x,
            y: y - padding.y,
            width: width + padding.x * 2,
            height: height + padding.y * 2,
        };
    }
    const paddedState: LayoutState = {bounds: paddedBounds};
    return {
        state: paddedState,
        unwrap: transformed => {
            const shrinkBounds = Object.create(null) as { [id: string]: Rect };
            for (const [id, {x, y, width, height}] of Object.entries(transformed.bounds)) {
                shrinkBounds[id] = {
                    x: x + padding.x,
                    y: y + padding.y,
                    width: width - padding.x * 2,
                    height: height - padding.y * 2,
                };
            }
            return {bounds: shrinkBounds};
        }
    };
}

export interface PaddedBiasFreeLayoutState {
    readonly state: LayoutState;
    readonly unwrap: (transformed: LayoutState) => LayoutState;
}

/**
 * @category Geometry
 */
export function layoutPaddedBiasFree(
    state: LayoutState,
    padding: Vector | undefined
): PaddedBiasFreeLayoutState {
    const extendedBounds = Object.create(null) as { [id: string]: Rect };
    let compressX = Infinity;
    let compressY = Infinity;

    for (const [id, {x, y, width, height}] of Object.entries(state.bounds)) {
        const maxSide = Math.max(width, height);
        compressX = Math.min(width ? (maxSide / width) : 1, compressX);
        compressY = Math.min(height ? (maxSide / height) : 1, compressY);
        extendedBounds[id] = {
            x, y,
            width: maxSide,
            height: maxSide,
        };
    }

    const padded = layoutPadded({bounds: extendedBounds}, padding);
    return {
        state: padded.state,
        unwrap: transformed => {
            const withoutPadding = padded.unwrap(transformed);
            const fittingBox = getContentFittingBoxForLayout(withoutPadding);

            const uncompressedBounds = Object.create(null) as { [id: string]: Rect };
            for (const [id, bounds] of Object.entries(withoutPadding.bounds)) {
                const initialBounds = Object.hasOwn(state.bounds, id) ? state.bounds[id] : undefined;
                uncompressedBounds[id] = {
                    x: (bounds.x - fittingBox.x) / compressX + fittingBox.x,
                    y: (bounds.y - fittingBox.y) / compressY + fittingBox.y,
                    width: initialBounds ? initialBounds.width : bounds.width,
                    height: initialBounds ? initialBounds.height : bounds.height,
                };
            }
        
            return {bounds: uncompressedBounds};
        }
    };
}

/**
 * Options for {@link blockingDefaultLayout} function.
 *
 * @see {@link blockingDefaultLayout}
 */
export interface DefaultLayoutOptions {
    /**
     * Preferred length of the graph links in the result layout.
     *
     * @default 200
     */
    preferredLinkLength?: number;
    /**
     * Padding for each graph node to make them more spaced apart
     * when computing the layout.
     *
     * @default {x: 50, y: 50}
     */
    padding?: Vector;
}

/**
 * Default (fallback) diagram layout function.
 *
 * The algorithm used is force-directed layout from [cola.js](https://ialab.it.monash.edu/webcola/).
 *
 * **Warning**: this function is computationally expensive and should be used only as fallback
 * when other ways to compute diagram layout is not available as the browser execution will
 * freeze during the call for large diagrams.
 * 
 * The recommended way is to use web workers via
 * {@link defineLayoutWorker Reactodia.defineLayoutWorker()} to import the worker from
 * `@reactodia/workspace/layout.worker` and {@link useWorker Reactodia.useWorker()} to
 * get a layout function from it.
 *
 * @category Geometry
 */
export function blockingDefaultLayout(
    graph: LayoutGraph,
    state: LayoutState,
    options?: DefaultLayoutOptions
): Promise<LayoutState> {
    const {
        preferredLinkLength = 200,
        padding = {x: 50, y: 50},
    } = options ?? {};
    const withForce = colaForceLayout(graph, state, {
        preferredLinkLength,
        avoidOverlaps: false,
    });
    const padded = layoutPaddedBiasFree(withForce, padding);
    const withoutOverlaps = colaRemoveOverlaps(padded.state);
    const result = padded.unwrap(withoutOverlaps);
    return Promise.resolve(result);
}

/**
 * Computes complete bounding box for the element bounds in the provided layout state.
 *
 * @category Geometry
 */
export function getContentFittingBoxForLayout(state: LayoutState): Rect {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const [id, {x, y, width, height}] of Object.entries(state.bounds)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, y + height);
    }

    return {
        x: Number.isFinite(minX) ? minX : 0,
        y: Number.isFinite(minY) ? minY : 0,
        width: Number.isFinite(minX) && Number.isFinite(maxX) ? (maxX - minX) : 0,
        height: Number.isFinite(minY) && Number.isFinite(maxY) ? (maxY - minY) : 0,
    };
}
