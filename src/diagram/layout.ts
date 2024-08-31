import type { ElementTypeIri, LinkTypeIri } from '../data/model';

import { RestoreGeometry } from './commands';
import type { Element, Link } from './elements';
import { Rect, Size, SizeProvider, Vector, boundsOf } from './geometry';
import { DiagramModel } from './model';

/**
 * @category Geometry
 */
export interface LayoutGraph {
    readonly nodes: { readonly [id: string]: LayoutNode };
    readonly links: ReadonlyArray<LayoutLink>;
}

/**
 * @category Geometry
 */
export interface LayoutNode {
    readonly types: readonly ElementTypeIri[];
    readonly fixed?: boolean;
}

/**
 * @category Geometry
 */
export interface LayoutLink {
    readonly type: LinkTypeIri;
    readonly source: string;
    readonly target: string;
}

/**
 * @category Geometry
 */
export interface LayoutState {
    readonly bounds: { readonly [id: string]: Rect };
}

/**
 * @category Geometry
 */
export type LayoutFunction = (graph: LayoutGraph, state: LayoutState) => Promise<LayoutState>;

/**
 * @category Geometry
 */
export interface LayoutTypeProvider {
    readonly getElementTypes?: (element: Element) => readonly ElementTypeIri[];
    readonly getLinkType?: (link: Link) => LinkTypeIri;
}

/**
 * @category Geometry
 */
export interface CalculatedLayout {
    positions: Map<string, Vector>;
    sizes: Map<string, Size>;
    nestedLayouts: CalculatedLayout[];
}

/**
 * @category Geometry
 */
export async function calculateLayout(params: {
    layoutFunction: LayoutFunction;
    model: DiagramModel;
    sizeProvider: SizeProvider;
    typeProvider?: LayoutTypeProvider;
    fixedElements?: ReadonlySet<Element>;
    selectedElements?: ReadonlySet<Element>;
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

    const nodes: { [id: string]: LayoutNode } = Object.create(null);
    const bounds: { [id: string]: Rect } = Object.create(null);

    for (const element of elements) {
        nodes[element.id] = {
            types: typeProvider?.getElementTypes?.(element) ?? [],
            fixed: fixedElements?.has(element),
        };
        bounds[element.id] = boundsOf(element, sizeProvider);
    }

    const links: LayoutLink[] = [];

    for (const link of model.links) {
        if (Object.hasOwn(nodes, link.sourceId) && Object.hasOwn(nodes, link.targetId)) {
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
 * @category Geometry
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
}

/**
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

/**
 * @category Geometry
 */
export function calculateAveragePosition(
    elements: ReadonlyArray<Element>,
    sizeProvider: SizeProvider
): Vector {
    let xSum = 0;
    let ySum = 0;
    for (const element of elements) {
        const {x, y, width, height} = boundsOf(element, sizeProvider);
        xSum += x + width / 2;
        ySum += y + height / 2;
    }
    return {
        x: xSum / elements.length,
        y: ySum / elements.length,
    };
}

/**
 * @category Geometry
 */
export function placeElementsAround(params: {
    elements: ReadonlyArray<Element>;
    targetElement: Element;
    model: DiagramModel;
    sizeProvider: SizeProvider;
    /** @default 300 */
    preferredLinksLength?: number;
    startAngle?: number;
}): void {
    const {
        elements, model, sizeProvider, targetElement,
        preferredLinksLength = 300,
    } = params;
    const capturedGeometry = RestoreGeometry.capture(model);

    const targetElementBounds = boundsOf(targetElement, sizeProvider);
    const targetPosition: Vector = {
        x: targetElementBounds.x + targetElementBounds.width / 2,
        y: targetElementBounds.y + targetElementBounds.height / 2,
    };
    let outgoingAngle = 0;
    const targetLinks = model.getElementLinks(targetElement);
    if (targetLinks.length > 0) {
        const averageSourcePosition = calculateAveragePosition(
            targetLinks.map(link => {
                const linkSource = model.sourceOf(link)!;
                return linkSource !== targetElement ? linkSource : model.targetOf(link)!;
            }),
            sizeProvider
        );
        const vectorDiff: Vector = {
            x: targetPosition.x - averageSourcePosition.x,
            y: targetPosition.y - averageSourcePosition.y,
        };
        if (vectorDiff.x !== 0 || vectorDiff.y !== 0) {
            outgoingAngle = Math.atan2(vectorDiff.y, vectorDiff.x);
        }
    }

    const step = Math.min(Math.PI / elements.length, Math.PI / 6);
    const elementStack: Element[]  = [...elements];

    const placeElementFromStack = (curAngle: number, element: Element) => {
        if (element) {
            const {width, height} = boundsOf(element, sizeProvider);
            element.setPosition({
                x: targetPosition.x + preferredLinksLength * Math.cos(curAngle) - width / 2,
                y: targetPosition.y + preferredLinksLength * Math.sin(curAngle) - height / 2,
            });
        }
    };

    const isOddLength = elementStack.length % 2 === 0;
    if (isOddLength) {
        for (let angle = step / 2; elementStack.length > 0; angle += step) {
            placeElementFromStack(outgoingAngle - angle, elementStack.pop()!);
            placeElementFromStack(outgoingAngle + angle, elementStack.pop()!);
        }
    } else {
        placeElementFromStack(outgoingAngle, elementStack.pop()!);
        for (let angle = step; elementStack.length > 0; angle += step) {
            placeElementFromStack(outgoingAngle - angle, elementStack.pop()!);
            placeElementFromStack(outgoingAngle + angle, elementStack.pop()!);
        }
    }

    const restoreGeometry = capturedGeometry.filterOutUnchanged();
    if (restoreGeometry.hasChanges()) {
        model.history.registerToUndo(restoreGeometry);
    }
}
