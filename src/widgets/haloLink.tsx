import * as React from 'react';
import classnames from 'classnames';

import { mapAbortedToNull } from '../coreUtils/async';
import { EventObserver } from '../coreUtils/events';
import { useEventStore, useFrameDebouncedStore, useSyncStore } from '../coreUtils/hooks';

import { CanvasApi, CanvasContext } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';
import { Link } from '../diagram/elements';
import {
    Vector, boundsOf, computePolyline, computePolylineLength, getPointAlongPolyline,
} from '../diagram/geometry';
import type { GraphStructure } from '../diagram/model';
import type { RenderingState } from '../diagram/renderingState';
import { HtmlSpinner } from '../diagram/spinner';

import { AuthoringState } from '../editor/authoringState';
import { EditorController } from '../editor/editorController';

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
    /**
     * `LinkAction` items representing available actions on the selected link.
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

export function HaloLink(props: HaloLinkProps) {
    const {canvas} = React.useContext(CanvasContext)!;
    const workspace = React.useContext(WorkspaceContext)!;
    const {editor} = workspace;

    const selectionStore = useEventStore(editor.events, 'changeSelection');
    const selection = useSyncStore(selectionStore, () => editor.selection);

    if (selection.length === 1) {
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
    readonly actionContext: LinkActionContext | null;
}

const CLASS_NAME = 'reactodia-halo-link';
const DEFAULT_BUTTON_SIZE = 20;
const DEFAULT_BUTTON_MARGIN = 5;

class HaloLinkInner extends React.Component<HaloLinkInnerProps, State> {
    private targetListener = new EventObserver();

    constructor(props: HaloLinkInnerProps) {
        super(props);
        this.state = {
            actionContext: HaloLinkInner.makeActionContext(this.props),
        };
    }

    static makeActionContext(props: HaloLinkInnerProps): LinkActionContext | null {
        const {
            target,
            canvas,
            workspace: {model},
            buttonSize = DEFAULT_BUTTON_SIZE,
            buttonMargin = DEFAULT_BUTTON_MARGIN,
        } = props;

        const polyline = computeEffectiveLinkPolyline(target, model, canvas.renderingState);
        if (!polyline) {
            return null;
        }
        const polylineLength = computePolylineLength(polyline);

        const getPosition: LinkActionContext['getPosition'] = (side, index) => {
            const shift = (buttonSize + buttonMargin) * index;
            const point = getPointAlongPolyline(
                polyline,
                side === 'source' ? shift : (polylineLength - shift)
            );
            const {x, y} = canvas.metrics.paperToScrollablePaneCoords(point.x, point.y);
            return {
                top: y - buttonSize / 2,
                left: x - buttonSize / 2,
            };
        };

        const getAngleInDegrees: LinkActionContext['getAngleInDegrees'] = side => {
            const start = polyline[side === 'source' ? 1 : polyline.length - 1];
            const end = polyline[side === 'source' ? 0 : polyline.length - 2];
            const unit = Vector.normalize(Vector.subtract(end, start));
            return Math.atan2(unit.y, unit.x) * (180 / Math.PI);
        };

        return {
            link: target,
            buttonSize,
            getPosition,
            getAngleInDegrees,
        };
    }

    componentDidMount() {
        const {target} = this.props;
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
        this.listenToTarget(undefined);
    }

    private listenToTarget(link: Link | undefined) {
        const {canvas, workspace: {model}} = this.props;

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
            <div className={`${CLASS_NAME}`} style={style}>
                <LinkActionContext.Provider value={actionContext}>
                    {children ?? <>
                        <LinkActionMoveEndpoint dockSide='target' />
                        <LinkActionMoveEndpoint dockSide='source' />
                        <LinkActionEdit dockSide='target' dockIndex={1} />
                        <LinkActionDelete dockSide='target' dockIndex={2} />
                        <LinkActionRename />
                    </>}
                </LinkActionContext.Provider>
            </div>
        );
    }
}

function computeEffectiveLinkPolyline(
    link: Link,
    graph: GraphStructure,
    renderingState: RenderingState
): ReadonlyArray<Vector> | undefined {
    const sourceElement = graph.getElement(link.sourceId);
    const targetElement = graph.getElement(link.targetId);

    if (!(sourceElement && targetElement)) {
        return undefined;
    }

    const route = renderingState.getRouting(link.id);
    const verticesDefinedByUser = link.vertices || [];
    const vertices = route ? route.vertices : verticesDefinedByUser;

    return computePolyline(
        boundsOf(sourceElement, renderingState),
        boundsOf(targetElement, renderingState),
        vertices
    );
}

export interface LinkActionContext {
    readonly link: Link;
    readonly buttonSize: number;
    readonly getPosition: (
        side: 'source' | 'target',
        index: number
    ) => { top: number; left: number };
    readonly getAngleInDegrees: (side: 'source' | 'target') => number;
}

const LinkActionContext = React.createContext<LinkActionContext | null>(null);

export function useLinkActionContext(): LinkActionContext {
    const context = React.useContext(LinkActionContext);
    if (!context) {
        throw new Error('Missing context for LinkAction');
    }
    return context;
}

export interface LinkActionStyleProps {
    dockSide: 'source' | 'target';
    dockIndex: number;
    className?: string;
    title?: string;
}

export interface LinkActionProps extends LinkActionStyleProps {
    disabled?: boolean;
    onSelect?: () => void;
    onMouseDown?: (e: React.MouseEvent) => void;
    children?: React.ReactNode;
}

export function LinkAction(props: LinkActionProps) {
    const {dockSide, dockIndex, className, title, onSelect, onMouseDown, children} = props;
    const {getPosition} = useLinkActionContext();
    return (
        <button role='button'
            className={classnames(className, `${CLASS_NAME}__action`)}
            style={getPosition(dockSide, dockIndex)}
            title={title}
            onClick={onSelect}
            onMouseDown={onMouseDown}>
            {children}
        </button>
    );
}

export interface LinkActionSpinnerProps extends LinkActionStyleProps {}

export function LinkActionSpinner(props: LinkActionStyleProps) {
    const {dockSide, dockIndex, className, title} = props;
    const {buttonSize, getPosition} = useLinkActionContext();
    return (
        <div className={classnames(className, `${CLASS_NAME}__spinner`)}
            style={getPosition(dockSide, dockIndex)}
            title={title}>
            <HtmlSpinner width={buttonSize} height={buttonSize} />
        </div>
    );
}

export interface LinkActionEditProps extends LinkActionStyleProps {}

export function LinkActionEdit(props: LinkActionEditProps) {
    const {className, title, ...otherProps} = props;
    const {link} = useLinkActionContext();
    const {editor, overlayController} = React.useContext(WorkspaceContext)!;

    const canEdit = useCanEditLink(link, editor);
    const linkIsDeleted = isDeletedLink(editor.authoringState, link);

    if (!editor.inAuthoringMode || linkIsDeleted) {
        return null;
    } else if (canEdit === undefined) {
        const {dockSide, dockIndex} = props;
        return (
            <LinkActionSpinner dockSide={dockSide}
                dockIndex={dockIndex}
            />
        );
    }
    return (
        <LinkAction {...otherProps}
            className={classnames(
                className,
                `${CLASS_NAME}__button`,
                `${CLASS_NAME}__edit`
            )}
            title={title ?? (
                canEdit ? 'Edit link' : 'Editing is unavailable for the selected link'
            )}
            disabled={!canEdit}
            onSelect={() => overlayController.showEditLinkForm(link)}
        />
    );
}

function useCanEditLink(link: Link, editor: EditorController): boolean | undefined {
    const [canEdit, setCanEdit] = React.useState<boolean | undefined>();

    const authoringStateStore = useEventStore(editor.events, 'changeAuthoringState');
    const debouncedStateStore = useFrameDebouncedStore(authoringStateStore);
    const authoringState = useSyncStore(debouncedStateStore, () => editor.authoringState);

    React.useEffect(() => {
        const cancellation = new AbortController();
        if (!editor.metadataApi) {
            setCanEdit(false);
            return;
        }
        if (isDeletedLink(authoringState, link)) {
            setCanEdit(false);
        } else {
            setCanEdit(undefined);
            const source = editor.model.getElement(link.sourceId)!;
            const target = editor.model.getElement(link.targetId)!;
            const signal = cancellation.signal;
            mapAbortedToNull(
                editor.metadataApi.canDeleteLink(link.data, source.data, target.data, signal),
                signal
            ).then(canLink => {
                if (canLink === null) { return; }
                setCanEdit(canLink);
            });
        }
        return () => cancellation.abort();
    }, [link, authoringState]);

    return canEdit;
}

export interface LinkActionDeleteProps extends LinkActionStyleProps {}

export function LinkActionDelete(props: LinkActionDeleteProps) {
    const {className, title, ...otherProps} = props;
    const {link} = useLinkActionContext();
    const {editor} = React.useContext(WorkspaceContext)!;

    const canDelete = useCanDeleteLink(link, editor);
    const linkIsDeleted = (
        isDeletedByItself(editor.authoringState, link) ||
        isSourceOrTargetDeleted(editor.authoringState, link)
    );

    if (!editor.inAuthoringMode || linkIsDeleted) {
        return null;
    } else if (canDelete === undefined) {
        const {dockSide, dockIndex} = props;
        return (
            <LinkActionSpinner dockSide={dockSide}
                dockIndex={dockIndex}
            />
        );
    }
    return (
        <LinkAction {...otherProps}
            className={classnames(
                className,
                `${CLASS_NAME}__button`,
                `${CLASS_NAME}__delete`
            )}
            title={title ?? (
                canDelete ? 'Delete link' : 'Deletion is unavailable for the selected link'
            )}
            disabled={!canDelete}
            onSelect={() => editor.deleteLink(link.data)}
        />
    );
}

function useCanDeleteLink(link: Link, editor: EditorController): boolean | undefined {
    const [canDelete, setCanDelete] = React.useState<boolean | undefined>();

    const authoringStateStore = useEventStore(editor.events, 'changeAuthoringState');
    const debouncedStateStore = useFrameDebouncedStore(authoringStateStore);
    const authoringState = useSyncStore(debouncedStateStore, () => editor.authoringState);

    React.useEffect(() => {
        const cancellation = new AbortController();
        if (!editor.metadataApi) {
            setCanDelete(false);
            return;
        }
        if (isSourceOrTargetDeleted(authoringState, link)) {
            setCanDelete(false);
        } else {
            setCanDelete(undefined);
            const source = editor.model.getElement(link.sourceId)!;
            const target = editor.model.getElement(link.targetId)!;
            const signal = cancellation.signal;
            mapAbortedToNull(
                editor.metadataApi.canDeleteLink(link.data, source.data, target.data, signal),
                signal
            ).then(canLink => {
                if (canLink === null) { return; }
                setCanDelete(canLink);
            });
        }
        return () => cancellation.abort();
    }, [link, authoringState]);

    return canDelete;
}

export interface LinkActionMoveEndpointProps extends Omit<LinkActionStyleProps, 'dockIndex'> {}

export function LinkActionMoveEndpoint(props: LinkActionMoveEndpointProps) {
    const {dockSide, className, title, ...otherProps} = props;
    const {link, buttonSize, getAngleInDegrees} = useLinkActionContext();
    const {canvas} = React.useContext(CanvasContext)!;
    const {editor, overlayController} = React.useContext(WorkspaceContext)!;

    if (!editor.inAuthoringMode) {
        return null;
    }

    const angle = getAngleInDegrees(dockSide);
    return (
        <LinkAction {...otherProps}
            dockSide={dockSide}
            dockIndex={0}
            className={classnames(
                className,
                `${CLASS_NAME}__endpoint`
            )}
            title={title ?? (
                dockSide === 'source' ? 'Move link source' : 'Move link target'
            )}
            disabled={!isDeletedLink(editor.authoringState, link)}
            onMouseDown={e => {
                const point = canvas.metrics.pageToPaperCoords(e.pageX, e.pageY);
                overlayController.startEditing({
                    target: link,
                    mode: dockSide === 'source' ? 'moveLinkSource' : 'moveLinkTarget',
                    point,
                });
            }}>
            <svg width={buttonSize} height={buttonSize}
                style={{transform: `rotate(${angle}deg)`}}>
                <g transform={`scale(${buttonSize})`}>
                    {dockSide === 'source' ? (
                        <circle r={0.5} cx={0.5} cy={0.5} fill='#198AD3' />
                    ) : (
                        <polygon points={'0,0.5 1,1 1,0'} fill='#198AD3' />
                    )}
                </g>
            </svg>
        </LinkAction>
    );
}

export interface LinkActionRenameProps {
    className?: string;
    title?: string;
}

export function LinkActionRename(props: LinkActionRenameProps) {
    const {className, title} = props;
    const {link} = useLinkActionContext();
    const {canvas} = React.useContext(CanvasContext)!;
    const {model, overlayController} = React.useContext(WorkspaceContext)!;

    const labelBoundsStore = useEventStore(canvas.renderingState.events, 'changeLinkLabelBounds');
    const labelBounds = useSyncStore(
        labelBoundsStore,
        () => canvas.renderingState.getLinkLabelBounds(link)
    );

    const linkType = model.getLinkType(link.typeId);
    if (!linkType) {
        return null;
    }

    const template = canvas.renderingState.createLinkTemplate(linkType);
    if (!template.setLinkLabel || !labelBounds) {
        return null;
    }

    const {x, y, width, height} = labelBounds;
    const {x: left, y: top} = canvas.metrics.paperToScrollablePaneCoords(x + width, y + height / 2);
    const size = {width: 15, height: 17};
    const style: React.CSSProperties = {
        width: size.width,
        height: size.height,
        left,
        top: top - size.height / 2,
    };
    return (
        <button className={classnames(className, `${CLASS_NAME}__rename`)}
            style={style}
            title={title ?? 'Rename link'}
            onClick={() => overlayController.showRenameLinkForm(link)}
        />
    );
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
