import * as React from 'react';

import { mapAbortedToNull } from '../../coreUtils/async';
import { EventObserver } from '../../coreUtils/events';

import { CanvasApi, useCanvas } from '../../diagram/canvasApi';
import { Element, Link, VoidElement } from '../../diagram/elements';
import { Vector, boundsOf, findElementAtPoint } from '../../diagram/geometry';
import { LinkLayer, LinkMarkers } from '../../diagram/linkLayer';
import { DiagramModel } from '../../diagram/model';
import { SvgPaperLayer } from '../../diagram/paper';
import { CanvasPlaceAt } from '../../diagram/placeLayer';
import type { MutableRenderingState } from '../../diagram/renderingState';
import { Spinner } from '../../diagram/spinner';

export interface DragLinkMoverProps {
    operation: DragLinkOperation;

    createLink: (
        source: Element,
        target: Element,
        original: Link | undefined
    ) => Link;

    canConnect: (
        source: Element,
        link: Link,
        target: Element | undefined,
        signal: AbortSignal
    ) => Promise<DragLinkConnection>;

    cleanupLink?: (link: Link) => void;

    onFinish?: () => void;
}

/**
 * Describes a drag operation on a graph link (edge).
 */
export type DragLinkOperation = DragLinkOperationConnect | DragLinkOperationMove;

/**
 * Drag operation to connect an element with some other element.
 */
export interface DragLinkOperationConnect {
    /**
     * Drag link operation type.
     */
    readonly mode: 'connect';
    /**
     * Target element to drag a link from.
     */
    readonly source: Element;
    /**
     * Initial position for the dragged link endpoint on paper.
     */
    readonly point: Vector;

}

/**
 * Drag operation to move link endpoint to another element.
 */
export interface DragLinkOperationMove {
    /**
     * Drag link operation type.
     */
    readonly mode: 'moveSource' | 'moveTarget';
    /**
     * Target relation link to drag an endpoint of.
     */
    readonly link: Link;
    /**
     * Initial position for the dragged link endpoint on paper.
     */
    readonly point: Vector;
}

export interface DragLinkConnection {
    readonly allowed: boolean;

    connect(
        source: Element,
        target: Element | undefined,
        targetPosition: Vector,
        canvas: CanvasApi,
        signal: AbortSignal
    ): Promise<void>;

    moveSource(
        link: Link,
        newSource: Element,
        canvas: CanvasApi,
        signal: AbortSignal
    ): Promise<void>;

    moveTarget(
        link: Link,
        newTarget: Element,
        canvas: CanvasApi,
        signal: AbortSignal
    ): Promise<void>;
}

export function DragLinkMover(props: DragLinkMoverProps) {
    const {canvas, model} = useCanvas();
    return (
        <CanvasPlaceAt layer='overElements'>
            <DragLinkMoverInner {...props}
                model={model}
                canvas={canvas}
            />
        </CanvasPlaceAt>
    );
}

interface DragLinkMoverInnerProps extends DragLinkMoverProps {
    model: DiagramModel;
    canvas: CanvasApi;
}

interface State {
    targetElement?: Element;
    anyConnection?: DragLinkConnection;
    targetConnection?: DragLinkConnection;
    waitingForMetadata?: boolean;
}

const CLASS_NAME = 'reactodia-drag-link-mover';

const NO_CONNECTION: DragLinkConnection = {
    allowed: false,
    connect: () => Promise.resolve(),
    moveSource: () => Promise.resolve(),
    moveTarget: () => Promise.resolve(),
};

class DragLinkMoverInner extends React.Component<DragLinkMoverInnerProps, State> {
    private readonly listener = new EventObserver();
    private cancellation = new AbortController();
    private canDropOnElementCancellation = new AbortController();

    private temporaryLink: Link | undefined;
    private temporaryElement: VoidElement | undefined;
    private oldLink: Link | undefined;

    constructor(props: DragLinkMoverInnerProps) {
        super(props);
        this.state = {};
    }

    componentDidMount() {
        const {canvas, operation} = this.props;

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
                throw new Error(`Unknown edit mode: "${(operation as DragLinkOperation).mode}"`);
            }
        }

        this.forceUpdate();
        this.queryCanConnectToAny();

        this.listener.listen(canvas.events, 'changeTransform', () => this.forceUpdate());
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

    private beginCreatingLink(operation: DragLinkOperationConnect) {
        const {createLink, model} = this.props;
        const {source, point} = operation;

        const batch = model.history.startBatch();

        const temporaryElement = this.createTemporaryElement(point);
        const temporaryLink = createLink(source, temporaryElement, undefined);

        batch.discard();

        this.temporaryElement = temporaryElement;
        this.temporaryLink = temporaryLink;
    }

    private beginMovingLink(operation: DragLinkOperationMove) {
        const {createLink, model} = this.props;
        const {link, point} = operation;

        const batch = model.history.startBatch();

        this.oldLink = link;
        model.removeLink(link.id);

        const temporaryElement = this.createTemporaryElement(point);
        const temporaryLink = operation.mode === 'moveSource'
            ? createLink(temporaryElement, model.targetOf(link)!, link)
            : createLink(model.sourceOf(link)!, temporaryElement, link);

        batch.discard();

        this.temporaryElement = temporaryElement;
        this.temporaryLink = temporaryLink;
    }

    private createTemporaryElement(point: Vector) {
        const {model} = this.props;
        const temporaryElement = new VoidElement({});
        temporaryElement.setPosition(point);
        model.addElement(temporaryElement);
        return temporaryElement;
    }

    private onMouseMove = (e: MouseEvent) => {
        const {model, canvas} = this.props;
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
        const {canConnect, model} = this.props;

        this.setState({anyConnection: undefined});

        const link = this.temporaryLink!;
        const source = model.getElement(link.sourceId)!;
        mapAbortedToNull(
            canConnect(
                source,
                link,
                undefined,
                this.cancellation.signal
            ),
            this.cancellation.signal
        ).then(
            connection => {
                if (connection === null) { return; }
                this.setState({anyConnection: connection});
            },
            error => {
                console.error('Error calling canConnect() without target', error);
                this.setState({anyConnection: NO_CONNECTION});
            }
        );
    }

    private queryCanDropOnElement(targetElement: Element | undefined) {
        const {operation, canConnect, model} = this.props;

        this.canDropOnElementCancellation.abort();
        this.canDropOnElementCancellation = new AbortController();

        if (!targetElement) {
            this.setState({targetConnection: NO_CONNECTION});
            return;
        }

        this.setState({targetConnection: undefined});

        const link = this.temporaryLink;
        let source: Element | undefined;
        let target: Element | undefined;
        switch (operation.mode) {
            case 'connect':
            case 'moveTarget': {
                source = link ? model.getElement(link.sourceId) : undefined;
                target = targetElement;
                break;
            }
            case 'moveSource': {
                source = targetElement;
                target = link ? model.getElement(link.targetId) : undefined;
                break;
            }
        }

        if (!(source && target && link)) {
            this.setState({targetConnection: NO_CONNECTION});
            return;
        }

        const signal = this.canDropOnElementCancellation.signal;
        mapAbortedToNull(
            canConnect(source, link, target, signal),
            signal
        ).then(
            connection => {
                if (connection === null) { return; }
                this.setState({targetConnection: connection});
            },
            error => {
                console.error('Error calling canConnect() with target', error);
                this.setState({targetConnection: NO_CONNECTION});
            }
        );
    }

    private onMouseUp = (e: MouseEvent) => {
        const {canvas} = this.props;
        if (this.state.waitingForMetadata) { return; }
        // show spinner while waiting for additional MetadataApi queries
        this.setState({waitingForMetadata: true});
        const selectedPosition = canvas.metrics.pageToPaperCoords(e.pageX, e.pageY);
        void this.executeEditOperation(selectedPosition);
    };

    private async executeEditOperation(selectedPosition: Vector): Promise<void> {
        const {operation, canvas, model} = this.props;

        try {
            const {targetElement, anyConnection, targetConnection} = this.state;

            const batch = model.history.startBatch();
            const restoredLink = this.restoreOldLink();
            batch.discard();

            const connection = targetElement ? targetConnection : anyConnection;
            if (connection?.allowed) {
                switch (operation.mode) {
                    case 'connect': {
                        await connection.connect(
                            operation.source,
                            targetElement,
                            selectedPosition,
                            canvas,
                            this.cancellation.signal
                        );
                        break;
                    }
                    case 'moveSource': {
                        await connection.moveSource(
                            restoredLink!,
                            targetElement!,
                            canvas,
                            this.cancellation.signal
                        );
                        break;
                    }
                    case 'moveTarget': {
                        await connection.moveTarget(
                            restoredLink!,
                            targetElement!,
                            canvas,
                            this.cancellation.signal
                        );
                        break;
                    }
                }
            }
        } finally {
            this.cleanupAndFinish();
        }
    }

    private cleanupAndFinish() {
        const {onFinish} = this.props;
        this.cleanup();
        onFinish?.();
    }

    private cleanup() {
        const {cleanupLink, model} = this.props;

        const batch = model.history.startBatch();
        model.removeElement(this.temporaryElement!.id);
        model.removeLink(this.temporaryLink!.id);
        cleanupLink?.(this.temporaryLink!);
        this.restoreOldLink();
        batch.discard();

        this.setState({waitingForMetadata: false});
    }

    private restoreOldLink(): Link | undefined {
        const {model} = this.props;
        const restoredLink = this.oldLink;
        this.oldLink = undefined;
        if (restoredLink) {
            model.addLink(restoredLink);
        }
        return restoredLink;
    }

    render() {
        const {model, canvas} = this.props;
        const {waitingForMetadata} = this.state;

        if (!this.temporaryLink) {
            return null;
        }

        const transform = canvas.metrics.getTransform();
        const renderingState = canvas.renderingState as MutableRenderingState;
        return (
            <SvgPaperLayer paperTransform={transform}
                className={CLASS_NAME}>
                <LinkMarkers model={model} renderingState={renderingState} />
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
        const {targetElement, targetConnection, waitingForMetadata} = this.state;

        if (!targetElement) { return null; }

        const {x, y, width, height} = boundsOf(targetElement, canvas.renderingState);

        if (targetConnection === undefined || waitingForMetadata) {
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

        return (
            <rect
                className={
                    targetConnection?.allowed
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
        const {targetElement, anyConnection, waitingForMetadata} = this.state;

        if (targetElement) { return null; }

        const {x, y} = this.temporaryElement!.position;

        let indicator: React.ReactElement<any>;
        if (anyConnection === undefined) {
            indicator = <Spinner size={1.2} position={{x: 0.5, y: -0.5}} />;
        } else if (anyConnection?.allowed) {
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
