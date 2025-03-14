import * as React from 'react';

import { AnyListener, EventObserver } from '../coreUtils/events';
import { useObservedProperty } from '../coreUtils/hooks';

import { CanvasApi, useCanvas } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';
import { Element, ElementEvents } from '../diagram/elements';
import { boundsOf } from '../diagram/geometry';

import {
    SelectionActionRemove, SelectionActionExpand, SelectionActionAnchor,
    SelectionActionConnections, SelectionActionAddToFilter, SelectionActionGroup,
    SelectionActionEstablishLink,
} from './selectionAction';

/**
 * Props for {@link Halo} component.
 *
 * @see {@link Halo}
 */
export interface HaloProps {
    /**
     * Margin between the element and surrounding actions.
     *
     * @default 5
     */
    margin?: number;
    /**
     * {@link SelectionAction} items representing available actions on the selected element.
     *
     * **Default**:
     * ```jsx
     * <>
     *   <SelectionActionGroup dock='nw' dockColumn={1} />
     *   <SelectionActionRemove dock='ne' />
     *   <SelectionActionExpand dock='s' />
     *   <SelectionActionAnchor dock='w' />
     *   <SelectionActionConnections dock='e' />
     *   <SelectionActionAddToFilter dock='se' />
     *   <SelectionActionEstablishLink dock='sw' />
     * </>
     * ```
     */
    children?: React.ReactNode;
}

/**
 * Canvas widget component to display actions for the single selected diagram element.
 *
 * @category Components
 */
export function Halo(props: HaloProps) {
    const {model, canvas} = useCanvas();

    const selection = useObservedProperty(
        model.events,
        'changeSelection',
        () => model.selection
    );

    if (selection.length === 1) {
        const [target] = selection;
        if (target instanceof Element) {
            return (
                <HaloInner {...props}
                    target={target}
                    canvas={canvas}
                />
            );
        }
    }
    return null;
}

defineCanvasWidget(Halo, element => ({element, attachment: 'overElements'}));

interface HaloInnerProps extends HaloProps {
    readonly target: Element;
    readonly canvas: CanvasApi;
}

const CLASS_NAME = 'reactodia-halo';

class HaloInner extends React.Component<HaloInnerProps> {
    private targetListener = new EventObserver();

    constructor(props: HaloInnerProps) {
        super(props);
        this.state = {};
    }

    componentDidMount() {
        const {target} = this.props;
        this.listenToElement(target);
    }

    componentDidUpdate(prevProps: HaloInnerProps) {
        if (prevProps.target !== this.props.target) {
            this.listenToElement(this.props.target);
        }
    }

    componentWillUnmount() {
        this.listenToElement(undefined);
    }

    listenToElement(element: Element | undefined) {
        const {canvas} = this.props;
        this.targetListener.stopListening();
        if (element) {
            this.targetListener.listenAny(element.events, this.onElementEvent);
            this.targetListener.listen(canvas.renderingState.events, 'changeElementSize', e => {
                if (e.source === element) {
                    this.forceUpdate();
                }
            });
        }
    }

    private onElementEvent: AnyListener<ElementEvents> = data => {
        if (data.changePosition || data.changeExpanded) {
            this.forceUpdate();
        }
    };

    render() {
        const {
            target,
            canvas,
            margin = 5,
            children,
        } = this.props;

        const bbox = boundsOf(target, canvas.renderingState);
        const {x: x0, y: y0} = canvas.metrics.paperToScrollablePaneCoords(bbox.x, bbox.y);
        const {x: x1, y: y1} = canvas.metrics.paperToScrollablePaneCoords(
            bbox.x + bbox.width,
            bbox.y + bbox.height,
        );
        const style: React.CSSProperties = {
            left: x0 - margin,
            top: y0 - margin,
            width: ((x1 - x0) + margin * 2),
            height: ((y1 - y0) + margin * 2),
        };

        return (
            <div className={CLASS_NAME} style={style}>
                {children ?? <>
                    <SelectionActionGroup dock='nw' dockColumn={1} />
                    <SelectionActionRemove dock='ne' />
                    <SelectionActionExpand dock='s' />
                    <SelectionActionAnchor dock='w' />
                    <SelectionActionConnections dock='e' />
                    <SelectionActionAddToFilter dock='se' />
                    <SelectionActionEstablishLink dock='sw' />
                </>}
            </div>
        );
    }
}
