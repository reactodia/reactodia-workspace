import * as React from 'react';

import { mapAbortedToNull } from '../coreUtils/async';
import { EventObserver } from '../coreUtils/events';
import { useObservedProperty } from '../coreUtils/hooks';
import { Debouncer } from '../coreUtils/scheduler';

import { CanvasApi, CanvasContext } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';
import { Element, Link } from '../diagram/elements';
import {
    Vector, boundsOf, computePolyline, computePolylineLength, getPointAlongPolyline,
} from '../diagram/geometry';
import { HtmlSpinner } from '../diagram/spinner';

import { AuthoringState } from '../editor/authoringState';

import { WorkspaceContext } from '../workspace/workspaceContext';

export interface HaloLinkProps {
    /**
     * @default 20
     */
    buttonSize?: number;
    /**
     * @default 5
     */
    buttonMargin?: number;
}

export function HaloLink(props: HaloLinkProps) {
    const {canvas} = React.useContext(CanvasContext)!;
    const workspace = React.useContext(WorkspaceContext)!;
    const {editor} = workspace;

    const selection = useObservedProperty(
        editor.events,
        'changeSelection',
        () => editor.selection
    );

    if (editor.selection.length === 1) {
        const [target] = editor.selection;
        if (target instanceof Link) {
            return (
                <HaloLinkInner {...props}
                    target={target}
                    canvas={canvas}
                    workspace={workspace}
                />
            );
        }
    }
    return null;
}

defineCanvasWidget(HaloLink, element => ({element, attachment: 'overElements'}));

interface HaloLinkInnerProps extends HaloLinkProps {
    target: Link;
    canvas: CanvasApi;
    workspace: WorkspaceContext;
}

interface State {
    canDelete?: boolean;
    canEdit?: boolean;
}

const CLASS_NAME = 'ontodia-halo-link';
const DEFAULT_BUTTON_SIZE = 20;
const DEFAULT_BUTTON_MARGIN = 5;

class HaloLinkInner extends React.Component<HaloLinkInnerProps, State> {
    private readonly listener = new EventObserver();
    private targetListener = new EventObserver();
    private queryDebouncer = new Debouncer();
    private queryCancellation = new AbortController();

    constructor(props: HaloLinkInnerProps) {
        super(props);
        this.state = {};
    }

    private updateAll = () => this.forceUpdate();

    componentDidMount() {
        const {target, workspace: {editor}} = this.props;
        this.listener.listen(editor.events, 'changeAuthoringState', () => {
            this.queryAllowedActions();
        });
        this.listenToTarget(target);
        this.queryAllowedActions();
    }

    componentDidUpdate(prevProps: HaloLinkInnerProps) {
        if (prevProps.target !== this.props.target) {
            this.listenToTarget(this.props.target);
            this.queryAllowedActions();
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.listenToTarget(undefined);
        this.queryDebouncer.dispose();
        this.queryCancellation.abort();
    }

    private queryAllowedActions() {
        this.queryDebouncer.call(() => {
            this.queryCancellation.abort();
            this.queryCancellation = new AbortController();
            this.queryCanDelete(this.props.target);
            this.queryCanEdit(this.props.target);
        });
    }

    private queryCanDelete(link: Link) {
        const {workspace: {model, editor}} = this.props;
        if (!editor.metadataApi) {
            this.setState({canDelete: false});
            return;
        }
        if (isSourceOrTargetDeleted(editor.authoringState, link)) {
            this.setState({canDelete: false});
        } else {
            this.setState({canDelete: undefined});
            const source = model.getElement(link.sourceId)!;
            const target = model.getElement(link.targetId)!;
            const signal = this.queryCancellation.signal;
            mapAbortedToNull(
                editor.metadataApi.canDeleteLink(link.data, source.data, target.data, signal),
                signal
            ).then(canDelete => {
                if (canDelete === null) { return; }
                if (this.props.target.id === link.id) {
                    this.setState({canDelete});
                }
            });
        }
    }

    private queryCanEdit(link: Link) {
        const {workspace: {model, editor}} = this.props;
        if (!editor.metadataApi) {
            this.setState({canEdit: false});
            return;
        }
        if (isDeletedLink(editor.authoringState, link)) {
            this.setState({canEdit: false});
        } else {
            this.setState({canEdit: undefined});
            const source = model.getElement(link.sourceId)!;
            const target = model.getElement(link.targetId)!;
            const signal = this.queryCancellation.signal;
            mapAbortedToNull(
                editor.metadataApi.canEditLink(link.data, source.data, target.data, signal),
                signal
            ).then(canEdit => {
                if (canEdit === null) { return; }
                if (this.props.target.id === link.id) {
                    this.setState({canEdit});
                }
            });
        }
    }

    private listenToTarget(link: Link | undefined) {
        const {canvas, workspace: {model}} = this.props;

        this.targetListener.stopListening();
        if (link) {
            const source = model.getElement(link.sourceId)!;
            const target = model.getElement(link.targetId)!;

            this.targetListener.listen(source.events, 'changePosition', this.updateAll);
            this.targetListener.listen(target.events, 'changePosition', this.updateAll);
            this.targetListener.listen(link.events, 'changeVertices', this.updateAll);
            this.targetListener.listen(canvas.renderingState.events, 'changeElementSize', e => {
                if (e.source === source || e.source === target) {
                    this.updateAll();
                }
            });
            this.targetListener.listen(canvas.renderingState.events, 'changeLinkLabelBounds', e => {
                if (e.source === link) {
                    this.updateAll();
                }
            });
        }
    }

    render() {
        const {target, workspace: {editor}} = this.props;
        const polyline = this.computePolyline();
        if (!polyline) { return null; }

        const isAuthoringMode = Boolean(editor.metadataApi);
        const deleteButton = (
            isDeletedByItself(editor.authoringState, target) ||
            isSourceOrTargetDeleted(editor.authoringState, target) ? null : this.renderDeleteButton(polyline)
        );

        return (
            <div className={`${CLASS_NAME}`}>
                {isAuthoringMode ? this.renderTargetButton(polyline) : null}
                {isAuthoringMode ? this.renderSourceButton(polyline) : null}
                {!isAuthoringMode || isDeletedLink(editor.authoringState, target)
                    ? null : this.renderEditButton(polyline)}
                {isAuthoringMode ? deleteButton : null}
                {this.renderEditLabelButton()}
            </div>
        );
    }

    private computePolyline(): ReadonlyArray<Vector> | undefined {
        const {target, canvas, workspace: {model}} = this.props;

        const sourceElement = model.getElement(target.sourceId);
        const targetElement = model.getElement(target.targetId);

        if (!(sourceElement && targetElement)) {
            return undefined;
        }

        const route = canvas.renderingState.getRouting(target.id);
        const verticesDefinedByUser = target.vertices || [];
        const vertices = route ? route.vertices : verticesDefinedByUser;

        return computePolyline(
            boundsOf(sourceElement, canvas.renderingState),
            boundsOf(targetElement, canvas.renderingState),
            vertices
        );
    }

    private calculateDegree(source: Vector, target: Vector): number {
        const x = target.x - source.x;
        const y = target.y - source.y;
        const r = Math.sqrt(x * x + y * y);
        const unit = {x: x / r, y: y / r};
        return Math.atan2(unit.y, unit.x) * (180 / Math.PI);
    }

    private renderSourceButton(polyline: ReadonlyArray<Vector>) {
        const {
            target, canvas, workspace: {editor},
            buttonSize = DEFAULT_BUTTON_SIZE,
        } = this.props;
        const point = getPointAlongPolyline(polyline, 0);
        const {x, y} = canvas.metrics.paperToScrollablePaneCoords(point.x, point.y);

        const style = {top: y - buttonSize / 2, left: x - buttonSize / 2};

        return (
            <button className={`${CLASS_NAME}__button`} style={style}
                disabled={isDeletedLink(editor.authoringState, target)}
                onMouseDown={this.onSourceMove}>
                <svg width={buttonSize} height={buttonSize}>
                    <g transform={`scale(${buttonSize})`}>
                        <circle r={0.5} cx={0.5} cy={0.5} fill='#198AD3' />
                    </g>
                </svg>
            </button>
        );
    }

    private onSourceMove = (e: React.MouseEvent<HTMLElement>) => {
        const {target, canvas, workspace: {overlayController}} = this.props;
        const point = canvas.metrics.pageToPaperCoords(e.pageX, e.pageY);
        overlayController.startEditing({target, mode: 'moveLinkSource', point});
    };

    private renderTargetButton(polyline: ReadonlyArray<Vector>) {
        const {
            target, workspace: {editor},
            buttonSize = DEFAULT_BUTTON_SIZE,
        } = this.props;
        const style = this.getButtonPosition(polyline, 0);

        const {length} = polyline;
        const degree = this.calculateDegree(polyline[length - 1], polyline[length - 2]);

        return (
            <button className={`${CLASS_NAME}__button`} style={style}
                disabled={isDeletedLink(editor.authoringState, target)}
                onMouseDown={this.onTargetMove}>
                <svg width={buttonSize} height={buttonSize} style={{transform: `rotate(${degree}deg)`}}>
                    <g transform={`scale(${buttonSize})`}>
                        <polygon points={'0,0.5 1,1 1,0'} fill='#198AD3' />
                    </g>
                </svg>
            </button>
        );
    }

    private onTargetMove = (e: React.MouseEvent<HTMLElement>) => {
        const {target, canvas, workspace: {overlayController}} = this.props;
        const point = canvas.metrics.pageToPaperCoords(e.pageX, e.pageY);
        overlayController.startEditing({target, mode: 'moveLinkTarget', point});
    };

    private renderEditButton(polyline: ReadonlyArray<Vector>) {
        const {canEdit} = this.state;
        const style = this.getButtonPosition(polyline, 1);
        if (canEdit === undefined) {
            return (
                <div className={`${CLASS_NAME}__spinner`} style={style}>
                    <HtmlSpinner width={20} height={20} />
                </div>
            );
        }
        const title = canEdit ? 'Edit link' : 'Editing is unavailable for the selected link';
        return (
            <button className={`${CLASS_NAME}__button ${CLASS_NAME}__edit`}
                style={style}
                title={title}
                disabled={!canEdit}
                onClick={this.onEdit}
            />
        );
    }

    private onEdit = () => {
        const {target, workspace: {overlayController}} = this.props;
        overlayController.showEditLinkForm(target);
    };

    private renderDeleteButton(polyline: ReadonlyArray<Vector>) {
        const {canDelete} = this.state;
        const style = this.getButtonPosition(polyline, 2);
        if (canDelete === undefined) {
            return (
                <div className={`${CLASS_NAME}__spinner`} style={style}>
                    <HtmlSpinner width={20} height={20} />
                </div>
            );
        }
        const title = canDelete ? 'Delete link' : 'Deletion is unavailable for the selected link';
        return (
            <button className={`${CLASS_NAME}__button ${CLASS_NAME}__delete`}
                style={style}
                title={title}
                disabled={!canDelete}
                onClick={this.onDelete}
            />
        );
    }

    private onDelete = () => {
        const {target, workspace: {editor}} = this.props;
        editor.deleteLink(target.data);
    };

    private getButtonPosition(polyline: ReadonlyArray<Vector>, index: number): { top: number; left: number } {
        const {
            canvas,
            buttonSize = DEFAULT_BUTTON_SIZE,
            buttonMargin = DEFAULT_BUTTON_MARGIN,
        } = this.props;
        const polylineLength = computePolylineLength(polyline);
        const point = getPointAlongPolyline(polyline, polylineLength - (buttonSize + buttonMargin) * index);
        const {x, y} = canvas.metrics.paperToScrollablePaneCoords(point.x, point.y);
        return {
            top: y - buttonSize / 2,
            left: x - buttonSize / 2,
        };
    }

    private renderEditLabelButton() {
        const {target, canvas, workspace: {model}} = this.props;

        const linkType = model.getLinkType(target.typeId)!;
        const template = canvas.renderingState.createLinkTemplate(linkType);
        const labelBounds = canvas.renderingState.getLinkLabelBounds(target);

        if (!template.setLinkLabel || !labelBounds) {
            return null;
        }

        const {x, y, width, height} = labelBounds;
        const {x: left, y: top} = canvas.metrics.paperToScrollablePaneCoords(x + width, y + height / 2);
        const size = {width: 15, height: 17};
        const style = {width: size.width, height: size.height, top: top - size.height / 2, left};
        return (
            <button className={`${CLASS_NAME}__edit-label-button`}
                style={style}
                title={'Edit Link Label'}
                onClick={this.onEditLabel}
            />
        );
    }
    
    private onEditLabel = () => {
        const {target, workspace: {overlayController}} = this.props;
        overlayController.showEditLinkLabelForm(target);
    };
}

function isDeletedLink(state: AuthoringState, link: Link) {
    return isDeletedByItself(state, link) || isSourceOrTargetDeleted(state, link);
}

function isDeletedByItself(state: AuthoringState, link: Link) {
    const event = state.links.get(link.data);
    return event && event.deleted;
}

function isSourceOrTargetDeleted(state: AuthoringState, link: Link) {
    const sourceEvent = state.elements.get(link.data.sourceId);
    const targetEvent = state.elements.get(link.data.targetId);
    return (
        sourceEvent && sourceEvent.deleted ||
        targetEvent && targetEvent.deleted
    );
}
