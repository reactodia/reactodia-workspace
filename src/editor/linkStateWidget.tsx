import * as React from 'react';

import { EventObserver } from '../coreUtils/events';
import { Debouncer } from '../coreUtils/scheduler';

import { LinkModel } from '../data/model';

import { CanvasApi, useCanvas } from '../diagram/canvasApi';
import {
    Vector, boundsOf, computePolyline, getPointAlongPolyline, computePolylineLength,
    pathFromPolyline,
} from '../diagram/geometry';
import { TransformedSvgCanvas } from '../diagram/paper';
import { RenderingLayer } from '../diagram/renderingState';
import { Link } from '../diagram/elements';
import { HtmlSpinner } from '../diagram/spinner';

import { type WorkspaceContext, useWorkspace } from '../workspace/workspaceContext';

import { AuthoringKind, AuthoringState } from './authoringState';
import { LinkValidation, ElementValidation } from './validation';

export interface LinkStateWidgetProps {
    /**
     * @default 5
     */
    linkLabelMargin?: number;
}

export function LinkStateWidget(props: LinkStateWidgetProps) {
    const workspace = useWorkspace();
    const {canvas} = useCanvas();
    return (
        <LinkStateWidgetInner {...props}
            workspace={workspace}
            canvas={canvas}
        />
    );
}

interface LinkStateWidgetInternalProps extends LinkStateWidgetProps {
    workspace: WorkspaceContext;
    canvas: CanvasApi;
}

const CLASS_NAME = 'reactodia-authoring-state';
const DEFAULT_LINK_LABEL_MARGIN = 5;

class LinkStateWidgetInner extends React.Component<LinkStateWidgetInternalProps> {
    private readonly listener = new EventObserver();
    private readonly delayedUpdate = new Debouncer();

    componentDidMount() {
        this.listenEvents();
    }

    componentWillUnmount() {
        this.listener.stopListening();
    }

    private listenEvents() {
        const {workspace: {model, editor}, canvas} = this.props;
        this.listener.listen(model.events, 'elementEvent',  ({data}) => {
            if (data.changePosition) {
                this.scheduleUpdate();
            }
        });
        this.listener.listen(model.events, 'linkEvent', ({data}) => {
            if (data.changeVertices) {
                this.scheduleUpdate();
            }
        });
        this.listener.listen(model.events, 'changeCells', this.scheduleUpdate);
        this.listener.listen(editor.events, 'changeAuthoringState', this.scheduleUpdate);
        this.listener.listen(editor.events, 'changeTemporaryState', this.scheduleUpdate);
        this.listener.listen(editor.events, 'changeValidationState', this.scheduleUpdate);
        this.listener.listen(
            canvas.renderingState.events, 'changeElementSize', this.scheduleUpdate
        );
        this.listener.listen(
            canvas.renderingState.events, 'changeLinkLabelBounds', this.scheduleUpdate
        );
        this.listener.listen(canvas.renderingState.events, 'syncUpdate', ({layer}) => {
            if (layer === RenderingLayer.Editor) {
                this.delayedUpdate.runSynchronously();
            }
        });
    }

    private scheduleUpdate = () => {
        this.delayedUpdate.call(this.performUpdate);
    };

    private performUpdate = () => {
        this.forceUpdate();
    };

    private calculateLinkPath(link: Link) {
        const polyline = this.calculatePolyline(link);
        return pathFromPolyline(polyline);
    }

    private calculatePolyline(link: Link) {
        const {workspace: {model}, canvas} = this.props;

        const source = model.getElement(link.sourceId)!;
        const target = model.getElement(link.targetId)!;

        const route = canvas.renderingState.getRouting(link.id);
        const verticesDefinedByUser = link.vertices || [];
        const vertices = route ? route.vertices : verticesDefinedByUser;

        return computePolyline(
            boundsOf(source, canvas.renderingState),
            boundsOf(target, canvas.renderingState),
            vertices
        );
    }

    private renderLinkStateLabels() {
        const {workspace: {model, editor}} = this.props;

        const rendered: JSX.Element[] = [];
        for (const link of model.links) {
            let renderedState: JSX.Element | null = null;
            const state = editor.authoringState.links.get(link.data);
            if (state) {
                const onCancel = () => editor.discardChange(state);

                let statusText: string;
                let title: string;

                if (state.deleted) {
                    statusText = 'Delete';
                    title = 'Revert deletion of the link';
                } else if (!state.before) {
                    statusText = 'New';
                    title = 'Revert creation of the link';
                } else {
                    statusText = 'Change';
                    title = 'Revert all changes in properties of the link';
                }

                if (statusText && title) {
                    renderedState = (
                        <span>
                            <span className={`${CLASS_NAME}__state-label`}>{statusText}</span>
                            [<span className={`${CLASS_NAME}__state-cancel`}
                                onClick={onCancel} title={title}>cancel</span>]
                        </span>
                    );
                }
            }

            const renderedErrors = this.renderLinkErrors(link.data);
            if (renderedState || renderedErrors) {
                const labelPosition = this.getLinkStateLabelPosition(link);
                if (labelPosition) {
                    const style = {left: labelPosition.x, top: labelPosition.y};
                    rendered.push(
                        <div key={link.id}
                            className={`${CLASS_NAME}__state-indicator`}
                            style={style}>
                            <div className={`${CLASS_NAME}__state-indicator-container`}>
                                <div className={`${CLASS_NAME}__state-indicator-body`}>
                                    {renderedState}
                                    {renderedErrors}
                                </div>
                            </div>
                        </div>
                    );
                }
            }
        }

        return rendered;
    }

    private renderLinkStateHighlighting() {
        const {workspace: {model, editor}} = this.props;
        const rendered: JSX.Element[] = [];
        for (const link of model.links) {
            if (editor.temporaryState.links.has(link.data)) {
                const path = this.calculateLinkPath(link);
                rendered.push(
                    <path key={link.id}
                        d={path} fill='none' stroke='grey'
                        strokeWidth={5} strokeOpacity={0.5} strokeDasharray='8 8'
                    />
                );
            } else {
                const event = editor.authoringState.links.get(link.data);
                const isDeletedLink = AuthoringState.isDeletedLink(editor.authoringState, link.data);
                const isUncertainLink = AuthoringState.isUncertainLink(editor.authoringState, link.data);
                if (event || isDeletedLink || isUncertainLink) {
                    const path = this.calculateLinkPath(link);
                    let color: string | undefined;
                    if (isDeletedLink) {
                        color = 'red';
                    } else if (isUncertainLink) {
                        color = 'blue';
                    } else if (event && event.type === AuthoringKind.ChangeLink) {
                        color = event.before ? 'blue' : 'green';
                    }
                    rendered.push(
                        <path key={link.id}
                            d={path} fill={'none'} stroke={color}
                            strokeWidth={5} strokeOpacity={0.5}
                        />
                    );
                }
            }
        }
        return rendered;
    }

    private getLinkStateLabelPosition(link: Link): Vector {
        const {
            canvas,
            linkLabelMargin = DEFAULT_LINK_LABEL_MARGIN,
        } = this.props;
        const labelBounds = canvas.renderingState.getLinkLabelBounds(link);
        if (labelBounds) {
            const {x, y} = labelBounds;
            return {x, y: y - linkLabelMargin / 2};
        } else {
            const polyline = this.calculatePolyline(link);
            const polylineLength = computePolylineLength(polyline);
            return getPointAlongPolyline(polyline, polylineLength / 2);
        }
    }

    private renderLinkErrors(linkModel: LinkModel) {
        const {workspace: {editor}} = this.props;
        const {validationState} = editor;

        const validation = validationState.links.get(linkModel);
        if (!validation) {
            return null;
        }
        const title = validation.errors.map(error => error.message).join('\n');

        return this.renderErrorIcon(title, validation);
    }

    private renderErrorIcon(title: string, validation: LinkValidation | ElementValidation): JSX.Element {
        return <div className={`${CLASS_NAME}__item-error`} title={title}>
            {validation.loading
                ? <HtmlSpinner width={15} height={17} />
                : <div className={`${CLASS_NAME}__item-error-icon`} />}
            {(!validation.loading && validation.errors.length > 0)
                ? validation.errors.length : undefined}
        </div>;
    }

    render() {
        const {workspace: {editor}, canvas} = this.props;
        const transform = canvas.metrics.getTransform();
        const {scale, originX, originY} = transform;
        if (!editor.inAuthoringMode) {
            return null;
        }
        const htmlTransformStyle: React.CSSProperties = {
            position: 'absolute', left: 0, top: 0,
            transform: `scale(${scale},${scale})translate(${originX}px,${originY}px)`,
        };
        return <div className={`${CLASS_NAME}`}>
            <TransformedSvgCanvas paperTransform={transform}
                style={{overflow: 'visible', pointerEvents: 'none'}}>
                {this.renderLinkStateHighlighting()}
            </TransformedSvgCanvas>
            <div className={`${CLASS_NAME}__validation-layer`} style={htmlTransformStyle}>
                {this.renderLinkStateLabels()}
            </div>
        </div>;
    }
}
