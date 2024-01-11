import * as React from 'react';

import { mapAbortedToNull } from '../coreUtils/async';
import { EventObserver } from '../coreUtils/events';

import { ElementIri, ElementModel, LinkModel } from '../data/model';
import { GenerateID, PLACEHOLDER_ELEMENT_TYPE, PLACEHOLDER_LINK_TYPE } from '../data/schema';

import { CanvasApi, useCanvas } from '../diagram/canvasApi';
import { Element, Link, LinkDirection } from '../diagram/elements';
import { SizeProvider, Vector, boundsOf, findElementAtPoint } from '../diagram/geometry';
import { LinkLayer, LinkMarkers } from '../diagram/linkLayer';
import { TransformedSvgCanvas } from '../diagram/paper';
import { Spinner } from '../diagram/spinner';

import { type WorkspaceContext, useWorkspace } from '../workspace/workspaceContext';

import { TemporaryState } from './authoringState';

export type EditLayerMode = 'establishLink' | 'moveLinkSource' | 'moveLinkTarget';

export interface EditLayerProps {
    mode: EditLayerMode;
    target: Element | Link;
    point: { x: number; y: number };
    onFinishEditing: () => void;
}

export function EditLayer(props: EditLayerProps) {
    const workspace = useWorkspace();
    const {canvas} = useCanvas();
    return (
        <EditLayerInner {...props}
            workspace={workspace}
            canvas={canvas}
        />
    );
}

interface EditLayerInnerProps extends EditLayerProps {
    workspace: WorkspaceContext;
    canvas: CanvasApi;
}

interface State {
    targetElement?: Element;
    canLinkFrom?: boolean;
    canDropOnCanvas?: boolean;
    canDropOnElement?: boolean;
    waitingForMetadata?: boolean;
}

class EditLayerInner extends React.Component<EditLayerInnerProps, State> {
    private readonly listener = new EventObserver();
    private readonly cancellation = new AbortController();

    private canDropOnElementCancellation = new AbortController();

    private temporaryLink: Link | undefined;
    private temporaryElement: Element | undefined;
    private oldLink: Link | undefined;

    constructor(props: EditLayerInnerProps) {
        super(props);
        this.state = {};
    }

    componentDidMount() {
        const {mode, target, point} = this.props;
        if (mode === 'establishLink') {
            this.beginCreatingLink({source: target as Element, point});
        } else if (mode === 'moveLinkSource' || mode === 'moveLinkTarget') {
            this.beginMovingLink(target as Link, point);
        } else {
            throw new Error(`Unknown edit mode: "${mode as string}"`);
        }
        this.forceUpdate();
        this.queryCanLinkFrom();
        this.queryCanDropOnCanvas();
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.cancellation.abort();
        this.canDropOnElementCancellation.abort();
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
    }

    private beginCreatingLink(params: { source: Element; point: Vector }) {
        const {workspace: {model, editor}} = this.props;
        const {source, point} = params;

        const temporaryElement = this.createTemporaryElement(point);
        const linkTemplate = new Link({
            sourceId: source.id,
            targetId: temporaryElement.id,
            data: {
                linkTypeId: PLACEHOLDER_LINK_TYPE,
                sourceId: source.iri,
                targetId: temporaryElement.iri,
                properties: {},
            },
        });
        const temporaryLink = editor.createNewLink({link: linkTemplate, temporary: true});
        const linkType = model.createLinkType(temporaryLink.typeId);
        linkType.setVisibility('withoutLabel');

        this.temporaryElement = temporaryElement;
        this.temporaryLink = temporaryLink;
    }

    private beginMovingLink(target: Link, startingPoint: Vector) {
        const {mode, workspace: {model, editor}} = this.props;

        if (!(mode === 'moveLinkSource' || mode === 'moveLinkTarget')) {
            throw new Error('Unexpected edit mode for moving link');
        }

        this.oldLink = target;
        model.removeLink(target.id);
        const {id, sourceId, targetId, data, vertices, linkState} = target;

        const temporaryElement = this.createTemporaryElement(startingPoint);
        const linkTemplate = new Link({
            id: GenerateID.forLink(),
            sourceId: mode === 'moveLinkSource' ? temporaryElement.id : sourceId,
            targetId: mode === 'moveLinkTarget' ? temporaryElement.id : targetId,
            data: {
                ...data,
                sourceId: mode === 'moveLinkSource' ? temporaryElement.iri : data.sourceId,
                targetId: mode === 'moveLinkTarget' ? temporaryElement.iri : data.targetId,
            },
            vertices,
            linkState,
        });
        const temporaryLink = editor.createNewLink({link: linkTemplate, temporary: true});

        this.temporaryElement = temporaryElement;
        this.temporaryLink = temporaryLink;
    }

    private createTemporaryElement(point: Vector) {
        const {workspace: {model}} = this.props;

        const temporaryElement = new Element({
            data: Element.placeholderData('' as ElementIri),
            temporary: true,
        });
        temporaryElement.setPosition(point);

        const batch = model.history.startBatch();
        model.addElement(temporaryElement);
        batch.discard();

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

    private queryCanLinkFrom() {
        const {workspace: {model, editor}} = this.props;

        if (!editor.metadataApi) {
            this.setState({canLinkFrom: false});
            return;
        }

        this.setState({canLinkFrom: undefined});

        const source = model.getElement(this.temporaryLink!.sourceId)!;
        mapAbortedToNull(
            editor.metadataApi.canLinkElement(source.data, this.cancellation.signal),
            this.cancellation.signal
        ).then(
            canLinkFrom => {
                if (canLinkFrom === null) { return; }
                this.setState({canLinkFrom});
            },
            error => {
                console.error('Error calling canLinkElement:', error);
                this.setState({canLinkFrom: false});
            }
        );
    }

    private queryCanDropOnCanvas() {
        const {mode, workspace: {model, editor}} = this.props;

        if (!editor.metadataApi || mode !== 'establishLink') {
            this.setState({canDropOnCanvas: false});
            return;
        }

        this.setState({canDropOnCanvas: undefined});

        const source = model.getElement(this.temporaryLink!.sourceId)!;
        mapAbortedToNull(
            editor.metadataApi.canDropOnCanvas(source.data, this.cancellation.signal),
            this.cancellation.signal
        ).then(
            canDropOnCanvas => {
                if (canDropOnCanvas === null) { return; }
                this.setState({canDropOnCanvas});
            },
            error => {
                console.error('Error calling canDropOnCanvas:', error);
                this.setState({canDropOnCanvas: false});
            }
        );
    }

    private queryCanDropOnElement(targetElement: Element | undefined) {
        const {mode, workspace: {model, editor}} = this.props;

        this.canDropOnElementCancellation.abort();
        this.canDropOnElementCancellation = new AbortController();

        if (!(editor.metadataApi && targetElement)) {
            this.setState({canDropOnElement: false});
            return;
        }

        const targetEvent = editor.authoringState.elements.get(targetElement.iri);
        if (targetEvent && targetEvent.deleted) {
            this.setState({canDropOnElement: false});
            return;
        }

        this.setState({canDropOnElement: undefined});

        let source!: ElementModel;
        let target!: ElementModel;

        if (mode === 'establishLink' || mode === 'moveLinkTarget') {
            source = model.getElement(this.temporaryLink!.sourceId)!.data;
            target = targetElement.data;
        } else if (mode === 'moveLinkSource') {
            source = targetElement.data;
            target = model.getElement(this.temporaryLink!.targetId)!.data;
        }

        const signal = this.canDropOnElementCancellation.signal;
        mapAbortedToNull(
            editor.metadataApi.canDropOnElement(source, target, signal),
            signal
        ).then(canDropOnElement => {
            if (canDropOnElement === null) { return; }
            this.setState({canDropOnElement});
        });
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
        const {mode, canvas, workspace: {model, editor, overlayController}} = this.props;

        try {
            const {targetElement, canLinkFrom, canDropOnCanvas, canDropOnElement} = this.state;

            if (this.oldLink) {
                model.addLink(this.oldLink);
            }

            const canDrop = targetElement ? canDropOnElement : canDropOnCanvas;
            if (canLinkFrom && canDrop) {
                let modifiedLink: Link | undefined;
                let createdTarget: Element | undefined = targetElement;

                switch (mode) {
                    case 'establishLink': {
                        if (!createdTarget) {
                            const source = model.getElement(this.temporaryLink!.sourceId)!;
                            createdTarget = await this.createNewElement(source.data);
                            createdTarget.setPosition(selectedPosition);
                            canvas.renderingState.syncUpdate();
                            setElementCenterAtPoint(createdTarget, selectedPosition, canvas.renderingState);
                        }
                        const sourceElement = model.getElement(this.temporaryLink!.sourceId)!;
                        modifiedLink = await this.createNewLink(sourceElement, createdTarget);
                        break;
                    }
                    case 'moveLinkSource': {
                        modifiedLink = editor.moveLinkSource({link: this.oldLink!, newSource: targetElement!});
                        break;
                    }
                    case 'moveLinkTarget': {
                        modifiedLink = editor.moveLinkTarget({link: this.oldLink!, newTarget: targetElement!});
                        break;
                    }
                    default: {
                        throw new Error('Unknown edit mode');
                    }
                }

                if (targetElement) {
                    const focusedLink = modifiedLink || this.oldLink;
                    editor.setSelection([focusedLink!]);
                    overlayController.showEditLinkForm(focusedLink!);
                } else if (createdTarget && modifiedLink) {
                    editor.setSelection([createdTarget]);
                    const source = model.getElement(modifiedLink.sourceId)!;
                    overlayController.showFindOrCreateEntityForm({
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

    private async createNewElement(source: ElementModel): Promise<Element> {
        const {workspace: {editor}} = this.props;
        if (!editor.metadataApi) {
            throw new Error('Cannot create new element without MetadataApi');
        }
        const elementTypes = await editor.metadataApi.typesOfElementsDraggedFrom(source, this.cancellation.signal);
        const classId = elementTypes.length === 1 ? elementTypes[0] : PLACEHOLDER_ELEMENT_TYPE;
        const elementModel = await editor.metadataApi.generateNewElement([classId], this.cancellation.signal);
        return editor.createNewEntity({elementModel, temporary: true});
    }

    private async createNewLink(source: Element, target: Element): Promise<Link | undefined> {
        const {workspace: {model, editor}} = this.props;
        if (!editor.metadataApi) {
            return undefined;
        }
        const linkTypes = await mapAbortedToNull(
            editor.metadataApi.possibleLinkTypes(source.data, target.data, this.cancellation.signal),
            this.cancellation.signal
        );
        if (linkTypes === null) { return undefined; }
        const placeholder = {linkTypeIri: PLACEHOLDER_LINK_TYPE, direction: LinkDirection.out};
        const {linkTypeIri: typeId, direction} = linkTypes.length === 1 ? linkTypes[0] : placeholder;
        let data: LinkModel = {
            linkTypeId: typeId,
            sourceId: source.iri,
            targetId: target.iri,
            properties: {},
        };
        let [sourceId, targetId] = [source.id, target.id];
        // switches source and target if the direction equals 'in'
        if (direction === LinkDirection.in) {
            data = {
                ...data,
                sourceId: target.iri,
                targetId: source.iri,
            };
            [sourceId, targetId] = [targetId, sourceId];
        }
        const link = new Link({sourceId, targetId, data});
        const existingLink = model.findLink(link.typeId, link.sourceId, link.targetId);
        return existingLink || editor.createNewLink({link, temporary: true});
    }

    private cleanupAndFinish() {
        const {onFinishEditing, workspace: {model, editor}} = this.props;

        const batch = model.history.startBatch();
        model.removeElement(this.temporaryElement!.id);
        model.removeLink(this.temporaryLink!.id);
        editor.setTemporaryState(
            TemporaryState.deleteLink(editor.temporaryState, this.temporaryLink!.data)
        );
        batch.discard();

        onFinishEditing();
    }

    render() {
        const {workspace: {model}, canvas} = this.props;
        const {waitingForMetadata} = this.state;

        if (!this.temporaryLink) {
            return null;
        }

        const transform = canvas.metrics.getTransform();
        return (
            <TransformedSvgCanvas paperTransform={transform} style={{overflow: 'visible'}}>
                <LinkMarkers model={model}
                    renderingState={canvas.renderingState}
                />
                {this.renderHighlight()}
                {this.renderCanDropIndicator()}
                {waitingForMetadata ? null : (
                    <LinkLayer model={model}
                        renderingState={canvas.renderingState}
                        links={[this.temporaryLink]}
                    />
                )}
            </TransformedSvgCanvas>
        );
    }

    private renderHighlight() {
        const {canvas} = this.props;
        const {targetElement, canLinkFrom, canDropOnElement, waitingForMetadata} = this.state;

        if (!targetElement) { return null; }

        const {x, y, width, height} = boundsOf(targetElement, canvas.renderingState);

        if (canLinkFrom === undefined || canDropOnElement === undefined || waitingForMetadata) {
            return (
                <g transform={`translate(${x},${y})`}>
                    <rect width={width} height={height} fill={'white'} fillOpacity={0.5} />
                    <Spinner size={30} position={{x: width / 2, y: height / 2}}/>
                </g>
            );
        }

        const stroke = (canLinkFrom && canDropOnElement) ? '#5cb85c' : '#c9302c';
        return (
            <rect x={x} y={y} width={width} height={height} fill={'transparent'} stroke={stroke} strokeWidth={3} />
        );
    }

    private renderCanDropIndicator() {
        const {targetElement, canLinkFrom, canDropOnCanvas, waitingForMetadata} = this.state;

        if (targetElement) { return null; }

        const {x, y} = this.temporaryElement!.position;

        let indicator: React.ReactElement<any>;
        if (canLinkFrom === undefined || canDropOnCanvas === undefined) {
            indicator = <Spinner size={1.2} position={{x: 0.5, y: -0.5}} />;
        } else if (canLinkFrom && canDropOnCanvas) {
            indicator = <path d='M0.5,0 L0.5,-1 M0,-0.5 L1,-0.5' strokeWidth={0.2} stroke='#5cb85c' />;
        } else {
            indicator = (
                <g>
                    <circle cx='0.5' cy='-0.5' r='0.5' fill='none' strokeWidth={0.2} stroke='#c9302c' />
                    <path d='M0.5,0 L0.5,-1' strokeWidth={0.2} stroke='#c9302c' transform='rotate(-45 0.5 -0.5)' />
                </g>
            );
        }

        return (
            <g transform={`translate(${x} ${y})scale(40)`}>
                <rect x={-0.5} y={-0.5} width={1} height={1} fill='rgba(0, 0, 0, 0.1)' rx={0.25} ry={0.25} />
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
