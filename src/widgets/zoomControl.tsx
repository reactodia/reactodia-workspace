import * as React from 'react';
import classnames from 'classnames';

import { useObservedProperty } from '../coreUtils/hooks';

import { useCanvas } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';

import { DockDirection, ViewportDock } from './utility/viewportDock';

/**
 * Props for {@link ZoomControl} component.
 *
 * @see {@link ZoomControl}
 */
export interface ZoomControlProps {
    /**
     * Dock direction on the canvas viewport.
     */
    dock: DockDirection;
    /**
     * Horizontal offset from the dock direction.
     *
     * @default 0
     */
    dockOffsetX?: number;
    /**
     * Vertical offset from the dock direction.
     *
     * @default 0
     */
    dockOffsetY?: number;
    /**
     * Whether to display canvas pointer mode toggle.
     *
     * In `panning` mode moving the pointer with pressed main button pans the canvas
     * area unless the Shift is held: in that case it selects the elements instead.
     *
     * In `selection` mode the actions are exchanged.
     *
     * @default false
     * @see {@link CanvasApi.pointerMode}
     */
    showPointerModeToggle?: boolean;
}

const CLASS_NAME = 'reactodia-zoom-control';

/**
 * Canvas widget component to display zoom controls (zoom-in, zoom-out, zoom-to-fit).
 *
 * @category Components
 */
export function ZoomControl(props: ZoomControlProps) {
    const {dock, dockOffsetX, dockOffsetY, showPointerModeToggle} = props;
    const {canvas} = useCanvas();
    const pointerMode = useObservedProperty(
        canvas.events, 'changePointerMode', () => canvas.pointerMode
    );
    return (
        <ViewportDock dock={dock}
            dockOffsetX={dockOffsetX}
            dockOffsetY={dockOffsetY}>
            <div className={CLASS_NAME}>
                <button type='button'
                    className={classnames(
                        `${CLASS_NAME}__zoom-in-button`,
                        'reactodia-btn reactodia-btn-default'
                    )}
                    title='Zoom In'
                    onClick={() => canvas.zoomIn()}>
                </button>
                <button type='button'
                    className={classnames(
                        `${CLASS_NAME}__zoom-out-button`,
                        'reactodia-btn reactodia-btn-default'
                    )}
                    title='Zoom Out'
                    onClick={() => canvas.zoomOut()}>
                </button>
                <button type='button'
                    className={classnames(
                        `${CLASS_NAME}__zoom-fit-button`,
                        'reactodia-btn reactodia-btn-default'
                    )}
                    title='Fit to Screen'
                    onClick={() => canvas.zoomToFit({animate: true})}>
                </button>
                {showPointerModeToggle ? (
                    <button type='button'
                        className={classnames(
                            `${CLASS_NAME}__selection-mode-button`,
                            'reactodia-btn reactodia-btn-default',
                            pointerMode === 'selection' ? 'active' : undefined
                        )}
                        title={
                            'Toggle selection mode:\n' +
                            'Drag pointer to select, Shift + Pointer to pan the canvas'
                        }
                        onClick={() => canvas.setPointerMode(
                            pointerMode === 'panning' ? 'selection' : 'panning'
                        )}>
                    </button>
                ) : null}
            </div>
        </ViewportDock>
    );
}

defineCanvasWidget(ZoomControl, element => ({element, attachment: 'viewport'}));
