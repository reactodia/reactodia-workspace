import * as React from 'react';
import classnames from 'classnames';

import { CanvasContext } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';

export interface ZoomControlProps {}

const CLASS_NAME = 'reactodia-zoom-control';

export function ZoomControl(props: ZoomControlProps) {
    const {canvas} = React.useContext(CanvasContext)!;
    return (
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
    );
}

defineCanvasWidget(ZoomControl, element => ({element, attachment: 'viewport'}));
