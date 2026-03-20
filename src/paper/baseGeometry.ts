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

export function fitRectKeepingAspectRatio(
    source: Size,
    targetWidth: number | undefined,
    targetHeight: number | undefined,
): Size {
    if (!(typeof targetWidth === 'number' || typeof targetHeight === 'number')) {
        return {width: source.width, height: source.height};
    }
    const sourceAspectRatio = source.width / source.height;
    targetWidth = typeof targetWidth === 'number' ? targetWidth : targetHeight! * sourceAspectRatio;
    targetHeight = typeof targetHeight === 'number' ? targetHeight : targetWidth / sourceAspectRatio;
    if (targetHeight * sourceAspectRatio <= targetWidth) {
        return {width: targetHeight * sourceAspectRatio, height: targetHeight};
    } else {
        return {width: targetWidth, height: targetWidth / sourceAspectRatio};
    }
}
