import * as React from 'react';

import { HotkeyAst, type HotkeyString, parseHotkey, formatHotkey } from '../coreUtils/hotkey';

import { useCanvas } from './canvasApi';
import { type MutableRenderingState } from './renderingState';

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
