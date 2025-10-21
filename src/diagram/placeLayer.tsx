import * as React from 'react';
import { createPortal } from 'react-dom';

export interface CanvasPlaceLayerContext {
    readonly containers: Record<CanvasPlaceAtLayer, HTMLElement>;
}

type NestedPlaceLayerContext = 'nested';

export const CanvasPlaceLayerContext =
    React.createContext<CanvasPlaceLayerContext | NestedPlaceLayerContext | null>(null);

export function createPlaceLayerContext(): CanvasPlaceLayerContext {
    const containers: Record<CanvasPlaceAtLayer, HTMLElement> = {
        underlay: document.createElement('div'),
        overLinkGeometry: document.createElement('div'),
        overLinks: document.createElement('div'),
        overElements: document.createElement('div'),
    };

    for (const container of Object.values(containers)) {
        container.style.display = 'contents';
    }

    return {containers};
}

export interface CanvasPlaceLayerProps extends React.HTMLProps<HTMLDivElement> {
    context: CanvasPlaceLayerContext;
    layer: CanvasPlaceAtLayer;
}

export function CanvasPlaceLayer(props: CanvasPlaceLayerProps) {
    const {context, layer, ...otherProps} = props;
    const outerRef = React.useRef<HTMLDivElement>(null);

    const container = context.containers[layer];
    React.useLayoutEffect(() => {
        const outer = outerRef.current;
        if (outer) {
            outer.appendChild(container);
            return () => {
                outer.removeChild(container);
            };
        }
    }, [outerRef, container]);

    return <div {...otherProps} ref={outerRef} data-reactodia-place-layer={layer} />;
}

/**
 * Canvas layer to render widget components at, from the bottom to the top:
 *   - `underlay` - placed under any diagram content;
 *   - `overLinkGeometry` - placed over graph link geometry (paths) but under its labels;
 *   - `overLinks` - placed over graph links (including its geometry and labels);
 *   - `overElements` - placed over both graph elements and links.
 *
 * All layers stated above use paper coordinates, scales and scrolls with the diagram.
 */
export type CanvasPlaceAtLayer = 'underlay' | 'overLinkGeometry' | 'overLinks' | 'overElements';

/**
 * Places child components on a specified canvas layer as canvas widgets.
 *
 * @category Components
 */
export function CanvasPlaceAt(props: {
    layer: CanvasPlaceAtLayer;
    children: React.ReactNode;
}) {
    const {layer, children} = props;

    const placeContext = React.useContext(CanvasPlaceLayerContext);
    if (!placeContext) {
        throw new Error('Reactodia: <CanvasPlaceAt> should be rendered only inside <Canvas>');
    } else if (placeContext === 'nested') {
        throw new Error('Reactodia: <CanvasPlaceAt> cannot be nested into another <CanvasPlaceAt>');
    }

    const withContext = React.useMemo(
        () => (
            <CanvasPlaceLayerContext.Provider value='nested'>
                {children}
            </CanvasPlaceLayerContext.Provider>
        ),
        [children]
    );

    const container = placeContext.containers[layer];
    return createPortal(withContext, container);
}
