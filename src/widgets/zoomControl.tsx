import * as React from 'react';
import classnames from 'classnames';

import { useCanvas } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';

import { DockDirection, ViewportDock } from './utility/viewportDock';

/**
 * Props for `ZoomControl` component.
 *
 * @see ZoomControl
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
}

const CLASS_NAME = 'reactodia-zoom-control';

/**
 * Canvas widget component to display zoom controls (zoom-in, zoom-out, zoom-to-fit).
 *
 * @category Components
 */
export function ZoomControl(props: ZoomControlProps) {
    const {dock, dockOffsetX, dockOffsetY} = props;
    const {canvas} = useCanvas();
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
            </div>
        </ViewportDock>
    );
}

defineCanvasWidget(ZoomControl, element => ({element, attachment: 'viewport'}));
