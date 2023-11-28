import * as React from 'react';

import { AnyListener, EventObserver, EventTrigger } from '../coreUtils/events';
import { useObservedProperty } from '../coreUtils/hooks';

import { CanvasContext, CanvasApi } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';
import { Element, ElementEvents } from '../diagram/elements';
import { boundsOf } from '../diagram/geometry';

import { WorkspaceContext } from '../workspace/workspaceContext';

import type { ConnectionsMenuCommands } from './connectionsMenu';
import type { InstancesSearchCommands } from './instancesSearch';
import {
    SelectionActionRemove, SelectionActionExpand, SelectionActionAnchor,
    SelectionActionConnections, SelectionActionAddToFilter, SelectionActionEstablishLink,
} from './selectionAction';

export interface HaloProps {
    /**
     * @default 5
     */
    margin?: number;
    connectionsMenuCommands?: EventTrigger<ConnectionsMenuCommands>;
    instancesSearchCommands?: EventTrigger<InstancesSearchCommands>;
    /**
     * `SelectionAction` items representing available actions on the selected element.
     *
     * **Default**:
     * ```jsx
     * <>
     *   <SelectionActionRemove dock='ne' />
     *   <SelectionActionExpand dock='s' />
     *   <SelectionActionAnchor dock='w' />
     *   <SelectionActionConnections dock='e'
     *       commands={connectionsMenuCommands}
     *   />
     *   <SelectionActionAddToFilter dock='se'
     *       commands={instancesSearchCommands}
     *   />
     *   <SelectionActionEstablishLink dock='sw' />
     * </>
     * ```
     */
    children?: React.ReactNode;
}

export function Halo(props: HaloProps) {
    const {canvas} = React.useContext(CanvasContext)!;
    const workspace = React.useContext(WorkspaceContext)!;
    const {editor} = workspace;

    const selection = useObservedProperty(
        editor.events,
        'changeSelection',
        () => editor.selection
    );

    if (selection.length === 1) {
        const [target] = selection;
        if (target instanceof Element) {
            return (
                <HaloInner {...props}
                    target={target}
                    canvas={canvas}
                    workspace={workspace}
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
    readonly workspace: WorkspaceContext;
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
            connectionsMenuCommands,
            instancesSearchCommands,
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
                    <SelectionActionRemove dock='ne' />
                    <SelectionActionExpand dock='s' />
                    <SelectionActionAnchor dock='w' />
                    <SelectionActionConnections dock='e'
                        commands={connectionsMenuCommands}
                    />
                    <SelectionActionAddToFilter dock='se'
                        commands={instancesSearchCommands}
                    />
                    <SelectionActionEstablishLink dock='sw' />
                </>}
            </div>
        );
    }
}
