import * as React from 'react';

import { useObservedProperty } from '../coreUtils/hooks';

import { useCanvas } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';

const CLASS_NAME = 'reactodia-placeholder';

export function Placeholder(props: {
    children: React.ReactNode;
}) {
    const {children} = props;
    const {model} = useCanvas();
    const isEmpty = useObservedProperty(model.events, 'changeCells', () => model.elements.length === 0);
    if (!isEmpty) {
        return null;
    }
    return (
        <div className={CLASS_NAME}>
            {children}
        </div>
    );
}

defineCanvasWidget(Placeholder, element => ({element, attachment: 'viewport'}));
