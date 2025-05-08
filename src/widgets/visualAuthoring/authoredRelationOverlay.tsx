import cx from 'clsx';
import * as React from 'react';

import { EventObserver } from '../../coreUtils/events';
import { Debouncer } from '../../coreUtils/scheduler';

import { LinkKey } from '../../data/model';
import type { ValidationSeverity } from '../../data/validationProvider';

import { CanvasApi, useCanvas } from '../../diagram/canvasApi';
import {
    Rect, Spline, Vector, computePolyline, getPointAlongPolyline, computePolylineLength,
} from '../../diagram/geometry';
import { TransformedSvgCanvas } from '../../diagram/paper';
import { RenderingLayer } from '../../diagram/renderingState';
import { Link } from '../../diagram/elements';
import { HtmlSpinner } from '../../diagram/spinner';

import { AuthoredRelation, AuthoringState } from '../../editor/authoringState';
import { RelationLink } from '../../editor/dataElements';
import { getMaxSeverity } from '../../editor/validation';

import { type WorkspaceContext, useWorkspace } from '../../workspace/workspaceContext';

export interface AuthoredRelationOverlayProps {
    /**
     * @default 5
     */
    linkLabelMargin?: number;
}

export function AuthoredRelationOverlay(props: AuthoredRelationOverlayProps) {
    const workspace = useWorkspace();
    const {canvas} = useCanvas();
    return (
        <LinkStateWidgetInner {...props}
            workspace={workspace}
            canvas={canvas}
        />
    );
}

interface AuthoredRelationOverlayInnerProps extends AuthoredRelationOverlayProps {
    workspace: WorkspaceContext;
    canvas: CanvasApi;
}

const CLASS_NAME = 'reactodia-authoring-state';
const DEFAULT_LINK_LABEL_MARGIN = 5;

class LinkStateWidgetInner extends React.Component<AuthoredRelationOverlayInnerProps> {
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
            if (layer === RenderingLayer.Overlay) {
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

    private calculateLinkPath(link: Link): string {
        const spline = this.calculateSpline(link);
        return spline.toPath();
    }

    private calculateSpline(link: Link): Spline {
        const {workspace: {model}, canvas} = this.props;

        const source = model.getElement(link.sourceId)!;
        const target = model.getElement(link.targetId)!;

        const template = canvas.renderingState.getLinkTemplates().get(link.typeId);

        const route = canvas.renderingState.getRouting(link.id);
        const verticesDefinedByUser = link.vertices || [];
        const vertices = route ? route.vertices : verticesDefinedByUser;

        const sourceShape = canvas.renderingState.getElementShape(source);
        const targetShape = canvas.renderingState.getElementShape(target);
        const points = computePolyline(sourceShape, targetShape, vertices);

        return Spline.create({
            type: template?.spline ?? Spline.defaultType,
            points,
            source: Rect.center(sourceShape.bounds),
            target: Rect.center(targetShape.bounds),
        });
    }

    private renderLinkStateLabels() {
        const {workspace: {model, editor}} = this.props;

        const rendered: React.ReactElement[] = [];
        for (const link of model.links) {
            if (!(link instanceof RelationLink)) {
                continue;
            }

            const state = editor.authoringState.links.get(link.data);
            const renderedState = this.renderLinkStatus(state);

            const renderedValidations = this.renderLinkValidations(link.data);
            if (renderedState || renderedValidations) {
                const labelPosition = this.getLinkStateLabelPosition(link);
                if (labelPosition) {
                    const style: React.CSSProperties = {left: labelPosition.x, top: labelPosition.y};
                    rendered.push(
                        <div key={link.id}
                            className={`${CLASS_NAME}__state-indicator`}
                            style={style}>
                            <div className={`${CLASS_NAME}__state-indicator-container`}>
                                <div className={`${CLASS_NAME}__state-indicator-body`}>
                                    {renderedState}
                                    {renderedValidations}
                                </div>
                            </div>
                        </div>
                    );
                }
            }
        }

        return rendered;
    }

    private renderLinkStatus(state: AuthoredRelation | undefined) {
        const {workspace: {editor, translation: t}} = this.props;

        if (!state) {
            return null;
        }

        return (
            <>
                <span className={`${CLASS_NAME}__state-label`}>
                    {(
                        state.type === 'relationAdd' ? t.text('authoring_state.relation_add.label') :
                        state.type === 'relationChange' ? t.text('authoring_state.relation_change.label') :
                        state.type === 'relationDelete' ? t.text('authoring_state.relation_delete.label') :
                        null
                    )}
                </span>
                <span className={`${CLASS_NAME}__action ${CLASS_NAME}__action-discard`}
                    onClick={() => editor.discardChange(state)}
                    title={t.text('authoring_state.relation_action_discard.title')}>
                    {t.text('authoring_state.relation_action_discard.label')}
                </span>
            </>
        );
    }

    private renderLinkStateHighlighting() {
        const {workspace: {model, editor}} = this.props;
        const rendered: React.ReactElement[] = [];
        for (const link of model.links) {
            if (!(link instanceof RelationLink)) {
                continue;
            }

            if (editor.temporaryState.links.has(link.data)) {
                const path = this.calculateLinkPath(link);
                rendered.push(
                    <path key={link.id}
                        className={`${CLASS_NAME}__link-temporary`}
                        d={path}
                    />
                );
            } else {
                const event = editor.authoringState.links.get(link.data);
                const isDeletedLink = AuthoringState.isDeletedRelation(editor.authoringState, link.data);
                const hasUncertainEndpoints = (
                    AuthoringState.hasEntityChangedIri(editor.authoringState, link.data.sourceId) ||
                    AuthoringState.hasEntityChangedIri(editor.authoringState, link.data.targetId)
                );
                if (event || isDeletedLink || hasUncertainEndpoints) {
                    const path = this.calculateLinkPath(link);
                    const className = (
                        isDeletedLink ? `${CLASS_NAME}__link-deleted` :
                        event?.type === 'relationAdd' ? `${CLASS_NAME}__link-added` :
                        event?.type === 'relationChange' ? `${CLASS_NAME}__link-changed` :
                        hasUncertainEndpoints ? `${CLASS_NAME}__link-uncertain` :
                        `${CLASS_NAME}__link-changed`
                    );
                    rendered.push(
                        <path key={link.id}
                            className={className}
                            d={path}
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
            const spline = this.calculateSpline(link);
            const polylineLength = computePolylineLength(spline.geometry.points);
            return getPointAlongPolyline(spline.geometry.points, polylineLength / 2);
        }
    }

    private renderLinkValidations(key: LinkKey): React.ReactElement | null {
        const {workspace: {editor}} = this.props;
        const {validationState} = editor;

        const validation = validationState.links.get(key);
        if (!validation) {
            return null;
        }

        const title = validation.items.map(item => item.message).join('\n');
        const severity = getMaxSeverity(validation.items);
        return (
            <div className={cx(`${CLASS_NAME}__item-validation`, getSeverityClass(severity))}
                title={title}>
                {validation.loading
                    ? <HtmlSpinner width={15} height={17} />
                    : <div className={`${CLASS_NAME}__item-validation-icon`} />}
                {(!validation.loading && validation.items.length > 0)
                    ? validation.items.length : undefined}
            </div>
        );
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

function getSeverityClass(severity: ValidationSeverity): string | undefined {
    switch (severity) {
        case 'info':
            return `${CLASS_NAME}--severity-info`;
        case 'warning':
            return `${CLASS_NAME}--severity-warning`;
        case 'error':
            return `${CLASS_NAME}--severity-error`;
        default:
            return undefined;
    }
}
