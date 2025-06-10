import * as React from 'react';

import { HotkeyAst, type HotkeyString, parseHotkey, formatHotkey } from '../coreUtils/hotkey';

import { type CanvasWidgetDescription, useCanvas } from './canvasApi';
import { type MutableRenderingState } from './renderingState';

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
    typeWithMetadata[GET_WIDGET_METADATA] = metadataOf as WithMetadata[typeof GET_WIDGET_METADATA];
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

/**
 * Represents a registered canvas hotkey.
 *
 * @see {@link useCanvasHotkey}
 */
export interface CanvasHotkey {
    /**
     * Hotkey displayed as human-readable sequence
     */
    readonly text: string;
}

/**
 * Registers an active hotkey while the caller component is mounted on the canvas.
 *
 * If either `hotkey` or `action` is `undefined` or `null`, the hotkey will be inactive.
 *
 * @category Hooks
 */
export function useCanvasHotkey(
    hotkey: HotkeyString | undefined | null,
    action: (() => void) | undefined
): CanvasHotkey | undefined {
    const {canvas} = useCanvas();

    interface CanvasHotkeyWithAst extends CanvasHotkey {
        _ast: HotkeyAst;
    }

    const actionKey = React.useMemo((): CanvasHotkeyWithAst | undefined => {
        if (hotkey) {
            const ast = parseHotkey(hotkey);
            return {_ast: ast, text: formatHotkey(ast)};
        }
        return undefined;
    }, [hotkey]);
    const lastAction = React.useRef<typeof action>();
    lastAction.current = action;

    React.useEffect(() => {
        if (actionKey) {
            const renderingState = canvas.renderingState as MutableRenderingState;
            return renderingState.listenHotkey(actionKey._ast, () => {
                lastAction.current?.();
            });
        }
    }, [actionKey]);

    return actionKey;
}
