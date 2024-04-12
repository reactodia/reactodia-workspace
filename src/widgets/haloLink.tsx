import * as React from 'react';

import { EventObserver } from '../coreUtils/events';
import { useEventStore, useSyncStore } from '../coreUtils/hooks';

import { CanvasApi, useCanvas } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';
import { Link } from '../diagram/elements';
import {
    Vector, boundsOf, computePolyline, computePolylineLength, getPointAlongPolyline,
    pathFromPolyline,
} from '../diagram/geometry';
import type { DiagramModel, GraphStructure } from '../diagram/model';
import { TransformedSvgCanvas } from '../diagram/paper';
import type { RenderingState } from '../diagram/renderingState';

import { useWorkspace } from '../workspace/workspaceContext';

import {
    LinkActionContext, LinkActionMoveEndpoint, LinkActionEdit, LinkActionDelete, LinkActionRename,
} from './linkAction';

export interface HaloLinkProps {
    /**
     * @default 0
     */
    highlightMargin?: number;
    /**
     * @default 20
     */
    buttonSize?: number;
    /**
     * @default 5
     */
    buttonMargin?: number;
    /**
     * `LinkAction` items representing available actions on the selected link.
     *
     * **Default**:
     * ```jsx
     * <>
     *   <LinkActionMoveEndpoint dockSide='target' />
     *   <LinkActionMoveEndpoint dockSide='source' />
     *   <LinkActionEdit dockSide='target' dockIndex={1} />
     *   <LinkActionDelete dockSide='target' dockIndex={2} />
     *   <LinkActionRename />
     * </>
     * ```
     */
    children?: React.ReactNode;
}

export function HaloLink(props: HaloLinkProps) {
    const {canvas, model} = useCanvas();

    const selectionStore = useEventStore(model.events, 'changeSelection');
    const selection = useSyncStore(selectionStore, () => model.selection);

    if (selection.length === 1) {
        const [target] = model.selection;
        if (target instanceof Link) {
            return (
                <HaloLinkInner {...props}
                    target={target}
                    model={model}
                    canvas={canvas}
                />
            );
        }
    }
    return null;
}

defineCanvasWidget(HaloLink, element => ({element, attachment: 'overElements'}));

interface HaloLinkInnerProps extends HaloLinkProps {
    target: Link;
    model: DiagramModel;
    canvas: CanvasApi;
}

interface State {
    readonly actionContext: HaloLinkActionContext | null;
}

interface HaloLinkActionContext extends LinkActionContext {
    readonly polyline: ReadonlyArray<Vector>;
}

const CLASS_NAME = 'reactodia-halo-link';
const DEFAULT_HIGHLIGHT_MARGIN = 0;
const DEFAULT_BUTTON_SIZE = 20;
const DEFAULT_BUTTON_MARGIN = 5;

class HaloLinkInner extends React.Component<HaloLinkInnerProps, State> {
    private targetListener = new EventObserver();

    constructor(props: HaloLinkInnerProps) {
        super(props);
        this.state = {
            actionContext: HaloLinkInner.makeActionContext(this.props),
        };
    }

    static makeActionContext(props: HaloLinkInnerProps): HaloLinkActionContext | null {
        const {
            target,
            model,
            canvas,
            buttonSize = DEFAULT_BUTTON_SIZE,
            buttonMargin = DEFAULT_BUTTON_MARGIN,
        } = props;

        const polyline = computeEffectiveLinkPolyline(target, model, canvas.renderingState);
        if (!polyline) {
            return null;
        }
        const polylineLength = computePolylineLength(polyline);

        const getPosition: LinkActionContext['getPosition'] = (side, index) => {
            const shift = (buttonSize + buttonMargin) * index;
            const point = getPointAlongPolyline(
                polyline,
                side === 'source' ? shift : (polylineLength - shift)
            );
            const {x, y} = canvas.metrics.paperToScrollablePaneCoords(point.x, point.y);
            return {
                top: y - buttonSize / 2,
                left: x - buttonSize / 2,
            };
        };

        const getAngleInDegrees: LinkActionContext['getAngleInDegrees'] = side => {
            const start = polyline[side === 'source' ? 1 : polyline.length - 1];
            const end = polyline[side === 'source' ? 0 : polyline.length - 2];
            const unit = Vector.normalize(Vector.subtract(end, start));
            return Math.atan2(unit.y, unit.x) * (180 / Math.PI);
        };

        return {
            link: target,
            polyline,
            buttonSize,
            getPosition,
            getAngleInDegrees,
        };
    }

    componentDidMount() {
        const {target} = this.props;
        this.listenToTarget(target);
    }

    componentDidUpdate(prevProps: HaloLinkInnerProps) {
        if (this.props.target !== prevProps.target) {
            this.listenToTarget(this.props.target);
        }

        if (!(
            this.props.target === prevProps.target &&
            this.props.buttonSize === prevProps.buttonSize &&
            this.props.buttonMargin === prevProps.buttonMargin
        )) {
            this.updateActionContext();
        }
    }

    componentWillUnmount() {
        this.listenToTarget(undefined);
    }

    private listenToTarget(link: Link | undefined) {
        const {model, canvas} = this.props;

        this.targetListener.stopListening();
        if (link) {
            const source = model.getElement(link.sourceId)!;
            const target = model.getElement(link.targetId)!;

            this.targetListener.listen(source.events, 'changePosition', this.updateActionContext);
            this.targetListener.listen(target.events, 'changePosition', this.updateActionContext);
            this.targetListener.listen(link.events, 'changeVertices', this.updateActionContext);
            this.targetListener.listen(canvas.renderingState.events, 'changeElementSize', e => {
                if (e.source === source || e.source === target) {
                    this.updateActionContext();
                }
            });
        }
    }

    private updateActionContext = () => {
        this.setState((state, props) => ({
            actionContext: HaloLinkInner.makeActionContext(props),
        }));
    };

    render() {
        const {
            canvas,
            highlightMargin = DEFAULT_HIGHLIGHT_MARGIN,
            buttonSize = DEFAULT_BUTTON_SIZE,
            buttonMargin = DEFAULT_BUTTON_MARGIN,
            children,
        } = this.props;
        const {actionContext} = this.state;

        if (!actionContext) {
            return null;
        }

        const style = {
            '--reactodia-link-button-size': `${buttonSize}px`,
            '--reactodia-link-button-margin': `${buttonMargin}px`,
        } as React.CSSProperties;

        return (
            <div className={`${CLASS_NAME}`} style={style}>
                <LinkHighlight actionContext={actionContext}
                    margin={highlightMargin}
                    canvas={canvas}
                />
                <LinkActionContext.Provider value={actionContext}>
                    {children ?? <>
                        <LinkActionMoveEndpoint dockSide='target' />
                        <LinkActionMoveEndpoint dockSide='source' />
                        <LinkActionEdit dockSide='target' dockIndex={1} />
                        <LinkActionDelete dockSide='target' dockIndex={2} />
                        <LinkActionRename />
                    </>}
                </LinkActionContext.Provider>
            </div>
        );
    }
}

function computeEffectiveLinkPolyline(
    link: Link,
    graph: GraphStructure,
    renderingState: RenderingState
): ReadonlyArray<Vector> | undefined {
    const sourceElement = graph.getElement(link.sourceId);
    const targetElement = graph.getElement(link.targetId);

    if (!(sourceElement && targetElement)) {
        return undefined;
    }

    const route = renderingState.getRouting(link.id);
    const verticesDefinedByUser = link.vertices || [];
    const vertices = route ? route.vertices : verticesDefinedByUser;

    return computePolyline(
        boundsOf(sourceElement, renderingState),
        boundsOf(targetElement, renderingState),
        vertices
    );
}

interface LinkHighlightProps {
    actionContext: HaloLinkActionContext;
    margin: number;
    canvas: CanvasApi;
}

function LinkHighlight(props: LinkHighlightProps) {
    const {actionContext: {link, polyline}, margin, canvas} = props;

    const labelBoundsStore = useEventStore(canvas.renderingState.events, 'changeLinkLabelBounds');
    const labelBounds = useSyncStore(
        labelBoundsStore,
        () => canvas.renderingState.getLinkLabelBounds(link)
    );

    if (!labelBounds) {
        return null;
    }

    const {x: x0, y: y0} = canvas.metrics.paperToScrollablePaneCoords(
        labelBounds.x,
        labelBounds.y
    );
    const {x: x1, y: y1} = canvas.metrics.paperToScrollablePaneCoords(
        labelBounds.x + labelBounds.width,
        labelBounds.y + labelBounds.height
    );
    const labelHighlightStyle: React.CSSProperties = {
        left: x0 - margin,
        top: y0 - margin,
        width: x1 - x0 + margin * 2,
        height: y1 - y0 + margin * 2,
    };

    const path = pathFromPolyline(polyline);

    return <>
        <div className={`${CLASS_NAME}__label-highlight`}
            style={labelHighlightStyle}
        />
        <TransformedSvgCanvas paperTransform={canvas.metrics.getTransform()}
            style={{overflow: 'visible', pointerEvents: 'none'}}>
            <path className={`${CLASS_NAME}__path-highlight`}
                d={path}
            />
        </TransformedSvgCanvas>
    </>;
}
