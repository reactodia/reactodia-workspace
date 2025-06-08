import * as React from 'react';

import { mapAbortedToNull } from '../../coreUtils/async';
import { EventObserver } from '../../coreUtils/events';

import { MetadataCanConnect } from '../../data/metadataProvider';
import { ElementModel, ElementTypeIri, LinkTypeIri } from '../../data/model';
import { PlaceholderEntityType, PlaceholderRelationType } from '../../data/schema';

import { CanvasApi, useCanvas } from '../../diagram/canvasApi';
import { Element, VoidElement } from '../../diagram/elements';
import { SizeProvider, Vector, boundsOf, findElementAtPoint } from '../../diagram/geometry';
import { LinkLayer, LinkMarkers } from '../../diagram/linkLayer';
import { SvgPaperLayer } from '../../diagram/paper';
import type { MutableRenderingState } from '../../diagram/renderingState';
import { Spinner } from '../../diagram/spinner';

import { TemporaryState } from '../../editor/authoringState';
import { EntityElement, RelationLink } from '../../editor/dataElements';

import { VisualAuthoringTopic } from '../../workspace/commandBusTopic';
import { type WorkspaceContext, useWorkspace } from '../../workspace/workspaceContext';

export interface DragEditLayerProps {
    operation: DragEditOperation;
    onFinishEditing: () => void;
}

/**
 * Describes a graph authoring operation from dragging a link endpoint.
 */
export type DragEditOperation = DragEditConnect | DragEditMoveEndpoint;

/**
 * Graph authoring operation to connect an entity element with some other element.
 */
export interface DragEditConnect {
    /**
     * Graph authoring drag operation type.
     */
    readonly mode: 'connect';
    /**
     * Target entity element to drag a relation link from.
     */
    readonly source: EntityElement;
    /**
     * Restrict the created relation to have only the specified type.
     */
    readonly linkType?: LinkTypeIri;
    /**
     * Initial position for the dragged link endpoint on paper.
     */
    readonly point: Vector;
}

/**
 * Graph authoring operation to move relation link endpoint to another element.
 */
export interface DragEditMoveEndpoint {
    /**
     * Graph authoring drag operation type.
     */
    readonly mode: 'moveSource' | 'moveTarget';
    /**
     * Target relation link to drag an endpoint of.
     */
    readonly link: RelationLink;
    /**
     * Initial position for the dragged link endpoint on paper.
     */
    readonly point: Vector;
}

export function DragEditLayer(props: DragEditLayerProps) {
    const workspace = useWorkspace();
    const {canvas} = useCanvas();
    return (
        <DragEditLayerInner {...props}
            workspace={workspace}
            canvas={canvas}
        />
    );
}

interface DragEditLayerInnerProps extends DragEditLayerProps {
    workspace: WorkspaceContext;
    canvas: CanvasApi;
}

interface State {
    targetElement?: Element;
    connectionsToAny?: ReadonlyArray<MetadataCanConnect>;
    connectionsToTarget?: ReadonlyArray<MetadataCanConnect>;
    waitingForMetadata?: boolean;
}

const CLASS_NAME = 'reactodia-drag-edit-layer';

class DragEditLayerInner extends React.Component<DragEditLayerInnerProps, State> {
    private readonly listener = new EventObserver();
    private cancellation = new AbortController();
    private canDropOnElementCancellation = new AbortController();

    private temporaryLink: RelationLink | undefined;
    private temporaryElement: VoidElement | undefined;
    private oldLink: RelationLink | undefined;

    constructor(props: DragEditLayerInnerProps) {
        super(props);
        this.state = {};
    }

    componentDidMount() {
        const {operation} = this.props;

        this.cancellation = new AbortController();

        switch (operation.mode) {
            case 'connect': {
                this.beginCreatingLink(operation);
                break;
            }
            case 'moveSource':
            case 'moveTarget': {
                this.beginMovingLink(operation);
                break;
            }
            default: {
                throw new Error(`Unknown edit mode: "${(operation as DragEditOperation).mode}"`);
            }
        }

        this.forceUpdate();
        this.queryCanConnectToAny();

        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.cancellation.abort();
        this.canDropOnElementCancellation.abort();
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
        this.cleanup();
    }

    private beginCreatingLink(operation: DragEditConnect) {
        const {workspace: {model, editor}} = this.props;
        const {source, linkType, point} = operation;

        const batch = model.history.startBatch();

        const temporaryElement = this.createTemporaryElement(point);
        const linkTemplate = new RelationLink({
            sourceId: source.id,
            targetId: temporaryElement.id,
            data: {
                linkTypeId: linkType ?? PlaceholderRelationType,
                sourceId: source.iri,
                targetId: '',
                properties: {},
            },
        });
        const temporaryLink = editor.createRelation(linkTemplate, {temporary: true});
        model.setLinkVisibility(PlaceholderRelationType, 'withoutLabel');

        batch.discard();

        this.temporaryElement = temporaryElement;
        this.temporaryLink = temporaryLink;
    }

    private beginMovingLink(operation: DragEditMoveEndpoint) {
        const {workspace: {model, editor}} = this.props;
        const {mode, link, point} = operation;

        const batch = model.history.startBatch();

        this.oldLink = link;
        model.removeLink(link.id);
        const {sourceId, targetId, data, vertices, linkState} = link;

        const temporaryElement = this.createTemporaryElement(point);
        const linkTemplate = new RelationLink({
            sourceId: mode === 'moveSource' ? temporaryElement.id : sourceId,
            targetId: mode === 'moveTarget' ? temporaryElement.id : targetId,
            data: {
                ...data,
                sourceId: mode === 'moveSource' ? '' : data.sourceId,
                targetId: mode === 'moveTarget' ? '' : data.targetId,
            },
            vertices,
            linkState,
        });
        const temporaryLink = editor.createRelation(linkTemplate, {temporary: true});

        batch.discard();

        this.temporaryElement = temporaryElement;
        this.temporaryLink = temporaryLink;
    }

    private createTemporaryElement(point: Vector) {
        const {workspace: {model}} = this.props;
        const temporaryElement = new VoidElement({});
        temporaryElement.setPosition(point);
        model.addElement(temporaryElement);
        return temporaryElement;
    }

    private onMouseMove = (e: MouseEvent) => {
        const {workspace: {model}, canvas} = this.props;
        const {targetElement, waitingForMetadata} = this.state;

        e.preventDefault();
        e.stopPropagation();

        if (waitingForMetadata) { return; }

        const point = canvas.metrics.pageToPaperCoords(e.pageX, e.pageY);
        this.temporaryElement!.setPosition(point);

        const newTargetElement = findElementAtPoint(model.elements, point, canvas.renderingState);

        if (newTargetElement !== targetElement) {
            this.queryCanDropOnElement(newTargetElement);
        }
        this.setState({targetElement: newTargetElement});
    };

    private queryCanConnectToAny() {
        const {workspace: {model, editor}} = this.props;

        if (!editor.metadataProvider) {
            this.setState({connectionsToAny: []});
            return;
        }

        this.setState({connectionsToAny: undefined});

        const link = this.temporaryLink!;
        const source = model.getElement(link.sourceId) as EntityElement;
        mapAbortedToNull(
            editor.metadataProvider.canConnect(
                source.data,
                undefined,
                link.data.linkTypeId === PlaceholderRelationType
                    ? undefined : link.data.linkTypeId,
                {signal: this.cancellation.signal}
            ),
            this.cancellation.signal
        ).then(
            connections => {
                if (connections === null) { return; }
                this.setState({connectionsToAny: connections});
            },
            error => {
                console.error('Error calling MetadataProvider.canConnect() without target', error);
                this.setState({connectionsToAny: []});
            }
        );
    }

    private queryCanDropOnElement(targetElement: Element | undefined) {
        const {operation, workspace: {model, editor}} = this.props;

        this.canDropOnElementCancellation.abort();
        this.canDropOnElementCancellation = new AbortController();

        if (!(editor.metadataProvider && targetElement instanceof EntityElement)) {
            this.setState({connectionsToTarget: []});
            return;
        }

        const targetEvent = editor.authoringState.elements.get(targetElement.iri);
        if (targetEvent && targetEvent.type === 'entityDelete') {
            this.setState({connectionsToTarget: []});
            return;
        }

        this.setState({connectionsToTarget: undefined});

        const link = this.temporaryLink!;
        let source: ElementModel;
        let target: ElementModel;
        switch (operation.mode) {
            case 'connect':
            case 'moveTarget': {
                source = (model.getElement(link.sourceId) as EntityElement).data;
                target = targetElement.data;
                break;
            }
            case 'moveSource': {
                source = targetElement.data;
                target = (model.getElement(link.targetId) as EntityElement).data;
                break;
            }
        }

        const signal = this.canDropOnElementCancellation.signal;
        mapAbortedToNull(
            editor.metadataProvider.canConnect(
                source,
                target,
                link.data.linkTypeId === PlaceholderRelationType
                    ? undefined : link.data.linkTypeId,
                {signal}
            ),
            signal
        ).then(
            connections => {
                if (connections === null) { return; }
                this.setState({connectionsToTarget: connections});
            },
            error => {
                console.error('Error calling MetadataProvider.canConnect() with target', error);
                this.setState({connectionsToAny: []});
            }
        );
    }

    private onMouseUp = (e: MouseEvent) => {
        const {canvas} = this.props;
        if (this.state.waitingForMetadata) { return; }
        // show spinner while waiting for additional MetadataApi queries
        this.setState({waitingForMetadata: true});
        const selectedPosition = canvas.metrics.pageToPaperCoords(e.pageX, e.pageY);
        this.executeEditOperation(selectedPosition);
    };

    private async executeEditOperation(selectedPosition: Vector): Promise<void> {
        const {operation, canvas, workspace: {model, editor, getCommandBus}} = this.props;

        try {
            const {targetElement, connectionsToAny, connectionsToTarget} = this.state;

            const batch = model.history.startBatch();
            const restoredLink = this.restoreOldLink();
            batch.discard();

            const allowedConnections = targetElement ? connectionsToTarget : connectionsToAny;
            if (allowedConnections && allowedConnections.length > 0) {
                let modifiedLink: RelationLink | undefined;
                let createdTarget = targetElement as EntityElement | undefined;

                switch (operation.mode) {
                    case 'connect': {
                        if (!createdTarget) {
                            createdTarget = await this.createNewElement(allowedConnections);
                            createdTarget.setPosition(selectedPosition);
                            canvas.renderingState.syncUpdate();
                            setElementCenterAtPoint(createdTarget, selectedPosition, canvas.renderingState);
                        }
                        const sourceElement = model.getElement(this.temporaryLink!.sourceId) as EntityElement;
                        modifiedLink = await this.createNewLink(sourceElement, createdTarget, allowedConnections);
                        break;
                    }
                    case 'moveSource': {
                        modifiedLink = editor.moveRelationSource({
                            link: restoredLink!,
                            newSource: targetElement as EntityElement,
                        });
                        break;
                    }
                    case 'moveTarget': {
                        modifiedLink = editor.moveRelationTarget({
                            link: restoredLink!,
                            newTarget: targetElement as EntityElement,
                        });
                        break;
                    }
                    default: {
                        throw new Error('Unknown edit mode');
                    }
                }

                if (targetElement) {
                    const focusedLink = modifiedLink || restoredLink;
                    model.setSelection([focusedLink!]);
                    getCommandBus(VisualAuthoringTopic)
                        .trigger('editRelation', {target: focusedLink!});
                } else if (createdTarget && modifiedLink) {
                    model.setSelection([createdTarget]);
                    const source = model.getElement(modifiedLink.sourceId) as EntityElement;
                    getCommandBus(VisualAuthoringTopic)
                        .trigger('findOrCreateEntity', {
                            link: modifiedLink,
                            source,
                            target: createdTarget,
                            targetIsNew: true,
                        });
                }
            }
        } finally {
            this.cleanupAndFinish();
        }
    }

    private async createNewElement(
        connections: readonly MetadataCanConnect[]
    ): Promise<EntityElement> {
        const {workspace: {editor}} = this.props;
        if (!editor.metadataProvider) {
            throw new Error('Cannot create new element without metadata provider');
        }
        const elementTypes = new Set<ElementTypeIri>();
        for (const {targetTypes} of connections) {
            for (const typeIri of targetTypes) {
                elementTypes.add(typeIri);
            }
        }
        const selectedType = elementTypes.size === 1 ? Array.from(elementTypes)[0] : PlaceholderEntityType;
        const elementModel = await editor.metadataProvider.createEntity(
            selectedType,
            {signal: this.cancellation.signal}
        );
        return editor.createEntity(elementModel, {temporary: true});
    }

    private async createNewLink(
        source: EntityElement,
        target: EntityElement,
        connections: readonly MetadataCanConnect[]
    ): Promise<RelationLink | undefined> {
        const {workspace: {model, editor}} = this.props;
        if (!editor.metadataProvider) {
            return undefined;
        }

        const inLinkSet = new Set<LinkTypeIri>();
        const outLinkSet = new Set<LinkTypeIri>();
        for (const {targetTypes, inLinks, outLinks} of connections) {
            if (target.data.types.some(type => targetTypes.has(type))) {
                for (const linkType of inLinks) {
                    inLinkSet.add(linkType);
                }
                for (const linkType of outLinks) {
                    outLinkSet.add(linkType);
                }
            }
        }

        const singleInLink = inLinkSet.size === 1 ? [...inLinkSet][0] : undefined;
        const singleOutLink = outLinkSet.size === 1 ? [...outLinkSet][0] : undefined;

        let linkTypeIri: LinkTypeIri;
        let direction: 'in' | 'out';
        if (inLinkSet.size === 0 && singleOutLink) {
            linkTypeIri = singleOutLink;
            direction = 'out';
        } else if (singleInLink && outLinkSet.size === 0) {
            linkTypeIri = singleInLink;
            direction = 'in';
        } else if (singleInLink && singleOutLink && singleInLink === singleOutLink) {
            linkTypeIri = singleOutLink;
            direction = model.findLink(linkTypeIri, source.id, target.id) ? 'in' : 'out';
        } else {
            linkTypeIri = PlaceholderRelationType;
            direction = 'out';
        }

        let [effectiveSource, effectiveTarget] = [source, target];
        // switches source and target if the direction equals 'in'
        if (direction === 'in') {
            [effectiveSource, effectiveTarget] = [effectiveTarget, effectiveSource];
        }
        const data = await editor.metadataProvider.createRelation(
            effectiveSource.data,
            effectiveTarget.data,
            linkTypeIri,
            {signal: this.cancellation.signal}
        );
        const link = new RelationLink({
            sourceId: effectiveSource.id,
            targetId: effectiveTarget.id,
            data,
        });
        const existingLink = model.findLink(link.typeId, link.sourceId, link.targetId);
        return existingLink instanceof RelationLink
            ? existingLink : editor.createRelation(link, {temporary: true});
    }

    private cleanupAndFinish() {
        const {onFinishEditing} = this.props;
        this.cleanup();
        onFinishEditing();
    }

    private cleanup() {
        const {workspace: {model, editor}} = this.props;

        const batch = model.history.startBatch();
        model.removeElement(this.temporaryElement!.id);
        model.removeLink(this.temporaryLink!.id);
        editor.setTemporaryState(
            TemporaryState.removeRelation(editor.temporaryState, this.temporaryLink!.data)
        );
        this.restoreOldLink();
        batch.discard();
    }

    private restoreOldLink(): RelationLink | undefined {
        const {workspace: {model}} = this.props;
        const restoredLink = this.oldLink;
        this.oldLink = undefined;
        if (restoredLink) {
            model.addLink(restoredLink);
        }
        return restoredLink;
    }

    render() {
        const {workspace: {model}, canvas} = this.props;
        const {waitingForMetadata} = this.state;

        if (!this.temporaryLink) {
            return null;
        }

        const transform = canvas.metrics.getTransform();
        const renderingState = canvas.renderingState as MutableRenderingState;
        return (
            <SvgPaperLayer paperTransform={transform}
                className={CLASS_NAME}>
                <LinkMarkers renderingState={renderingState} />
                {this.renderHighlight()}
                {this.renderCanDropIndicator()}
                {waitingForMetadata ? null : (
                    <LinkLayer model={model}
                        renderingState={renderingState}
                        shouldRenderLink={link => link === this.temporaryLink}
                    />
                )}
            </SvgPaperLayer>
        );
    }

    private renderHighlight() {
        const {canvas} = this.props;
        const {targetElement, connectionsToTarget, waitingForMetadata} = this.state;

        if (!targetElement) { return null; }

        const {x, y, width, height} = boundsOf(targetElement, canvas.renderingState);

        if (connectionsToTarget === undefined || waitingForMetadata) {
            return (
                <g transform={`translate(${x},${y})`}>
                    <rect className={`${CLASS_NAME}__highlight-overlay`}
                        width={width}
                        height={height}
                    />
                    <Spinner size={30}
                        position={{x: width / 2, y: height / 2}}
                    />
                </g>
            );
        }

        const allowToConnect = connectionsToTarget && connectionsToTarget.length > 0;
        return (
            <rect
                className={
                    allowToConnect
                        ? `${CLASS_NAME}__highlight-allow`
                        : `${CLASS_NAME}__highlight-deny`
                }
                x={x} y={y}
                width={width}
                height={height}
            />
        );
    }

    private renderCanDropIndicator() {
        const {targetElement, connectionsToAny, waitingForMetadata} = this.state;

        if (targetElement) { return null; }

        const {x, y} = this.temporaryElement!.position;

        let indicator: React.ReactElement<any>;
        if (connectionsToAny === undefined) {
            indicator = <Spinner size={1.2} position={{x: 0.5, y: -0.5}} />;
        } else if (connectionsToAny.length > 0) {
            indicator = (
                <path className={`${CLASS_NAME}__drop-allow`}
                    d='M0.5,0 L0.5,-1 M0,-0.5 L1,-0.5'
                    strokeWidth={0.2}
                />
            );
        } else {
            indicator = (
                <g className={`${CLASS_NAME}__drop-deny`}>
                    <circle cx='0.5' cy='-0.5' r='0.5' fill='none' strokeWidth={0.2} />
                    <path d='M0.5,0 L0.5,-1' strokeWidth={0.2} transform='rotate(-45 0.5 -0.5)' />
                </g>
            );
        }

        return (
            <g transform={`translate(${x} ${y})scale(40)`}>
                <rect className={`${CLASS_NAME}__drop-underlay`}
                    x={-0.5} y={-0.5}
                    width={1} height={1}
                    rx={0.25} ry={0.25}
                />
                {waitingForMetadata
                    ? <Spinner size={0.8} />
                    : <g transform={`translate(${0.5}, -${0.5})scale(${0.25})`}>{indicator}</g>}
            </g>
        );
    }
}

function setElementCenterAtPoint(
    element: Element,
    point: Vector,
    sizeProvider: SizeProvider
): void {
    const {width, height} = sizeProvider.getElementSize(element) ?? {width: 0, height: 0};
    element.setPosition({
        x: point.x - width / 2,
        y: point.y - height / 2,
    });
}
