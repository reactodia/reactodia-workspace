import type { ElementTypeIri, LinkTypeIri } from '../data/model';

import type { Element, Link } from './elements';
import { Rect, ShapeGeometry, Size, SizeProvider, Vector, boundsOf, calculateAveragePosition } from './geometry';
import type { DiagramModel } from './model';

/**
 * Represents basic graph structure as an input for a graph layout algorithm.
 *
 * @category Geometry
 */
export interface LayoutGraph {
    readonly nodes: { readonly [id: string]: LayoutNode };
    readonly links: ReadonlyArray<LayoutLink>;
}

/**
 * Represents basic graph node for a graph layout algorithm.
 *
 * @category Geometry
 * @see {@link LayoutGraph}
 */
export interface LayoutNode {
    readonly types: readonly ElementTypeIri[];
    readonly fixed?: boolean;
}

/**
 * Represents basic graph edge for a graph layout algorithm.
 *
 * @category Geometry
 * @see {@link LayoutGraph}
 */
export interface LayoutLink {
    readonly type: LinkTypeIri;
    readonly source: string;
    readonly target: string;
}

/**
 * Represents graph node positions and sizes as an input and an output state
 * for a graph layout algorithm.
 *
 * @category Geometry
 */
export interface LayoutState {
    readonly bounds: { readonly [id: string]: Rect };
}

/**
 * Performs a graph layout algorithm.
 *
 * @category Geometry
 */
export type LayoutFunction = (graph: LayoutGraph, state: LayoutState) => Promise<LayoutState>;

/**
 * Provides additional diagram content metadata for a graph layout algorithm.
 *
 * @category Geometry
 */
export interface LayoutTypeProvider {
    readonly getElementTypes?: (element: Element) => readonly ElementTypeIri[];
    readonly getLinkType?: (link: Link) => LinkTypeIri;
}

/**
 * Represents a result of performing a graph layout algorithm on a diagram.
 *
 * @category Geometry
 * @see {@link calculateLayout}
 * @see {@link applyLayout}
 */
export interface CalculatedLayout {
    positions: Map<string, Vector>;
    sizes: Map<string, Size>;
    nestedLayouts: CalculatedLayout[];
}

/**
 * Computes a layout on the specified diagram elements using specified
 * graph layout algorithm function ({@link LayoutFunction}).
 *
 * **Example**:
 * ```ts
 * const layout = await calculateLayout({
 *     layoutFunction: defaultLayout,
 *     model,
 *     sizeProvider: canvas.renderingState,
 * });
 * 
 * await canvas.animateGraph(() => {
 *     applyLayout(layout, model);
 * });
 * ```
 *
 * @category Geometry
 * @see {@link applyLayout}
 */
export async function calculateLayout(params: {
    /**
     * Graph layout algorithm function.
     */
    layoutFunction: LayoutFunction;
    /**
     * Model of a diagram to calculate layout for.
     */
    model: DiagramModel;
    /**
     * Size provider for the elements.
     */
    sizeProvider: SizeProvider;
    /**
     * Additional metadata provider for the elements.
     */
    typeProvider?: LayoutTypeProvider;
    /**
     * Set of elements which should not be moved by layout algorithm
     * (if supported).
     */
    fixedElements?: ReadonlySet<Element>;
    /**
     * Subset of elements from the diagram to layout.
     */
    selectedElements?: ReadonlySet<Element>;
    /**
     * Cancellation signal.
     */
    signal?: AbortSignal;
}): Promise<CalculatedLayout> {    
    const {
        layoutFunction, model, sizeProvider, typeProvider, fixedElements, selectedElements,
    } = params;

    if (selectedElements && selectedElements.size <= 1) {
        return {
            positions: new Map(),
            sizes: new Map(),
            nestedLayouts: [],
        };
    }

    let elements = model.elements;
    if (selectedElements) {
        elements = elements.filter(el => selectedElements.has(el));
    }

    const nodes = Object.create(null) as { [id: string]: LayoutNode };
    const bounds = Object.create(null) as { [id: string]: Rect };

    for (const element of elements) {
        nodes[element.id] = {
            types: typeProvider?.getElementTypes?.(element) ?? [],
            fixed: fixedElements?.has(element),
        };
        bounds[element.id] = boundsOf(element, sizeProvider);
    }

    const links: LayoutLink[] = [];

    for (const link of model.links) {
        if (
            Object.hasOwn(nodes, link.sourceId) &&
            Object.hasOwn(nodes, link.targetId) &&
            model.getLinkVisibility(link.typeId) !== 'hidden'
        ) {
            links.push({
                type: typeProvider?.getLinkType?.(link) ?? link.typeId,
                source: link.sourceId,
                target: link.targetId,
            });
        }
    }

    const state = await layoutFunction({nodes, links}, {bounds});

    const positions = new Map<string, Vector>();
    const sizes = new Map<string, Size>();
    for (const [id, {x, y, width, height}] of Object.entries(state.bounds)) {
        positions.set(id, {x, y});
        sizes.set(id, {width, height});
    }

    return {
        positions,
        sizes,
        nestedLayouts: [],
    };
}

/**
 * Applies the computed graph layout to the diagram.
 *
 * @category Geometry
 * @see {@link calculateLayout}
 */
export function applyLayout(
    layout: CalculatedLayout,
    model: DiagramModel
): void {
    const {positions, sizes, nestedLayouts} = layout;
    const sizeProvider = new StaticSizeProvider(sizes);

    const elements = model.elements.filter(({id}) => positions.has(id));
    for (const nestedLayout of nestedLayouts) {
        applyLayout(nestedLayout, model);
    }

    const averagePosition = calculateAveragePosition(elements, sizeProvider);
    for (const element of elements) {
        const position = positions.get(element.id);
        if (position) {
            element.setPosition(position);
        }
    }

    const newAveragePosition = calculateAveragePosition(elements, sizeProvider);
    const averageDiff: Vector = {
        x: averagePosition.x - newAveragePosition.x,
        y: averagePosition.y - newAveragePosition.y,
    };
    for (const [elementId, position] of positions) {
        const element = model.getElement(elementId)!;
        element.setPosition({
            x: position.x + averageDiff.x,
            y: position.y + averageDiff.y,
        });
    }
}

class StaticSizeProvider implements SizeProvider {
    constructor(private readonly sizes: ReadonlyMap<string, Size>) {}

    getElementSize(element: Element): Size | undefined {
        return this.sizes.get(element.id);
    }

    getElementShape(element: Element): ShapeGeometry {
        return {
            type: 'rect',
            bounds: boundsOf(element, this),
        };
    }
}

/**
 * Moves each point in `positions` by the same vector to ensure every point
 * has positive `x` and `y` coordinates, then additionally moves each point by `offset`.
 *
 * @category Geometry
 */
export function translateToPositiveQuadrant(positions: Map<string, Vector>, offset: Vector): void {
    let minX = Infinity, minY = Infinity;
    positions.forEach(position => {
        minX = Math.min(minX, position.x);
        minY = Math.min(minY, position.y);
    });

    const {x, y} = offset;
    positions.forEach((position, key) => {
        positions.set(key, {
            x: position.x - minX + x,
            y: position.y - minY + y,
        });
    });
}

/**
 * Make a function that maps successive integer indices into a positions
 * on a uniformly sized grid with the specified cell size.
 *
 * @category Geometry
 */
export function uniformGrid(params: {
    rows: number;
    cellSize: Vector;
}): (cellIndex: number) => Rect {
    return (cellIndex): Rect => {
        const row = Math.floor(cellIndex / params.rows);
        const column = cellIndex - row * params.rows;
        return {
            x: column * params.cellSize.x,
            y: row * params.cellSize.y,
            width: params.cellSize.x,
            height: params.cellSize.y,
        };
    };
}
