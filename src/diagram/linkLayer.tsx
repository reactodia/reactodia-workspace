import * as React from 'react';
import classnames from 'classnames';

import { EventObserver } from '../coreUtils/events';
import { Debouncer } from '../coreUtils/scheduler';

import { restoreCapturedLinkGeometry } from './commands';
import { LinkMarkerStyle, RoutedLink } from './customization';
import {
    Element as DiagramElement, Link as DiagramLink, LinkVertex, linkMarkerKey, RichLinkType,
} from './elements';
import {
    Rect, Size, Vector, boundsOf, computeGrouping, computePolyline, computePolylineLength,
    getPointAlongPolyline, pathFromPolyline,
} from './geometry';
import { DiagramModel } from './model';
import { RenderingState, RenderingLayer } from './renderingState';
import { CanvasContext } from './canvasApi';

export interface LinkLayerProps {
    model: DiagramModel;
    renderingState: RenderingState;
    links: ReadonlyArray<DiagramLink>;
    group?: string;
}

enum UpdateRequest {
    /** Some part of layer requested an update */
    Partial = 1,
    /** Full update requested */
    All,
}

type ScheduleLabelMeasure = (
    label: MeasurableLabel,
    clear: boolean
) => void;

interface MeasurableLabel {
    readonly owner: DiagramLink | undefined;
    measureSize(): Size | undefined;
    applySize({width, height}: Size): void;
    computeBounds({width, height}: Size): Rect;
}

const CLASS_NAME = 'reactodia-link-layer';

export class LinkLayer extends React.Component<LinkLayerProps> {
    private readonly listener = new EventObserver();
    private readonly delayedUpdate = new Debouncer();

    private providedContext: LinkLayerContext;

    private updateState = UpdateRequest.Partial;
    /** List of link IDs to update at the next flush event */
    private scheduledToUpdate = new Set<string>();

    private labelMeasureRequests = new Set<MeasurableLabel>();
    private delayedMeasureLabels = new Debouncer();

    private readonly memoizedLinks = new WeakMap<DiagramLink, JSX.Element>();

    constructor(props: LinkLayerProps) {
        super(props);
        this.providedContext = {
            scheduleLabelMeasure: this.scheduleLabelMeasure,
        };
    }

    componentDidMount() {
        const {model, renderingState} = this.props;

        const scheduleUpdateElementLinks = (element: DiagramElement) => {
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
                data.changeData ||
                data.changeLayoutOnly ||
                data.changeVertices ||
                data.changeLinkState
            );
            if (linkEvent) {
                this.scheduleUpdateLink(linkEvent.source.id);
            }
        });
        this.listener.listen(model.events, 'linkTypeEvent', ({data}) => {
            const linkTypeEvent = data.changeLabel || data.changeVisibility;
            if (!linkTypeEvent) { return; }
            const linkTypeId = linkTypeEvent.source.id;
            for (const link of model.links.filter(link => link.typeId === linkTypeId)) {
                this.scheduleUpdateLink(link.id);
            }
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

    shouldComponentUpdate() {
        return false;
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.delayedUpdate.dispose();
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

    private popShouldUpdatePredicate(): (model: DiagramLink) => boolean {
        const {updateState, scheduledToUpdate} = this;
        this.scheduledToUpdate = new Set<string>();
        this.updateState = UpdateRequest.Partial;
        return updateState === UpdateRequest.All
            ? () => true
            : link => scheduledToUpdate.has(link.id);
    }

    private scheduleLabelMeasure: ScheduleLabelMeasure = (label, clear) => {
        if (label.owner && clear) {
            const {renderingState} = this.props;
            renderingState.setLinkLabelBounds(label.owner, undefined);
        } else {
            this.labelMeasureRequests.add(label);
            this.delayedMeasureLabels.call(this.measureLabels);
        }
    };

    private measureLabels = () => {
        const {renderingState} = this.props;
        const requests = Array.from(this.labelMeasureRequests);
        this.labelMeasureRequests.clear();

        const sizes: Array<Size | undefined> = [];
        for (const label of requests) {
            sizes.push(label.measureSize());
        }

        for (let i = 0; i < requests.length; i++) {
            const label = requests[i];
            const size = sizes[i];
            if (label.owner && size) {
                const bounds = label.computeBounds(size);
                renderingState.setLinkLabelBounds(label.owner, bounds);
            }
        }

        this.setState(() => {
            for (let i = 0; i < requests.length; i++) {
                const label = requests[i];
                const size = sizes[i];
                if (size) {
                    label.applySize(size);
                }
            }
            return null;
        });
    };

    private performUpdate = () => {
        this.forceUpdate();
    };

    private getLinks() {
        const {model, links, group} = this.props;

        if (!group) { return links; }

        const grouping = computeGrouping(model.elements);
        const nestedElements = computeDeepNestedElements(grouping, group);

        return links.filter(link => {
            const {sourceId, targetId} = link;
            const source = model.getElement(sourceId);
            const target = model.getElement(targetId);
            if (!source || !target) {
                return false;
            }
            return Boolean(
                source.group && nestedElements[source.group] ||
                target.group && nestedElements[target.group]
            );
        });
    }

    render() {
        const {model, renderingState} = this.props;
        const {memoizedLinks} = this;

        const shouldUpdate = this.popShouldUpdatePredicate();
        const links = this.getLinks();
        for (const link of links) {
            if (shouldUpdate(link)) {
                memoizedLinks.delete(link);
            }
        }

        return (
            <LinkLayerContext.Provider value={this.providedContext}>
                <g className={CLASS_NAME}>
                    {links.map(link => {
                        let linkView = memoizedLinks.get(link);
                        if (!linkView) {
                            linkView = (
                                <LinkView key={link.id}
                                    link={link}
                                    model={model}
                                    renderingState={renderingState}
                                />
                            );
                            memoizedLinks.set(link, linkView);
                        }
                        return linkView;
                    })}
                </g>
            </LinkLayerContext.Provider>
        );
    }
}

interface LinkLayerContext {
    scheduleLabelMeasure: ScheduleLabelMeasure;
}
const LinkLayerContext = React.createContext<LinkLayerContext | null>(null);

function computeDeepNestedElements(grouping: Map<string, DiagramElement[]>, groupId: string): { [id: string]: true } {
    const deepChildren: { [elementId: string]: true } = {};

    function collectNestedItems(parentId: string) {
        deepChildren[parentId] = true;
        const children = grouping.get(parentId);
        if (!children) { return; }
        for (const element of children) {
            if (element.group !== parentId) { continue; }
            collectNestedItems(element.id);
        }
    }

    collectNestedItems(groupId);
    return deepChildren;
}

interface LinkViewProps {
    link: DiagramLink;
    model: DiagramModel;
    renderingState: RenderingState;
}

const LINK_CLASS = 'reactodia-link';

function LinkView(props: LinkViewProps) {
    const {link, model, renderingState} = props;

    const linkType = model.getLinkType(link.typeId)!;
    const template = React.useMemo(
        () => renderingState.createLinkTemplate(linkType),
        [linkType]
    );

    const source = model.getElement(link.sourceId);
    const target = model.getElement(link.targetId);
    const {visibility} = linkType;
    if (!(source && target && visibility !== 'hidden')) {
        return null;
    }

    const route = renderingState.getRouting(link.id);
    const verticesDefinedByUser = link.vertices;
    const vertices = route ? route.vertices : verticesDefinedByUser;
    const polyline = computePolyline(
        boundsOf(source, renderingState),
        boundsOf(target, renderingState),
        vertices
    );

    const path = pathFromPolyline(polyline);

    const polylineLength = computePolylineLength(polyline);
    const getPathPosition = (offset: number) => {
        return getPointAlongPolyline(polyline, polylineLength * offset);
    };

    const {highlighter} = renderingState.shared;
    const isBlurred = highlighter && !highlighter(link);
    const className = `${LINK_CLASS} ${isBlurred ? `${LINK_CLASS}--blurred` : ''}`;
    
    const renderedLink = template.renderLink({
        link,
        linkType,
        className,
        path,
        getPathPosition,
        route,
        editableLabel: template.editableLabel,
    });
    return renderedLink;
}

export interface LinkPathProps {
    linkType: RichLinkType;
    path: string;
    pathProps?: React.SVGAttributes<SVGPathElement>;
}

const LINK_PATH_CLASS = 'reactodia-link-path';

export function LinkPath(props: LinkPathProps) {
    const {linkType, path, pathProps} = props;
    const typeIndex = linkType.index!;
    return <>
        <path {...pathProps}
            className={classnames(LINK_PATH_CLASS, pathProps?.className)}
            d={path}
            markerStart={`url(#${linkMarkerKey(typeIndex, true)})`}
            markerEnd={`url(#${linkMarkerKey(typeIndex, false)})`}
        />
        <path className={`${LINK_PATH_CLASS}__wrap`} d={path} />
    </>;
}

export interface LinkLabelProps {
    link: DiagramLink;
    primary?: boolean;

    position: Vector;
    /**
     * @default 0
     */
    line?: number;

    className?: string;
    /**
     * @default "middle"
     */
    textAnchor?: 'start' | 'middle' | 'end';
    rectClass?: string;
    rectStyle?: React.CSSProperties;
    textClass?: string;
    textStyle?: React.CSSProperties;

    title?: string;
    content?: React.ReactNode;
    children?: React.ReactNode;
}

interface LinkLabelState {
    readonly width: number;
    readonly height: number;
}

const LINK_LABEL_CLASS = 'reactodia-link-label';
const GROUPED_LABEL_MARGIN = 2;
const DEFAULT_TEXT_ANCHOR = 'middle';

export class LinkLabel extends React.Component<LinkLabelProps, LinkLabelState> implements MeasurableLabel {
    static contextType = LinkLayerContext;
    declare readonly context: LinkLayerContext;

    private text: SVGTextElement | undefined | null;
    private shouldUpdateBounds = true;

    constructor(props: LinkLabelProps) {
        super(props);
        this.state = {width: 0, height: 0};
    }

    get owner(): DiagramLink | undefined {
        const {link, primary} = this.props;
        return primary ? link : undefined;
    }

    render() {
        const {
            primary, position: {x, y}, line = 0, className, textAnchor = DEFAULT_TEXT_ANCHOR,
            rectClass, rectStyle, textClass, textStyle, title, content, children,
        } = this.props;
        const {width, height} = this.state;
        const {x: rectX, y: rectY} = this.computeBounds({width, height});

        const transform = line === 0 ? undefined :
            `translate(0, ${line * (height + GROUPED_LABEL_MARGIN)}px)`;
        // HACK: 'alignment-baseline' and 'dominant-baseline' are not supported in Edge and IE
        const dy = '0.6ex';

        return (
            <g style={transform ? {transform} : undefined}
                className={classnames(
                    LINK_LABEL_CLASS,
                    primary ? `${LINK_LABEL_CLASS}--primary` : undefined,
                    className
                )}>
                {title ? <title>{title}</title> : undefined}
                <rect x={rectX} y={rectY}
                    width={width} height={height}
                    className={rectClass}
                    style={rectStyle}
                />
                <text ref={this.onTextMount}
                    x={x} y={y} dy={dy}
                    textAnchor={textAnchor}
                    className={textClass}
                    style={textStyle}>
                    {content}
                </text>
                {children}
            </g>
        );
    }

    measureSize(): Size | undefined {
        const {width, height} = this.text!.getBBox();
        return {width, height};
    }

    applySize({width, height}: Size): void {
        if (!(
            width === this.state.width &&
            height === this.state.height
        )) {
            this.setState({width, height});
        }
    }

    computeBounds({width, height}: Size): Rect {
        const {position: {x, y}, textAnchor = DEFAULT_TEXT_ANCHOR} = this.props;

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

    private onTextMount = (text: SVGTextElement | null) => {
        this.text = text;
    };

    componentDidMount() {
        this.tryRecomputeBounds(this.props);
    }

    componentWillUnmount() {
        const {scheduleLabelMeasure} = this.context;
        scheduleLabelMeasure(this, true);
    }

    UNSAFE_componentWillReceiveProps(nextProps: LinkLabelProps) {
        this.shouldUpdateBounds = true;
    }

    componentDidUpdate(props: LinkLabelProps) {
        this.tryRecomputeBounds(this.props);
    }

    private tryRecomputeBounds(props: LinkLabelProps) {
        if (this.text && this.shouldUpdateBounds) {
            this.shouldUpdateBounds = false;
            const {scheduleLabelMeasure} = this.context;
            scheduleLabelMeasure(this, false);
        }
    }
}

export interface LinkVerticesProps {
    linkId: string;
    vertices: ReadonlyArray<Vector>;
    className?: string;
    /**
     * @default 10
     */
    vertexRadius?: number;
    fill?: string;
}

const LINK_VERTICES_CLASS = 'reactodia-link-vertices';

export function LinkVertices(props: LinkVerticesProps) {
    const {linkId, vertices, className, vertexRadius = 10, fill} = props;
    const {model} = React.useContext(CanvasContext)!;

    if (vertices.length === 0) {
        return null;
    }

    const vertexClass = classnames(`${LINK_VERTICES_CLASS}__vertex`, className);

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
    model: DiagramModel;
    renderingState: RenderingState;
}

export class LinkMarkers extends React.Component<LinkMarkersProps> {
    private readonly listener = new EventObserver();
    private readonly delayedUpdate = new Debouncer();

    render() {
        const {model, renderingState} = this.props;
        const markers: Array<React.ReactElement<LinkMarkerProps>> = [];

        renderingState.getLinkTemplates().forEach((template, linkTypeId) => {
            const type = model.getLinkType(linkTypeId);
            if (!type) { return; }

            const typeIndex = type.index!;
            if (template.markerSource) {
                markers.push(
                    <LinkMarker key={typeIndex * 2}
                        linkTypeIndex={typeIndex}
                        style={template.markerSource}
                        isStartMarker={true}
                    />
                );
            }
            if (template.markerTarget) {
                markers.push(
                    <LinkMarker key={typeIndex * 2 + 1}
                        linkTypeIndex={typeIndex}
                        style={template.markerTarget}
                        isStartMarker={false}
                    />
                );
            }
        });

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

        const {linkTypeIndex, isStartMarker, style} = this.props;
        if (!(style.d !== undefined && style.width !== undefined && style.height !== undefined)) {
            return;
        }

        marker.setAttribute('id', linkMarkerKey(linkTypeIndex, isStartMarker));
        marker.setAttribute('markerWidth', style.width.toString());
        marker.setAttribute('markerHeight', style.height.toString());
        marker.setAttribute('orient', 'auto');

        const xOffset = isStartMarker ? 0 : (style.width - 1);
        marker.setAttribute('refX', xOffset.toString());
        marker.setAttribute('refY', (style.height / 2).toString());
        marker.setAttribute('markerUnits', 'userSpaceOnUse');

        const path = document.createElementNS(SVG_NAMESPACE, 'path');
        path.setAttribute('d', style.d);
        if (style.fill !== undefined) { path.setAttribute('fill', style.fill); }
        if (style.stroke !== undefined) { path.setAttribute('stroke', style.stroke); }
        if (style.strokeWidth !== undefined) { path.setAttribute('stroke-width', style.strokeWidth); }

        marker.appendChild(path);
    };
}
