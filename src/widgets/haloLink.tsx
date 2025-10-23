import * as React from 'react';

import { EventObserver } from '../coreUtils/events';
import { useEventStore, useSyncStore } from '../coreUtils/hooks';

import { CanvasApi, useCanvas } from '../diagram/canvasApi';
import { Link } from '../diagram/elements';
import {
    Rect, Spline, Vector, computePolyline, computePolylineLength, getPointAlongPolyline,
} from '../diagram/geometry';
import type { DiagramModel, GraphStructure } from '../diagram/model';
import { SvgPaperLayer } from '../diagram/paper';
import { CanvasPlaceAt } from '../diagram/placeLayer';
import type { RenderingState } from '../diagram/renderingState';

import {
    LinkActionContext, LinkActionProvidedContext, LinkActionMoveEndpoint, LinkActionEdit,
    LinkActionDelete, LinkActionRename,
} from './linkAction';

/**
 * Props for {@link HaloLink} component.
 *
 * @see {@link HaloLink}
 */
export interface HaloLinkProps {
    /**
     * Margin for the highlight box under the selected link label.
     *
     * @default 0
     */
    highlightMargin?: number;
    /**
     * Size for each displayed link action button.
     *
     * @default 20
     */
    buttonSize?: number;
    /**
     * Margin between link action buttons based on
     * the {@link LinkActionStyleProps.dockIndex dockIndex} order.
     *
     * @default 5
     */
    buttonMargin?: number;
    /**
     * {@link LinkAction} items representing available actions on the selected link.
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

/**
 * Canvas widget component to display actions for the single selected diagram link.
 *
 * @category Components
 */
export function HaloLink(props: HaloLinkProps) {
    const {canvas, model} = useCanvas();

    const selectionStore = useEventStore(model.events, 'changeSelection');
    const singleTarget = useSyncStore(
        selectionStore,
        () => {
            const target = model.selection.length === 1 ? model.selection[0] : undefined;
            return target instanceof Link ? target : undefined;
        }
    );

    if (singleTarget) {
        return (
            <HaloLinkInner {...props}
                target={singleTarget}
                model={model}
                canvas={canvas}
            />
        );
    }
    return null;
}

interface HaloLinkInnerProps extends HaloLinkProps {
    target: Link;
    model: DiagramModel;
    canvas: CanvasApi;
}

interface State {
    readonly actionContext: HaloLinkActionContext | null;
}

interface HaloLinkActionContext extends LinkActionContext {
    readonly spline: Spline;
}

const CLASS_NAME = 'reactodia-halo-link';
const DEFAULT_HIGHLIGHT_MARGIN = 0;
const DEFAULT_BUTTON_SIZE = 20;
const DEFAULT_BUTTON_MARGIN = 5;

class HaloLinkInner extends React.Component<HaloLinkInnerProps, State> {
    private readonly listener = new EventObserver();
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

        const spline = computeLinkSpline(target, model, canvas.renderingState);
        if (!spline) {
            return null;
        }

        const polylineLength = computePolylineLength(spline.geometry.points);

        const getPosition: LinkActionContext['getPosition'] = (side, index) => {
            const shift = (buttonSize + buttonMargin) * index;
            const point = getPointAlongPolyline(
                spline.geometry.points,
                side === 'source' ? shift : (polylineLength - shift)
            );
            const {x, y} = canvas.metrics.paperToScrollablePaneCoords(point.x, point.y);
            return {
                top: y - buttonSize / 2,
                left: x - buttonSize / 2,
            };
        };

        const getAngleInDegrees: LinkActionContext['getAngleInDegrees'] = side => {
            const {points} = spline.geometry;
            const start = points[side === 'source' ? 1 : points.length - 1];
            const end = points[side === 'source' ? 0 : points.length - 2];
            const unit = Vector.normalize(Vector.subtract(end, start));
            return Math.atan2(unit.y, unit.x) * (180 / Math.PI);
        };

        return {
            link: target,
            spline,
            buttonSize,
            getPosition,
            getAngleInDegrees,
        };
    }

    componentDidMount() {
        const {canvas, target} = this.props;
        this.listener.listen(canvas.events, 'changeTransform', () => this.forceUpdate());
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
        this.listener.stopListening();
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
            <>    
                <LinkHighlight actionContext={actionContext}
                    style={style}
                    margin={highlightMargin}
                    canvas={canvas}
                />
                <CanvasPlaceAt layer='overElements'>
                    <div className={CLASS_NAME} style={style}>
                        <LinkActionProvidedContext.Provider value={actionContext}>
                            {children ?? <>
                                <LinkActionMoveEndpoint dockSide='target' />
                                <LinkActionMoveEndpoint dockSide='source' />
                                <LinkActionEdit dockSide='target' dockIndex={1} />
                                <LinkActionDelete dockSide='target' dockIndex={2} />
                                <LinkActionRename />
                            </>}
                        </LinkActionProvidedContext.Provider>
                    </div>
                </CanvasPlaceAt>
            </>
        );
    }
}

function computeLinkSpline(
    link: Link,
    graph: GraphStructure,
    renderingState: RenderingState
): Spline | undefined {
    const source = graph.getElement(link.sourceId);
    const target = graph.getElement(link.targetId);

    if (!(source && target)) {
        return undefined;
    }

    const template = renderingState.getLinkTemplates().get(link.typeId);

    const route = renderingState.getRouting(link.id);
    const verticesDefinedByUser = link.vertices || [];
    const vertices = route ? route.vertices : verticesDefinedByUser;

    const sourceShape = renderingState.getElementShape(source);
    const targetShape = renderingState.getElementShape(target);
    const points = computePolyline(sourceShape, targetShape, vertices);
    
    return Spline.create({
        type: template?.spline ?? Spline.defaultType,
        points,
        source: Rect.center(sourceShape.bounds),
        target: Rect.center(targetShape.bounds),
    });
}

interface LinkHighlightProps {
    actionContext: HaloLinkActionContext;
    style: React.CSSProperties;
    margin: number;
    canvas: CanvasApi;
}

function LinkHighlight(props: LinkHighlightProps) {
    const {actionContext: {link, spline}, style, margin, canvas} = props;

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

    return <>
        <CanvasPlaceAt layer='overLinkGeometry'>
            <SvgPaperLayer paperTransform={canvas.metrics.getTransform()}
                className={CLASS_NAME}
                style={{...style, overflow: 'visible', pointerEvents: 'none'}}>
                <path className={`${CLASS_NAME}__path-highlight`}
                    d={spline.toPath()}
                />
            </SvgPaperLayer>
        </CanvasPlaceAt>
        <CanvasPlaceAt layer='overLinks'>
            <div className={CLASS_NAME} style={style}>
                <div className={`${CLASS_NAME}__label-highlight`}
                    style={labelHighlightStyle}
                />
            </div>
        </CanvasPlaceAt>
    </>;
}
