import * as cola from 'webcola';

import { RestoreGeometry } from './commands';
import { Element } from './elements';
import {
    Vector, Size, SizeProvider, boundsOf, computeGrouping, getContentFittingBox,
} from './geometry';
import { DiagramModel } from './model';

export interface LayoutNode {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    bounds?: any;
    fixed?: number;
    innerBounds?: any;
}

export interface LayoutLink {
    source: LayoutNode;
    target: LayoutNode;
}

export function colaForceLayout(params: {
    nodes: LayoutNode[];
    links: LayoutLink[];
    preferredLinkLength: number;
    avoidOverlaps?: boolean;
}) {
    const layout = new cola.Layout()
        .nodes(params.nodes)
        .links(params.links)
        .avoidOverlaps(params.avoidOverlaps!)
        .convergenceThreshold(1e-9)
        .jaccardLinkLengths(params.preferredLinkLength)
        .handleDisconnected(true);
    layout.start(30, 0, 10, undefined, false);
}

export function colaRemoveOverlaps(nodes: LayoutNode[]) {
    const nodeRectangles: cola.Rectangle[] = [];
    for (const node of nodes) {
        nodeRectangles.push(new cola.Rectangle(
            node.x, node.x + node.width,
            node.y, node.y + node.height));
    }

    cola.removeOverlaps(nodeRectangles);

    for (let i = 0; i < nodeRectangles.length; i++) {
        const node = nodes[i];
        const rectangle = nodeRectangles[i];
        node.x = rectangle.x;
        node.y = rectangle.y;
    }
}

export function translateToPositiveQuadrant(positions: Map<string, Vector>, offset: Vector) {
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

export function uniformGrid(params: {
    rows: number;
    cellSize: Vector;
}): (cellIndex: number) => LayoutNode {
    return cellIndex => {
        const row = Math.floor(cellIndex / params.rows);
        const column = cellIndex - row * params.rows;
        return {
            id: String(cellIndex),
            x: column * params.cellSize.x,
            y: row * params.cellSize.y,
            width: params.cellSize.x,
            height: params.cellSize.y,
        };
    };
}

export function layoutPaddedWith(
    nodes: LayoutNode[],
    padding: { x: number; y: number } | undefined,
    transform: () => void,
) {
    if (padding) {
        for (const node of nodes) {
            node.x -= padding.x;
            node.y -= padding.y;
            node.width += 2 * padding.x;
            node.height += 2 * padding.y;
        }
    }

    transform();

    if (padding) {
        for (const node of nodes) {
            node.x += padding.x;
            node.y += padding.y;
            node.width -= 2 * padding.x;
            node.height -= 2 * padding.y;
        }
    }
}

export function layoutBiasFreePaddedWith(
    nodes: LayoutNode[],
    padding: { x: number; y: number } | undefined,
    transform: () => void,
) {
    const nodeSizeMap = new Map<string, Size>();
    const possibleCompression = {x: Infinity, y: Infinity};
    for (const node of nodes) {
        nodeSizeMap.set(node.id, {width: node.width, height: node.height});
        const maxSide = Math.max(node.width, node.height);

        const compressionX = node.width ? (maxSide / node.width) : 1;
        const compressionY = node.height ? (maxSide / node.height) : 1;
        possibleCompression.x = Math.min(1 + (compressionX - 1), possibleCompression.x);
        possibleCompression.y = Math.min(1 + (compressionY - 1), possibleCompression.y);

        node.height = maxSide;
        node.width = maxSide;
    }
    layoutPaddedWith(nodes, padding, () => transform());

    const fittingBox = getContentFittingBoxForLayout(nodes);
    for (const node of nodes) {
        const size = nodeSizeMap.get(node.id)!;
        node.x = (node.x - fittingBox.x) / possibleCompression.x + fittingBox.x;
        node.y = (node.y - fittingBox.y) / possibleCompression.y + fittingBox.y;
        node.height = size.height;
        node.width = size.width;
    }
}

export interface CalculatedLayout {
    group?: string;
    positions: Map<string, Vector>;
    sizes: Map<string, Size>;
    nestedLayouts: CalculatedLayout[];
}

export type LayoutFunction = (nodes: LayoutNode[], links: LayoutLink[]) => void;

export async function calculateLayout(params: {
    layoutFunction: LayoutFunction;
    model: DiagramModel;
    sizeProvider: SizeProvider;
    fixedElements?: ReadonlySet<Element>;
    group?: string;
    selectedElements?: ReadonlySet<Element>;
    signal?: AbortSignal;
}): Promise<CalculatedLayout> {
    const grouping = computeGrouping(params.model.elements);
    const {layoutFunction, model, sizeProvider, fixedElements, selectedElements} = params;

    if (selectedElements && selectedElements.size <= 1) {
        return {
            positions: new Map(),
            sizes: new Map(),
            nestedLayouts: [],
        };
    }
    return internalRecursion(params.group);

    function internalRecursion(group: string | undefined): CalculatedLayout {
        const elementsToProcess = group
            ? grouping.get(group)!
            : model.elements.filter(el => el.group === undefined);
        const elements = selectedElements
            ? elementsToProcess.filter(el => selectedElements.has(el))
            : elementsToProcess;

        const nestedLayouts: CalculatedLayout[] = [];
        for (const element of elements) {
            if (grouping.has(element.id)) {
                nestedLayouts.push(internalRecursion(element.id));
            }
        }

        const nodes: LayoutNode[] = [];
        const nodeById: { [id: string]: LayoutNode } = {};
        for (const element of elements) {
            const {x, y, width, height} = boundsOf(element, sizeProvider);
            const node: LayoutNode = {
                id: element.id,
                x, y, width, height,
                fixed: fixedElements && fixedElements.has(element) ? 1 : 0,
            };
            nodeById[element.id] = node;
            nodes.push(node);
        }

        const links: LayoutLink[] = [];
        for (const link of model.links) {
            const source = model.sourceOf(link)!;
            const target = model.targetOf(link)!;
            const sourceNode = nodeById[source.id];
            const targetNode = nodeById[target.id];
            if (sourceNode && targetNode) {
                links.push({source: sourceNode, target: targetNode});
            }
        }
        layoutFunction(nodes, links);

        const positions = new Map<string, Vector>();
        const sizes = new Map<string, Size>();
        for (const node of nodes) {
            positions.set(node.id, {x: node.x, y: node.y});
            sizes.set(node.id, {width: node.width, height: node.height});
        }

        return {
            positions,
            sizes,
            group,
            nestedLayouts,
        };
    }
}

export function applyLayout(
    layout: CalculatedLayout,
    model: DiagramModel
): void {
    const {positions, sizes, group, nestedLayouts} = layout;
    const sizeProvider = new StaticSizeProvider(sizes);

    const elements = model.elements.filter(({id}) => positions.has(id));
    for (const nestedLayout of nestedLayouts) {
        applyLayout(nestedLayout, model);
    }

    if (group) {
        const offset: Vector = getContentFittingBox(elements, [], sizeProvider);
        translateToPositiveQuadrant(positions, offset);
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

export function placeElementsAround(params: {
    elements: ReadonlyArray<Element>;
    model: DiagramModel;
    sizeProvider: SizeProvider;
    preferredLinksLength: number;
    targetElement: Element;
    startAngle?: number;
}): void {
    const {elements, model, sizeProvider, targetElement, preferredLinksLength} = params;
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

export const layoutForcePadded: LayoutFunction = (nodes, links) => {
    colaForceLayout({nodes, links, preferredLinkLength: 200});
    layoutBiasFreePaddedWith(nodes, {x: 50, y: 50}, () => colaRemoveOverlaps(nodes));
};

export function getContentFittingBoxForLayout(
    nodes: ReadonlyArray<LayoutNode>
): { x: number; y: number; width: number; height: number } {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const node of nodes) {
        const {x, y, width, height} = node;
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
