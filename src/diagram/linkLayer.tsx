import cx from 'clsx';
import * as React from 'react';
import { createPortal } from 'react-dom';

import { EventObserver } from '../coreUtils/events';
import { Debouncer } from '../coreUtils/scheduler';

import { useCanvas } from './canvasApi';
import { restoreCapturedLinkGeometry } from './commands';
import { LinkMarkerStyle, RoutedLink } from './customization';
import { Element, Link, LinkVertex } from './elements';
import {
    Rect, Size, Spline, Vector, computePolyline, computePolylineLength,
    getPointAlongPolyline,
} from './geometry';
import { DiagramModel } from './model';
import { type PaperTransform, HtmlPaperLayer } from './paper';
import { MutableRenderingState, RenderingLayer } from './renderingState';

export interface LinkLayerProps {
    model: DiagramModel;
    renderingState: MutableRenderingState;
    shouldRenderLink?: (link: Link) => boolean;
}

enum UpdateRequest {
    /** Some part of layer requested an update */
    Partial = 1,
    /** Full update requested */
    All,
}

interface MeasurableLabel {
    readonly owner: Link;
    measureBounds(): Rect | undefined;
}

interface LinkLayerState {
    readonly version: number;
    readonly shouldUpdateLink: (link: Link) => boolean;
}

const CLASS_NAME = 'reactodia-link-layer';

export class LinkLayer extends React.Component<LinkLayerProps, LinkLayerState> {
    private readonly listener = new EventObserver();
    private readonly delayedUpdate = new Debouncer();

    private providedContext: LinkLayerContext;

    private updateState = UpdateRequest.Partial;
    /** List of link IDs to update at the next flush event */
    private scheduledToUpdate = new Set<string>();

    private labelMeasureRequests = new Set<MeasurableLabel>();
    private delayedMeasureLabels = new Debouncer();

    private readonly memoizedLinks = new WeakMap<Link, React.ReactElement>();

    constructor(props: LinkLayerProps) {
        super(props);
        this.providedContext = {
            scheduleLabelMeasure: this.scheduleLabelMeasure,
            clearLabelMeasure: this.clearLabelMeasure,
        };
        this.state = {
            version: 0,
            shouldUpdateLink: this.popShouldUpdatePredicate(),
        };
    }

    componentDidMount() {
        const {model, renderingState} = this.props;

        const scheduleUpdateElementLinks = (element: Element) => {
            for (const link of model.getElementLinks(element)) {
                this.scheduleUpdateLink(link.id);
            }
        };
        this.listener.listen(model.events, 'changeLanguage', this.scheduleUpdateAll);
        this.listener.listen(model.events, 'changeCells', e => {
            if (e.updateAll) {
                this.scheduleUpdateAll();
            } else {
                if (e.changedElement) {
                    scheduleUpdateElementLinks(e.changedElement);
                }
                if (e.changedLinks) {
                    for (const link of e.changedLinks) {
                        this.scheduleUpdateLink(link.id);
                    }
                }
            }
        });
        this.listener.listen(model.events, 'elementEvent', ({data}) => {
            if (data.changePosition) {
                scheduleUpdateElementLinks(data.changePosition.source);
            }
        });
        this.listener.listen(model.events, 'linkEvent', ({data}) => {
            const linkEvent = (
                data.changeVertices ||
                data.changeLinkState ||
                data.requestedRedraw
            );
            if (linkEvent) {
                this.scheduleUpdateLink(linkEvent.source.id);
            }
        });
        this.listener.listen(model.events, 'changeLinkVisibility', e => {
            for (const link of model.links.filter(link => link.typeId === e.source)) {
                this.scheduleUpdateLink(link.id);
            }
        });
        this.listener.listen(model.events, 'discardGraph', () => {
            this.setState(state => ({version: state.version + 1}));
            this.scheduleUpdateAll();
        });
        this.listener.listen(renderingState.shared.events, 'changeHighlight', this.scheduleUpdateAll);
        this.listener.listen(renderingState.events, 'changeElementSize', e => {
            scheduleUpdateElementLinks(e.source);
        });
        const updateChangedRoutes = (
            changed: ReadonlyMap<string, RoutedLink>,
            previous: ReadonlyMap<string, RoutedLink>
        ) => {
            changed.forEach((routing, linkId) => {
                if (previous.get(linkId) !== routing) {
                    this.scheduleUpdateLink(linkId);
                }
            });
        };
        this.listener.listen(renderingState.events, 'changeRoutings', ({previous}) => {
            const newRoutes = renderingState.getRoutings();
            updateChangedRoutes(newRoutes, previous);
            updateChangedRoutes(previous, newRoutes);
        });
        this.listener.listen(renderingState.events, 'syncUpdate', ({layer}) => {
            switch (layer) {
                case RenderingLayer.Link: {
                    this.delayedUpdate.runSynchronously();
                    break;
                }
                case RenderingLayer.LinkLabel: {
                    this.delayedMeasureLabels.runSynchronously();
                    break;
                }
            }
        });
    }

    shouldComponentUpdate(nextProps: LinkLayerProps, nextState: LinkLayerState): boolean {
        return !(
            this.props.shouldRenderLink === nextProps.shouldRenderLink &&
            this.state.version === nextState.version &&
            this.state.shouldUpdateLink === nextState.shouldUpdateLink
        );
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.delayedUpdate.dispose();
        this.delayedMeasureLabels.dispose();
    }

    private scheduleUpdateAll = () => {
        if (this.updateState !== UpdateRequest.All) {
            this.updateState = UpdateRequest.All;
            this.scheduledToUpdate = new Set<string>();
        }
        this.delayedUpdate.call(this.performUpdate);
    };

    private scheduleUpdateLink(linkId: string) {
        if (this.updateState === UpdateRequest.Partial) {
            this.scheduledToUpdate.add(linkId);
        }
        this.delayedUpdate.call(this.performUpdate);
    }

    private popShouldUpdatePredicate(): (model: Link) => boolean {
        const {updateState, scheduledToUpdate} = this;
        this.scheduledToUpdate = new Set<string>();
        this.updateState = UpdateRequest.Partial;
        return updateState === UpdateRequest.All
            ? () => true
            : link => scheduledToUpdate.has(link.id);
    }

    private scheduleLabelMeasure = (label: MeasurableLabel) => {
        this.labelMeasureRequests.add(label);
        this.delayedMeasureLabels.call(this.measureLabels);
    };

    private clearLabelMeasure = (label: MeasurableLabel) => {
        const {renderingState} = this.props;
        this.labelMeasureRequests.delete(label);
        renderingState.setLinkLabelBounds(label.owner, undefined);
    };

    private measureLabels = () => {
        const {renderingState} = this.props;
        const requests = Array.from(this.labelMeasureRequests);
        this.labelMeasureRequests.clear();

        const bounds: Array<Rect | undefined> = [];
        for (const label of requests) {
            bounds.push(label.measureBounds());
        }

        for (let i = 0; i < requests.length; i++) {
            const label = requests[i];
            const measuredBounds = bounds[i];
            if (measuredBounds) {
                renderingState.setLinkLabelBounds(label.owner, measuredBounds);
            }
        }
    };

    private performUpdate = () => {
        this.setState({
            shouldUpdateLink: this.popShouldUpdatePredicate(),
        });
    };

    render() {
        const {model, shouldRenderLink, renderingState} = this.props;
        const {version, shouldUpdateLink} = this.state;
        const {memoizedLinks} = this;

        for (const link of model.links) {
            if (shouldUpdateLink(link)) {
                memoizedLinks.delete(link);
            }
        }

        const renderedLinks: React.ReactElement[] = [];
        for (const link of model.links) {
            if (!shouldRenderLink || shouldRenderLink(link)) {
                let view = memoizedLinks.get(link);
                if (!view) {
                    view = (
                        <LinkView key={link.id}
                            link={link}
                            model={model}
                            renderingState={renderingState}
                        />
                    );
                    memoizedLinks.set(link, view);
                }
                renderedLinks.push(view);
            }
        }

        return (
            <LinkLayerContext.Provider value={this.providedContext}>
                <g key={version} className={CLASS_NAME}>
                    {renderedLinks}
                </g>
            </LinkLayerContext.Provider>
        );
    }
}

interface LinkLayerContext {
    scheduleLabelMeasure: (label: MeasurableLabel) => void;
    clearLabelMeasure: (label: MeasurableLabel) => void;
}
const LinkLayerContext = React.createContext<LinkLayerContext | null>(null);

interface LinkViewProps {
    link: Link;
    model: DiagramModel;
    renderingState: MutableRenderingState;
}

const LINK_CLASS = 'reactodia-link';

function LinkView(props: LinkViewProps) {
    const {link, model, renderingState} = props;

    const template = React.useMemo(
        () => renderingState.createLinkTemplate(link.typeId),
        [link.typeId]
    );

    const source = model.getElement(link.sourceId);
    const target = model.getElement(link.targetId);
    const visibility = model.getLinkVisibility(link.typeId);
    if (!(source && target && visibility !== 'hidden')) {
        return null;
    }

    const route = renderingState.getRouting(link.id);
    const verticesDefinedByUser = link.vertices;
    const vertices = route ? route.vertices : verticesDefinedByUser;

    const sourceShape = renderingState.getElementShape(source);
    const targetShape = renderingState.getElementShape(target);
    const polyline = computePolyline(sourceShape, targetShape, vertices);
    const spline = Spline.create({
        type: template.spline ?? Spline.defaultType,
        points: polyline,
        source: Rect.center(sourceShape.bounds),
        target: Rect.center(targetShape.bounds),
    });

    const polylineLength = computePolylineLength(polyline);
    const getPathPosition = (offset: number) => {
        return getPointAlongPolyline(polyline, polylineLength * offset);
    };

    const typeIndex = renderingState.ensureLinkTypeIndex(link.typeId);

    const {highlighter} = renderingState.shared;
    const isBlurred = highlighter && !highlighter(link);
    
    const renderedLink = template.renderLink({
        link,
        markerSource: `url(#${linkMarkerKey(typeIndex, true)})`,
        markerTarget: `url(#${linkMarkerKey(typeIndex, false)})`,
        path: spline.toPath(),
        getPathPosition,
        route,
    });
    return (
        <g data-link-id={link.id}
            data-source-id={link.sourceId}
            data-target-id={link.targetId}
            className={cx(LINK_CLASS, isBlurred ? `${LINK_CLASS}--blurred` : undefined)}>
            {renderedLink}
        </g>
    );
}

/**
 * Props for {@link LinkPath} component.
 *
 * @see {@link LinkPath}
 */
export interface LinkPathProps {
    /**
     * Link geometry represented as an SVG path string.
     */
    path: string;
    /**
     * Additional attributes for the SVG path.
     */
    pathProps?: React.SVGAttributes<SVGPathElement>;
    /**
     * SVG path marker for the source endpoint of the link.
     */
    markerSource?: string;
    /**
     * SVG path marker for the target endpoint of the link.
     */
    markerTarget?: string;
}

const LINK_PATH_CLASS = 'reactodia-link-path';

/**
 * Component to render link geometry as an SVG path.
 *
 * @category Components
 */
export function LinkPath(props: LinkPathProps) {
    const {path, pathProps, markerSource, markerTarget} = props;
    return <>
        <path {...pathProps}
            className={cx(LINK_PATH_CLASS, pathProps?.className)}
            d={path}
            markerStart={markerSource}
            markerEnd={markerTarget}
        />
        <path className={`${LINK_PATH_CLASS}__wrap`} d={path} />
    </>;
}

export function LinkLabelLayer(props: {
    renderingState: MutableRenderingState;
    paperTransform: PaperTransform;
    layerRef?: React.MutableRefObject<HTMLDivElement | null>;
}) {
    const {renderingState, paperTransform, layerRef} = props;

    const parentRef = React.useRef<HTMLDivElement | null>(null);
    const onMount = React.useCallback((element: HTMLDivElement | null) => {
        parentRef.current = element;
        if (layerRef) {
            layerRef.current = element;
        }
    }, [layerRef]);

    React.useEffect(() => {
        const parent = parentRef.current;
        if (parent) {
            renderingState.attachLinkLabelContainer(parent);
            return () => renderingState.attachLinkLabelContainer(null);
        }
    }, []);

    return (
        <HtmlPaperLayer paperTransform={paperTransform}
            className='reactodia-label-layer'
            layerRef={onMount}
        />
    );
}

const LINK_LABEL_CLASS = 'reactodia-link-label';
const DEFAULT_TEXT_ANCHOR = 'middle';

/**
 * Props for {@link LinkLabel} component.
 *
 * @see {@link LinkLabel}
 */
export interface LinkLabelProps {
    /**
     * Owner link to display label over.
     */
    link: Link;
    /**
     * Whether the label should be considered as primary one for the link.
     *
     * Primary label bounds are available via {@link RenderingState.getLinkLabelBounds}.
     */
    primary?: boolean;
    /**
     * Label position in paper coordinates.
     */
    position: Vector;
    /**
     * Vertical row shift for the label
     * (e.g. `-1` for one row above, `1` for one row below).
     *
     * @default 0
     */
    line?: number;
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Additional CSS styles for the component.
     */
    style?: React.CSSProperties;
    /**
     * Label text alignment relative to its position.
     *
     * @default "middle"
     */
    textAnchor?: 'start' | 'middle' | 'end';
    /**
     * Title for the label.
     */
    title?: string;
    /**
     * Content for the label.
     *
     * This content is rendered in the normal HTML context, unlike the link itself.
     */
    children?: React.ReactNode;
}

export function LinkLabel(props: LinkLabelProps) {
    const {link, position: {x, y}, line, className, style, textAnchor, title, children} = props;
    const {canvas} = useCanvas();

    const layerContext = React.useContext(LinkLayerContext);
    const elementRef = React.useRef<HTMLDivElement | null>(null);
    const measurableLabelRef = React.useRef<MeasurableLabelWithProps>(undefined);

    React.useLayoutEffect(() => {
        if (layerContext && props.primary) {
            if (!measurableLabelRef.current) {
                const measurable: MeasurableLabelWithProps = {
                    owner: link,
                    measureBounds: () => {
                        const bounds = elementRef.current?.getBoundingClientRect();
                        if (!bounds) {
                            return undefined;
                        }
                        const inverseScale = 1 / canvas.getScale();
                        return computeLabelBounds(measurable.latestProps, {
                            width: bounds.width * inverseScale,
                            height: bounds.height * inverseScale,
                        });
                    },
                    latestProps: props,
                };
                measurableLabelRef.current = measurable;
            }
            measurableLabelRef.current.latestProps = props;
            layerContext.scheduleLabelMeasure(measurableLabelRef.current);
        }
    });

    React.useLayoutEffect(() => {
        return () => {
            const measurable = measurableLabelRef.current;
            if (layerContext && measurable) {
                layerContext.clearLabelMeasure(measurable);
            }
        };
    }, []);

    const anchorTransform = (
        textAnchor === 'start' ? 'translate(0,-50%)' :
        textAnchor === 'end' ? 'translate(-100%,-50%)' :
        'translate(-50%,-50%)'
    );
    const providedStyle = {
        ...style,
        position: 'absolute',
        transform: `translate(${x}px,${y}px)${anchorTransform}`,
        '--reactodia-link-label-line': line,
    } as React.CSSProperties;

    const renderingState = canvas.renderingState as MutableRenderingState;

    return createPortal(
        <div ref={elementRef}
            data-link-id={link.id}
            className={cx(LINK_LABEL_CLASS, className)}
            style={providedStyle}
            title={title}>
            {children}
        </div>,
        renderingState.getLinkLabelContainer()
    );
}

interface MeasurableLabelWithProps extends MeasurableLabel {
    latestProps: LinkLabelProps;
}

function computeLabelBounds(props: LinkLabelProps, {width, height}: Size): Rect {
    const {position: {x, y}, textAnchor = DEFAULT_TEXT_ANCHOR} = props;

    let xOffset = 0;
    if (textAnchor === 'middle') {
        xOffset = -width / 2;
    } else if (textAnchor === 'end') {
        xOffset = -width;
    }

    return {
        x: x + xOffset,
        y: y - height / 2,
        width,
        height,
    };
}

/**
 * Props for {@link LinkVertices} component.
 *
 * @see {@link LinkVertices}
 */
export interface LinkVerticesProps {
    /**
     * Target link to manipulate vertices of.
     */
    linkId: string;
    /**
     * Vertices to display and interact with.
     */
    vertices: ReadonlyArray<Vector>;
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Radius for each vertex in px.
     *
     * @default 10
     */
    vertexRadius?: number;
    /**
     * Fill color for each vertex.
     */
    fill?: string;
}

const LINK_VERTICES_CLASS = 'reactodia-link-vertices';

/**
 * Component to render interactive vertices of the link geometry.
 *
 * Each displayed vertex can be moved or deleted which
 * adds a command to the command history.
 *
 * @category Components
 */
export function LinkVertices(props: LinkVerticesProps) {
    const {linkId, vertices, className, vertexRadius = 10, fill} = props;
    const {model} = useCanvas();

    if (vertices.length === 0) {
        return null;
    }

    const vertexClass = cx(`${LINK_VERTICES_CLASS}__vertex`, className);

    const onRemoveLinkVertex = (vertexIndex: number) => {
        const link = model.getLink(linkId);
        if (!link) {
            return;
        }
        const vertex = new LinkVertex(link, vertexIndex);
        model.history.registerToUndo(
            restoreCapturedLinkGeometry(vertex.link)
        );
        vertex.remove();
    };

    const elements: React.ReactElement[] = [];
    for (let i = 0; i < vertices.length; i++) {
        const {x, y} = vertices[i];
        const key = elements.length;
        elements.push(
            <circle key={key}
                data-vertex={i}
                className={vertexClass}
                cx={x} cy={y}
                r={vertexRadius}
                fill={fill}
            />
        );
        elements.push(
            <VertexTools key={key + 1}
                vertexIndex={i}
                vertexRadius={vertexRadius}
                x={x} y={y}
                onRemove={onRemoveLinkVertex}
            />
        );
    }

    return <g className={LINK_VERTICES_CLASS}>{elements}</g>;
}

class VertexTools extends React.Component<{
    vertexIndex: number;
    vertexRadius: number;
    x: number;
    y: number;
    onRemove: (vertexIndex: number) => void;
}> {
    render() {
        const {vertexRadius, x, y} = this.props;
        const transform = `translate(${x + 2 * vertexRadius},${y - 2 * vertexRadius})scale(${vertexRadius})`;
        return (
            <g className={`${LINK_VERTICES_CLASS}__handle`}
                data-reactodia-no-export='true'
                transform={transform}
                onPointerDown={this.onRemoveVertex}>
                <title>Remove vertex</title>
                <circle r={1} />
                <path d='M-0.5,-0.5 L0.5,0.5 M0.5,-0.5 L-0.5,0.5' strokeWidth={2 / vertexRadius} />
            </g>
        );
    }

    private onRemoveVertex = (e: React.MouseEvent<SVGElement>) => {
        if (e.button !== 0 /* left button */) { return; }
        e.preventDefault();
        e.stopPropagation();
        const {onRemove, vertexIndex} = this.props;
        onRemove(vertexIndex);
    };
}

export interface LinkMarkersProps {
    renderingState: MutableRenderingState;
}

export class LinkMarkers extends React.Component<LinkMarkersProps> {
    private readonly listener = new EventObserver();
    private readonly delayedUpdate = new Debouncer();

    render() {
        const {renderingState} = this.props;

        const markers: Array<React.ReactElement<LinkMarkerProps>> = [];

        for (const [linkTypeId, template] of renderingState.getLinkTemplates()) {
            const defaultTemplate = renderingState.shared.defaultLinkResolver(linkTypeId);
            const typeIndex = renderingState.ensureLinkTypeIndex(linkTypeId);

            if (template.markerSource) {
                markers.push(
                    <LinkMarker key={typeIndex * 2}
                        linkTypeIndex={typeIndex}
                        isStartMarker={true}
                        style={template.markerSource}
                        defaultStyle={defaultTemplate.markerSource}
                    />
                );
            }

            if (template.markerTarget) {
                markers.push(
                    <LinkMarker key={typeIndex * 2 + 1}
                        linkTypeIndex={typeIndex}
                        isStartMarker={false}
                        style={template.markerTarget}
                        defaultStyle={defaultTemplate.markerTarget}
                    />
                );
            }
        }

        return <defs>{markers}</defs>;
    }

    componentDidMount() {
        const {renderingState} = this.props;
        this.listener.listen(renderingState.events, 'syncUpdate', ({layer}) => {
            if (layer !== RenderingLayer.Link) { return; }
            this.delayedUpdate.runSynchronously();
        });
        this.listener.listen(renderingState.events, 'changeLinkTemplates', () => {
            this.delayedUpdate.call(() => this.forceUpdate());
        });
    }

    shouldComponentUpdate() {
        return false;
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.delayedUpdate.dispose();
    }
}

interface LinkMarkerProps {
    linkTypeIndex: number;
    isStartMarker: boolean;
    style: LinkMarkerStyle;
    defaultStyle: LinkMarkerStyle | undefined;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

class LinkMarker extends React.Component<LinkMarkerProps> {
    render() {
        return <marker ref={this.onMarkerMount}></marker>;
    }

    shouldComponentUpdate() {
        return false;
    }

    private onMarkerMount = (marker: SVGMarkerElement) => {
        if (!marker) {
            return;
        }

        const {linkTypeIndex, isStartMarker, style, defaultStyle} = this.props;
        const {
            d = defaultStyle?.d,
            width = defaultStyle?.width,
            height = defaultStyle?.height,
        } = style;
        if (!(d !== undefined && width !== undefined && height !== undefined)) {
            return;
        }

        const className = 'reactodia-link-marker';
        marker.setAttribute('class', className);
        marker.setAttribute('id', linkMarkerKey(linkTypeIndex, isStartMarker));
        marker.setAttribute('markerWidth', String(width));
        marker.setAttribute('markerHeight', String(height));
        marker.setAttribute('orient', 'auto');

        const xOffset = isStartMarker ? 0 : (width - 1);
        marker.setAttribute('refX', String(xOffset));
        marker.setAttribute('refY', String(height / 2));
        marker.setAttribute('markerUnits', 'userSpaceOnUse');

        const path = document.createElementNS(SVG_NAMESPACE, 'path');
        path.setAttribute('class', `${className}__path`);
        path.setAttribute('d', d);
        if (style.fill !== undefined) { path.setAttribute('fill', style.fill); }
        if (style.stroke !== undefined) { path.setAttribute('stroke', style.stroke); }
        if (style.strokeWidth !== undefined) {
            path.setAttribute('stroke-width', String(style.strokeWidth));
        }

        marker.appendChild(path);
    };
}

function linkMarkerKey(linkTypeIndex: number, startMarker: boolean) {
    return `reactodia-marker-${startMarker ? 'start' : 'end'}-${linkTypeIndex}`;
}
