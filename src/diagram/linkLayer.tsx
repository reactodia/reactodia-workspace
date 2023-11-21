import * as React from 'react';

import { EventObserver } from '../coreUtils/events';
import { Debouncer } from '../coreUtils/scheduler';

import type * as Rdf from '../data/rdf/rdfModel';
import {
    LinkStyle, LinkLabelStyle, LinkMarkerStyle, RoutedLink,
} from './customization';

import { restoreCapturedLinkGeometry } from './commands';
import { Element as DiagramElement, Link as DiagramLink, LinkVertex, linkMarkerKey, FatLinkType } from './elements';
import {
    Rect, Vector, boundsOf, computePolyline, computePolylineLength, getPointAlongPolyline, computeGrouping,
} from './geometry';
import { DiagramModel } from './model';
import { RenderingState, RenderingLayer, FilledLinkTemplate } from './renderingState';
import { DiagramView } from './view';

export interface LinkLayerProps {
    model: DiagramModel;
    view: DiagramView;
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

const CLASS_NAME = 'reactodia-link-layer';

export class LinkLayer extends React.Component<LinkLayerProps> {
    private readonly listener = new EventObserver();
    private readonly delayedUpdate = new Debouncer();

    private updateState = UpdateRequest.Partial;
    /** List of link IDs to update at the next flush event */
    private scheduledToUpdate = new Set<string>();

    constructor(props: LinkLayerProps) {
        super(props);
    }

    componentDidMount() {
        const {model, view, renderingState} = this.props;

        const scheduleUpdateElementLinks = (element: DiagramElement) => {
            for (const link of model.getElementLinks(element)) {
                this.scheduleUpdateLink(link.id);
            }
        };
        this.listener.listen(view.events, 'changeLanguage', this.scheduleUpdateAll);
        this.listener.listen(view.events, 'changeHighlight', this.scheduleUpdateAll);
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
            for (const link of view.model.linksOfType(linkTypeId)) {
                this.scheduleUpdateLink(link.id);
            }
        });
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
        this.listener.listen(renderingState.events, 'updateRoutings', ({previous}) => {
            const newRoutes = renderingState.getRoutings();
            updateChangedRoutes(newRoutes, previous);
            updateChangedRoutes(previous, newRoutes);
        });
        this.listener.listen(renderingState.events, 'syncUpdate', ({layer}) => {
            if (layer !== RenderingLayer.Link) { return; }
            this.delayedUpdate.runSynchronously();
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

    private performUpdate = () => {
        this.forceUpdate();
    };

    private getLinks() {
        const {view, links, group} = this.props;

        if (!group) { return links; }

        const grouping = computeGrouping(view.model.elements);
        const nestedElements = computeDeepNestedElements(grouping, group);

        return links.filter(link => {
            const {sourceId, targetId} = link;
            const source = view.model.getElement(sourceId);
            const target = view.model.getElement(targetId);
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
        const {view, renderingState} = this.props;
        const shouldUpdate = this.popShouldUpdatePredicate();

        return <g className={CLASS_NAME}>
            {this.getLinks().map(link => (
                <LinkView key={link.id}
                    link={link}
                    route={renderingState.getRouting(link.id)}
                    shouldUpdate={shouldUpdate(link)}
                    view={view}
                    renderingState={renderingState}
                />
            ))}
        </g>;
    }
}

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
    view: DiagramView;
    renderingState: RenderingState;
    shouldUpdate: boolean;
    route?: RoutedLink;
}

const LINK_CLASS = 'reactodia-link';
const LABEL_GROUPING_PRECISION = 100;
// temporary, cleared-before-render map to hold line numbers for labels
// grouped on the same link offset
const TEMPORARY_LABEL_LINES = new Map<number, number>();

interface LinkViewState {
    readonly linkType: FatLinkType;
    readonly template: FilledLinkTemplate;
}

class LinkView extends React.Component<LinkViewProps, LinkViewState> {
    constructor(props: LinkViewProps) {
        super(props);
        this.state = LinkView.makeStateFromProps(this.props);
    }

    static getDerivedStateFromProps(
        props: LinkViewProps,
        state: LinkViewState | undefined
    ): LinkViewState | null {
        if (state && state.linkType.id === props.link.typeId) {
            return null;
        }
        return LinkView.makeStateFromProps(props);
    }

    static makeStateFromProps(props: LinkViewProps): LinkViewState {
        const {view, renderingState} = props;
        const linkType = view.model.getLinkType(props.link.typeId)!;
        const template = renderingState.createLinkTemplate(linkType);
        return {linkType, template};
    }

    shouldComponentUpdate(nextProps: LinkViewProps) {
        return nextProps.shouldUpdate;
    }

    render() {
        const {link, route, view, renderingState} = this.props;
        const {linkType, template} = this.state;
        const source = view.model.getElement(link.sourceId);
        const target = view.model.getElement(link.targetId);
        if (!(source && target && linkType.visible)) {
            return null;
        }

        const verticesDefinedByUser = link.vertices;
        const vertices = route ? route.vertices : verticesDefinedByUser;
        const polyline = computePolyline(
            boundsOf(source, renderingState),
            boundsOf(target, renderingState),
            vertices
        );

        const path = 'M' + polyline.map(({x, y}) => `${x},${y}`).join(' L');

        const {index: typeIndex, showLabel} = linkType;
        const style = template.renderLink(link, view.model);
        const pathAttributes = getPathAttributes(link, style);

        const isBlurred = view.highlighter && !view.highlighter(link);
        const className = `${LINK_CLASS} ${isBlurred ? `${LINK_CLASS}--blurred` : ''}`;
        return (
            <g className={className} data-link-id={link.id} data-source-id={source.id} data-target-id={target.id}>
                <path className={`${LINK_CLASS}__connection`} d={path} {...pathAttributes}
                    markerStart={`url(#${linkMarkerKey(typeIndex!, true)})`}
                    markerEnd={`url(#${linkMarkerKey(typeIndex!, false)})`} />
                <path className={`${LINK_CLASS}__wrap`} d={path} />
                {showLabel ? this.renderLabels(polyline, style) : undefined}
                {this.renderVertices(verticesDefinedByUser, pathAttributes.stroke)}
            </g>
        );
    }

    private renderVertices(vertices: ReadonlyArray<Vector>, fill: string | undefined) {
        const {link} = this.props;
        const elements: React.ReactElement[] = [];

        const vertexClass = `${LINK_CLASS}__vertex`;
        const vertexRadius = 10;

        let index = 0;
        for (const {x, y} of vertices) {
            elements.push(
                <circle key={index * 2}
                    data-vertex={index} className={vertexClass}
                    cx={x} cy={y} r={vertexRadius} fill={fill} />
            );
            elements.push(
                <VertexTools key={index * 2 + 1}
                    className={`${LINK_CLASS}__vertex-tools`}
                    model={link}
                    vertexIndex={index}
                    vertexRadius={vertexRadius}
                    x={x} y={y}
                    onRemove={this.onRemoveLinkVertex}
                />
            );
            index++;
        }

        return <g className={`${LINK_CLASS}__vertices`}>{elements}</g>;
    }

    private onRemoveLinkVertex = (vertex: LinkVertex) => {
        const model = this.props.view.model;
        model.history.registerToUndo(
            restoreCapturedLinkGeometry(vertex.link)
        );
        vertex.remove();
    };

    private onBoundsUpdate = (newBounds: Rect | undefined) => {
        const {link, renderingState} = this.props;
        renderingState.setLinkLabelBounds(link, newBounds);
    };

    private renderLabels(polyline: ReadonlyArray<Vector>, style: LinkStyle) {
        const {link, route, view} = this.props;

        const labels = computeLinkLabels(link, style, view);

        let textAnchor: 'start' | 'middle' | 'end' = 'middle';
        if (route && route.labelTextAnchor) {
            textAnchor = route.labelTextAnchor;
        }

        const polylineLength = computePolylineLength(polyline);
        TEMPORARY_LABEL_LINES.clear();

        return (
            <g className={`${LINK_CLASS}__labels`}>
                {labels.map((label, index) => {
                    const {x, y} = getPointAlongPolyline(polyline, polylineLength * label.offset);
                    const groupKey = Math.round(label.offset * LABEL_GROUPING_PRECISION) / LABEL_GROUPING_PRECISION;
                    const line = TEMPORARY_LABEL_LINES.get(groupKey) || 0;
                    TEMPORARY_LABEL_LINES.set(groupKey, line + 1);
                    return (
                        <LinkLabel key={index}
                            x={x} y={y}
                            line={line}
                            label={label}
                            textAnchor={textAnchor}
                            onBoundsUpdate={index === 0 ? this.onBoundsUpdate : undefined}
                        />
                    );
                })}
            </g>
        );
    }
}

function computeLinkLabels(model: DiagramLink, style: LinkStyle, view: DiagramView) {
    const labelStyle = style.label ?? {};

    let text: Rdf.Literal;
    let title: string | undefined = labelStyle.title;
    if (labelStyle.label && labelStyle.label.length > 0) {
        text = view.selectLabel(labelStyle.label)!;
    } else {
        const type = view.model.getLinkType(model.typeId)!;
        text = view.selectLabel(type.label) || view.model.factory.literal(view.formatLabel([], type.id));
        if (title === undefined) {
            title = `${text.value} ${view.formatIri(model.typeId)}`;
        }
    }

    const labels: LabelAttributes[] = [];
    labels.push({
        offset: labelStyle.position || 0.5,
        text,
        title,
        attributes: {
            text: getLabelTextAttributes(labelStyle),
            rect: getLabelBackgroundAttributes(labelStyle),
        },
    });

    if (style.properties) {
        for (const property of style.properties) {
            const label = view.selectLabel(property.label ?? []);
            if (!label) {
                continue;
            }
            labels.push({
                offset: property.position || 0.5,
                text: label,
                title: property.title,
                attributes: {
                    text: getLabelTextAttributes(property),
                    rect: getLabelBackgroundAttributes(property),
                },
            });
        }
    }

    return labels;
}

function getPathAttributes(model: DiagramLink, style: LinkStyle): React.SVGAttributes<SVGPathElement> {
    const connectionAttributes: LinkStyle['connection'] = style.connection ?? {};
    const defaultStrokeDasharray = model.layoutOnly ? '5,5' : undefined;
    const {
        fill = 'none',
        stroke = 'black',
        strokeWidth,
        strokeDasharray = defaultStrokeDasharray,
    } = connectionAttributes;
    return {fill, stroke, strokeWidth, strokeDasharray};
}

function getLabelTextAttributes(label: LinkLabelStyle): React.CSSProperties {
    const {
        fill = 'black',
        stroke = 'none',
        strokeWidth = 0,
        fontFamily = '"Helvetica Neue", "Helvetica", "Arial", sans-serif',
        fontSize = 'inherit',
        fontStyle,
        fontWeight = 'bold',
    } = label.text ?? {};
    return {
        fill,
        stroke,
        strokeWidth,
        fontFamily,
        fontSize,
        fontStyle,
        fontWeight,
    };
}

function getLabelBackgroundAttributes(label: LinkLabelStyle): React.CSSProperties {
    const {
        fill = 'white',
        stroke = 'none',
        strokeWidth = 0,
    } = label.background ?? {};
    return {fill, stroke, strokeWidth};
}

interface LabelAttributes {
    offset: number;
    text: Rdf.Literal;
    title?: string;
    attributes: {
        text: React.CSSProperties;
        rect: React.CSSProperties;
    };
}

interface LinkLabelProps {
    x: number;
    y: number;
    line: number;
    label: LabelAttributes;
    textAnchor: 'start' | 'middle' | 'end';
    onBoundsUpdate?: (newBounds: Rect | undefined) => void;
}

interface LinkLabelState {
    readonly width: number;
    readonly height: number;
}

const GROUPED_LABEL_MARGIN = 2;

class LinkLabel extends React.Component<LinkLabelProps, LinkLabelState> {
    private text: SVGTextElement | undefined | null;
    private shouldUpdateBounds = true;

    constructor(props: LinkLabelProps) {
        super(props);
        this.state = {width: 0, height: 0};
    }

    render() {
        const {x, y, label, line, textAnchor} = this.props;
        const {width, height} = this.state;
        const {x: rectX, y: rectY} = this.getLabelRectangle(width, height);

        const transform = line === 0 ? undefined :
            `translate(0, ${line * (height + GROUPED_LABEL_MARGIN)}px)`;
        // HACK: 'alignment-baseline' and 'dominant-baseline' are not supported in Edge and IE
        const dy = '0.6ex';

        return (
            <g style={transform ? {transform} : undefined}>
                {label.title ? <title>{label.title}</title> : undefined}
                <rect x={rectX} y={rectY}
                    width={width} height={height}
                    style={label.attributes.rect}
                />
                <text ref={this.onTextMount}
                    x={x} y={y} dy={dy}
                    textAnchor={textAnchor}
                    style={label.attributes.text}>
                    {label.text.value}
                </text>
            </g>
        );
    }

    private getLabelRectangle(width: number, height: number): Rect {
        const {x, y, textAnchor} = this.props;

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
        const {onBoundsUpdate} = this.props;
        onBoundsUpdate?.(undefined);
    }

    UNSAFE_componentWillReceiveProps(nextProps: LinkLabelProps) {
        this.shouldUpdateBounds = true;
    }

    componentDidUpdate(props: LinkLabelProps) {
        this.tryRecomputeBounds(this.props);
    }

    private tryRecomputeBounds(props: LinkLabelProps) {
        if (this.text && this.shouldUpdateBounds) {
            const {onBoundsUpdate} = this.props;
            this.shouldUpdateBounds = false;
            const bounds = this.text.getBBox();

            if (onBoundsUpdate) {
                const labelBounds = this.getLabelRectangle(bounds.width, bounds.height);
                onBoundsUpdate(labelBounds);
            }

            this.setState({
                width: bounds.width,
                height: bounds.height,
            });
        }
    }
}

class VertexTools extends React.Component<{
    className: string;
    model: DiagramLink;
    vertexIndex: number;
    vertexRadius: number;
    x: number;
    y: number;
    onRemove: (vertex: LinkVertex) => void;
}> {
    render() {
        const {className, vertexIndex, vertexRadius, x, y} = this.props;
        const transform = `translate(${x + 2 * vertexRadius},${y - 2 * vertexRadius})scale(${vertexRadius})`;
        return (
            <g className={className} transform={transform} onMouseDown={this.onRemoveVertex}>
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
        const {onRemove, model, vertexIndex} = this.props;
        onRemove(new LinkVertex(model, vertexIndex));
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
