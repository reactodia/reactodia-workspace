import * as React from 'react';

import type { CanvasWidgetDescription } from './canvasApi';

const GET_WIDGET_METADATA: unique symbol = Symbol('getWidgetMetadata');

interface WithMetadata {
    [GET_WIDGET_METADATA]?: (element: React.ReactElement) => CanvasWidgetDescription;
}

/**
 * Defines the React component to be a canvas widget. 
 *
 * A component cannot be rendered by canvas as widget unless explicitly
 * defined as such using this function.
 *
 * **Example**:
 * ```jsx
 * function MyWidget(props) {
 *    ...
 * }
 * 
 * defineCanvasWidget(MyWidget, element => ({
 *     element,
 *     attachment: 'viewport'
 * }));
 * ```
 *
 * @category Core
 */
export function defineCanvasWidget<P>(
    type: React.ComponentType<P>,
    metadataOf: (element: React.ReactElement<P>) => CanvasWidgetDescription
): void {
    const typeWithMetadata = type as WithMetadata;
    typeWithMetadata[GET_WIDGET_METADATA] = metadataOf;
}

export function extractCanvasWidget(
    element: React.ReactElement
): CanvasWidgetDescription | undefined {
    const typeWithMetadata = element.type as WithMetadata;
    const metadataOf = typeWithMetadata[GET_WIDGET_METADATA];
    if (metadataOf) {
        return metadataOf(element);
    }
    return undefined;
}
