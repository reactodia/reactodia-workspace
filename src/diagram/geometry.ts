import type { Element, Link } from './elements';

/**
 * Represents a floating-point 2D vector.
 *
 * @category Geometry
 */
export interface Vector {
    readonly x: number;
    readonly y: number;
}

/**
 * Utility functions to operate on 2D vectors.
 *
 * @category Geometry
 */
export namespace Vector {
    /**
     * Adds two vectors component-wise.
     */
    export function add(a: Vector, b: Vector): Vector {
        return {
            x: a.x + b.x,
            y: a.y + b.y,
        };
    }
    /**
     * Subtracts two vectors component-wise.
     */
    export function subtract(a: Vector, b: Vector): Vector {
        return {
            x: a.x - b.x,
            y: a.y - b.y,
        };
    }
    /**
     * Multiplies each vector component by a scalar number.
     */
    export function scale(v: Vector, factor: number): Vector {
        return {x: v.x * factor, y: v.y * factor};
    }
    /**
     * Returns `true` if two vectors are the same, otherwise `false`.
     */
    export function equals(a: Vector, b: Vector): boolean {
        return a.x === b.x && a.y === b.y;
    }
    /**
     * Computes the length of a vector (L2 norm).
     */
    export function length({x, y}: Vector): number {
        return Math.sqrt(x * x + y * y);
    }
    /**
     * Normalizes the vector by dividing by its length to get a unit vector
     * with the same direction as the original one.
     */
    export function normalize({x, y}: Vector): Vector {
        if (x === 0 && y === 0) { return {x, y}; }
        const inverseLength = 1 / Math.sqrt(x * x + y * y);
        return {x: x * inverseLength, y: y * inverseLength};
    }
    /**
     * Computes dot-product of two vectors.
     */
    export function dot({x: x1, y: y1}: Vector, {x: x2, y: y2}: Vector): number {
        return x1 * x2 + y1 * y2;
    }
    /**
     * Computes 2D cross-product of two vectors.
     */
    export function cross2D({x: x1, y: y1}: Vector, {x: x2, y: y2}: Vector): number {
        return x1 * y2 - y1 * x2;
    }
}

/**
 * Represents a 2D rectangular size.
 *
 * @category Geometry
 */
export interface Size {
    readonly width: number;
    readonly height: number;
}

/**
 * Represents a 2D axis-aligned rectangle.
 *
 * @category Geometry
 */
export interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

/**
 * Utility functions to operate on 2D axis-aligned rectangles.
 *
 * @category Geometry
 */
export namespace Rect {
    /**
     * Returns `true` if two rectangles are the same, otherwise `false`.
     */
    export function equals(a: Rect, b: Rect): boolean {
        return (
            a.x === b.x &&
            a.y === b.y &&
            a.width === b.width &&
            a.height === b.height
        );
    }
    /**
     * Computes the center point of a rectangle.
     */
    export function center({x, y, width, height}: Rect): Vector {
        return {x: x + width / 2, y: y + height / 2};
    }
    /**
     * Returns `true` if two rectangles intersects each other, otherwise `false`.
     *
     * Rectangles sharing an edge are considered as intersecting as well.
     */
    export function intersects(a: Rect, b: Rect): boolean {
        return (
            a.x <= (b.x + b.width) &&
            a.y <= (b.y + b.height) &&
            b.x <= (a.x + a.width) &&
            b.y <= (a.y + a.height)
        );
    }
}

/**
 * Provides sizes for the diagram content items.
 *
 * @category Geometry
 */
export interface SizeProvider {
    /**
     * Gets current size for the specified element.
     */
    getElementSize(element: Element): Size | undefined;
}

/**
 * Computes bounding rectangle from an element's position and size.
 *
 * @category Geometry
 */
export function boundsOf(element: Element, sizeProvider: SizeProvider): Rect {
    const {x, y} = element.position;
    const size = sizeProvider.getElementSize(element);
    return {
        x, y,
        width: size ? size.width : 0,
        height: size ? size.height : 0,
    };
}

/**
 * Describes a basic 2D shape with a specific bounds (position and size).
 */
export interface ShapeGeometry {
    /**
     * Basic 2D shape type.
     */
    readonly type: 'rect' | 'ellipse';
    /**
     * Shape bounds (position and size).
     */
    readonly bounds: Rect;
}

function intersectRayFromShape(geometry: ShapeGeometry, target: Vector): Vector | undefined {
    switch (geometry.type) {
        case 'ellipse': {
            return intersectRayFromEllipse(geometry.bounds, target);
        }
        case 'rect':
        default: {
            return intersectRayFromRect(geometry.bounds, target);
        }
    }
}

function intersectRayFromRect(rect: Rect, target: Vector) {
    if (
        rect.width === 0 || rect.height === 0 ||
        target.x > rect.x && target.x < (rect.x + rect.width) &&
        target.y > rect.y && target.y < (rect.y + rect.height)
    ) {
        return undefined;
    }

    const halfWidth = rect.width / 2;
    const halfHeight = rect.height / 2;
    const center: Vector = {
        x: rect.x + halfWidth,
        y: rect.y + halfHeight,
    };

    const direction = Vector.normalize({
        x: target.x - center.x,
        y: target.y - center.y,
    });

    const rightDirection = {x: Math.abs(direction.x), y: direction.y};
    const isHorizontal =
        Vector.cross2D({x: halfWidth, y: -halfHeight}, rightDirection) > 0 &&
        Vector.cross2D({x: halfWidth, y: halfHeight}, rightDirection) < 0;

    if (isHorizontal) {
        return {
            x: center.x + halfWidth * Math.sign(direction.x),
            y: center.y + halfWidth * direction.y / Math.abs(direction.x),
        };
    } else {
        return {
            x: center.x + halfHeight * direction.x / Math.abs(direction.y),
            y: center.y + halfHeight * Math.sign(direction.y),
        };
    }
}

function intersectRayFromEllipse(bounds: Rect, target: Vector): Vector | undefined {
    const center = Rect.center(bounds);
    const pointer = Vector.subtract(target, center);
    const normal = Vector.normalize(pointer);
    const intersection: Vector = {
        x: normal.x * bounds.width * 0.5,
        y: normal.y * bounds.height * 0.5,
    };
    return Vector.length(pointer) >= Vector.length(intersection)
        ? Vector.add(center, intersection) : undefined;
}

/**
 * Returns `true` is two line geometries (vertex sequences) are the same,
 * otherwise `false`.
 *
 * @category Geometry
 */
export function isPolylineEqual(left: ReadonlyArray<Vector>, right: ReadonlyArray<Vector>) {
    if (left === right) { return true; }
    if (left.length !== right.length) { return false; }
    for (let i = 0; i < left.length; i++) {
        const a = left[i];
        const b = right[i];
        if (!(a.x === b.x && a.y === b.y)) {
            return false;
        }
    }
    return true;
}

/**
 * Computes line geometry between two shapes clipped at each
 * ones border with intermediate points in-between.
 *
 * It is assumed that the line starts at source shape center,
 * ends at target shape center and goes through each vertex in the array.
 *
 * @category Geometry
 */
export function computePolyline(
    source: ShapeGeometry | Rect,
    target: ShapeGeometry | Rect,
    vertices: ReadonlyArray<Vector>
): Vector[] {
    const sourceShape: ShapeGeometry = 'type' in source ? source : {type: 'rect', bounds: source};
    const targetShape: ShapeGeometry = 'type' in target ? target : {type: 'rect', bounds: target};

    let start: Vector | undefined;
    for (let i = 0; i < vertices.length; i++) {
        start = intersectRayFromShape(sourceShape, vertices[i]);
        if (start) {
            break;
        }
    }
    if (!start) {
        start = intersectRayFromShape(sourceShape, Rect.center(targetShape.bounds))
            ?? Rect.center(sourceShape.bounds);
    }

    let end: Vector | undefined;
    for (let i = vertices.length - 1; i >= 0; i--) {
        end = intersectRayFromShape(targetShape, vertices[i]);
        if (end) {
            break;
        }
    }
    if (!end) {
        end = intersectRayFromShape(targetShape, Rect.center(sourceShape.bounds))
            ?? Rect.center(targetShape.bounds);
    }

    return [start, ...vertices, end];
}

/**
 * Computes length of linear line geometry.
 *
 * @category Geometry
 * @see {@link getPointAlongPolyline}
 */
export function computePolylineLength(polyline: ReadonlyArray<Vector>): number {
    let previous: Vector;
    return polyline.reduce((acc, point) => {
        const segmentLength = previous ? Vector.length({x: point.x - previous.x, y: point.y - previous.y}) : 0;
        previous = point;
        return acc + segmentLength;
    }, 0);
}

/**
 * Computes position at the specified `offset` along a linear line geometry
 * relative to the start of the line.
 *
 * If `offset` value is less than 0 or greater than line geometry length,
 * the the first or last point of the line will be returned correspondingly.
 *
 * @category Geometry
 * @see {@link computePolylineLength}
 */
export function getPointAlongPolyline(polyline: ReadonlyArray<Vector>, offset: number): Vector {
    if (polyline.length === 0) {
        throw new Error('Cannot compute a point for an empty polyline');
    }
    if (offset < 0) {
        return polyline[0];
    }
    let currentOffset = 0;
    for (let i = 1; i < polyline.length; i++) {
        const previous = polyline[i - 1];
        const point = polyline[i];
        const segment = {x: point.x - previous.x, y: point.y - previous.y};
        const segmentLength = Vector.length(segment);
        const newOffset = currentOffset + segmentLength;
        if (offset < newOffset) {
            const leftover = (offset - currentOffset) / segmentLength;
            return {
                x: previous.x + leftover * segment.x,
                y: previous.y + leftover * segment.y,
            };
        } else {
            currentOffset = newOffset;
        }
    }
    return polyline[polyline.length - 1];
}

/**
 * Searches for a closest segment of a linear line geometry.
 *
 * @returns index of start point for the closes line segment, or 0 if line is empty.
 * @category Geometry
 * @see {@link getPointAlongPolyline}
 */
export function findNearestSegmentIndex(polyline: ReadonlyArray<Vector>, location: Vector): number {
    let minDistance = Infinity;
    let foundIndex = 0;

    for (let i = 0; i < polyline.length - 1; i++) {
        const pivot = polyline[i];
        const next = polyline[i + 1];

        const target = {x: location.x - pivot.x, y: location.y - pivot.y};
        const segment = {x: next.x - pivot.x, y: next.y - pivot.y};
        const segmentLength = Vector.length(segment);

        const projectionToSegment = Vector.dot(target, segment) / segmentLength;
        if (projectionToSegment < 0 || projectionToSegment > segmentLength) {
            continue;
        }

        const distanceToSegment = Math.abs(Vector.cross2D(target, segment)) / segmentLength;
        if (distanceToSegment < minDistance) {
            minDistance = distanceToSegment;
            foundIndex = i;
        }
    }
    return foundIndex;
}

export interface SplineGeometry {
    readonly type: 'straight' | 'smooth';
    readonly points: ReadonlyArray<Vector>;
    readonly source: Vector;
    readonly target: Vector;
}

export class Spline {
    private constructor(readonly geometry: SplineGeometry) {
        if (geometry.points.length < 2) {
            throw new Error('Spline must consists of at least two points');
        }
    }

    static create(geometry: SplineGeometry) {
        return new Spline(geometry);
    }

    toPath(): string {
        const {type, points, source, target} = this.geometry;

        if (type === 'smooth' && points.length >= 3) {
            const smoothness = 0.25;
            const parts = [`M${points[0].x} ${points[0].y}`];
            let previousTangent = Vector.normalize(Vector.subtract(source, points[0]));
            for (let i = 1; i < points.length; i++) {
                const previous = points[i - 1];
                const p = points[i];
                const next = points[i + 1];
                const tangent = next
                    ? Vector.normalize(Vector.subtract(previous, next))
                    : Vector.normalize(Vector.subtract(p, target));
                const length = Vector.length(Vector.subtract(previous, p));
                const c0 = Vector.subtract(previous, Vector.scale(previousTangent, length * smoothness));
                const c1 = Vector.add(p, Vector.scale(tangent, length * smoothness));
                previousTangent = tangent;
                parts.push(` C${c0.x} ${c0.y} ${c1.x} ${c1.y} ${p.x} ${p.y}`);
            }
            return parts.join('');
        }
    
        return pathFromPolyline(points);
    }
}

/**
 * Converts linear line geometry into an SVG path.
 *
 * @category Geometry
 */
export function pathFromPolyline(
    polyline: ReadonlyArray<Vector>
): string {
    return 'M' + polyline.map(({x, y}) => `${x} ${y}`).join(' L');
}

/**
 * Returns the first element from specified `elements` which bounding box
 * includes the specified `point`.
 *
 * If the specified `point` is at the edge of a bounding box, it is considered
 * to be part of it.
 *
 * @param elements an array of diagram elements to search
 * @param point point on a diagram in paper coordinates
 * @param sizeProvider element size provider to compute bounding boxes
 * @category Geometry
 */
export function findElementAtPoint(
    elements: ReadonlyArray<Element>,
    point: Vector,
    sizeProvider: SizeProvider
): Element | undefined {
    for (let i = elements.length - 1; i >= 0; i--) {
        const element = elements[i];
        const {x, y, width, height} = boundsOf(element, sizeProvider);

        if (width === 0 && height === 0) {
            // Skip void and other zero-sized elements
            continue;
        }

        if (point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height) {
            return element;
        }
    }
    return undefined;
}

/**
 * Computes complete bounding box for the specified `elements` and `links`.
 *
 * @category Geometry
 */
export function getContentFittingBox(
    elements: Iterable<Element>,
    links: Iterable<Link>,
    sizeProvider: SizeProvider
): Rect {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const element of elements) {
        const {x, y} = element.position;
        const size = sizeProvider.getElementSize(element);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + (size ? size.width : 0));
        maxY = Math.max(maxY, y + (size ? size.height : 0));
    }

    for (const link of links) {
        const vertices = link.vertices || [];
        for (const {x, y} of vertices) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }

    return {
        x: Number.isFinite(minX) ? minX : 0,
        y: Number.isFinite(minY) ? minY : 0,
        width: Number.isFinite(minX) && Number.isFinite(maxX) ? (maxX - minX) : 0,
        height: Number.isFinite(minY) && Number.isFinite(maxY) ? (maxY - minY) : 0,
    };
}

/**
 * Computes average center position of element bounding boxes.
 *
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
