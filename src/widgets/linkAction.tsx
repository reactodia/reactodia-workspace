import * as React from 'react';
import classnames from 'classnames';

import { mapAbortedToNull } from '../coreUtils/async';
import { useEventStore, useFrameDebouncedStore, useSyncStore } from '../coreUtils/hooks';

import { useCanvas } from '../diagram/canvasApi';
import { Link } from '../diagram/elements';
import { GraphStructure } from '../diagram/model';
import { HtmlSpinner } from '../diagram/spinner';

import { AuthoringState } from '../editor/authoringState';
import { EntityElement, RelationLink } from '../editor/dataElements';
import { EditorController } from '../editor/editorController';

import { useWorkspace } from '../workspace/workspaceContext';

/**
 * Represents rendering context for the link action.
 */
export interface LinkActionContext {
    /**
     * Target link to display action for.
     */
    readonly link: Link;
    /**
     * Action button size in px.
     */
    readonly buttonSize: number;
    /**
     * Calculates action button position as a CSS style properties.
     */
    readonly getPosition: (
        side: 'source' | 'target',
        index: number
    ) => { top: number; left: number };
    /**
     * Calculates a link line angle at the action button position
     * in degrees.
     */
    readonly getAngleInDegrees: (side: 'source' | 'target') => number;
}

export const LinkActionContext = React.createContext<LinkActionContext | null>(null);

/**
 * React hook to get rendering context for the link action.
 *
 * Throws an error if called outside `HaloLink` component.
 *
 * @category Hooks
 */
export function useLinkActionContext(): LinkActionContext {
    const context = React.useContext(LinkActionContext);
    if (!context) {
        throw new Error('Missing context for LinkAction');
    }
    return context;
}

/**
 * Base props for link action components.
 *
 * @see LinkAction
 */
export interface LinkActionStyleProps {
    /**
     * Link endpoint to place the action.
     */
    dockSide: 'source' | 'target';
    /**
     * Place shift for the action button from the `dockSide` endpoint
     * towards another endpoint (e.g. `1` for one place towards link target
     * if `dockSide` is `source).
     */
    dockIndex: number;
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Title for the action button.
     */
    title?: string;
}

/**
 * Props for `LinkAction` component.
 *
 * @see LinkAction
 */
export interface LinkActionProps extends LinkActionStyleProps {
    /**
     * Whether the action is disabled.
     */
    disabled?: boolean;
    /**
     * Handler to call when the action is selected.
     */
    onSelect?: () => void;
    /**
     * Raw handler for mouse down event on the action button.
     */
    onMouseDown?: (e: React.MouseEvent) => void;
    /**
     * Action content.
     */
    children?: React.ReactNode;
}

const CLASS_NAME = 'reactodia-link-action';

/**
 * Base component to display an action on the selected link from `HaloLink`.
 *
 * @category Components
 */
export function LinkAction(props: LinkActionProps) {
    const {dockSide, dockIndex, className, title, onSelect, onMouseDown, children} = props;
    const {getPosition} = useLinkActionContext();
    return (
        <button role='button'
            className={classnames(className, CLASS_NAME)}
            style={getPosition(dockSide, dockIndex)}
            title={title}
            onClick={onSelect}
            onMouseDown={onMouseDown}>
            {children}
        </button>
    );
}

/**
 * Props for `LinkActionSpinner` component.
 *
 * @see LinkActionSpinner
 */
export interface LinkActionSpinnerProps extends LinkActionStyleProps {}

/**
 * Link action component to display a loading spinner.
 *
 * @category Components
 */
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

/**
 * Props for `LinkActionEdit` component.
 *
 * @see LinkActionEdit
 */
export interface LinkActionEditProps extends LinkActionStyleProps {}

/**
 * Link action component to start editing the link.
 *
 * This action is visible only when graph authoring mode is active.
 *
 * @category Components
 */
export function LinkActionEdit(props: LinkActionEditProps) {
    const {className, title, ...otherProps} = props;
    const {link} = useLinkActionContext();
    const {model, editor, overlay} = useWorkspace();

    const canEdit = useCanEditLink(link, model, editor);
    const linkIsDeleted = isDeletedLink(editor.authoringState, link);

    if (!(editor.inAuthoringMode && link instanceof RelationLink) || linkIsDeleted) {
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
            onSelect={() => overlay.showEditLinkForm(link)}
        />
    );
}

function useCanEditLink(
    link: Link,
    graph: GraphStructure,
    editor: EditorController
): boolean | undefined {
    const [canEdit, setCanEdit] = React.useState<boolean | undefined>();

    const authoringStateStore = useEventStore(editor.events, 'changeAuthoringState');
    const debouncedStateStore = useFrameDebouncedStore(authoringStateStore);
    const authoringState = useSyncStore(debouncedStateStore, () => editor.authoringState);

    React.useEffect(() => {
        const cancellation = new AbortController();
        if (!(editor.metadataApi && link instanceof RelationLink)) {
            setCanEdit(false);
            return;
        }
        if (isDeletedLink(authoringState, link)) {
            setCanEdit(false);
        } else {
            setCanEdit(undefined);
            const source = graph.getElement(link.sourceId) as EntityElement;
            const target = graph.getElement(link.targetId) as EntityElement;
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

/**
 * Props for `LinkActionDelete` component.
 *
 * @see LinkActionDelete
 */
export interface LinkActionDeleteProps extends LinkActionStyleProps {}

/**
 * Link action component to delete the link.
 *
 * This action is visible only when graph authoring mode is active.
 *
 * Deleting a link adds a command to the command history.
 *
 * @category Components
 */
export function LinkActionDelete(props: LinkActionDeleteProps) {
    const {className, title, ...otherProps} = props;
    const {link} = useLinkActionContext();
    const {model, editor} = useWorkspace();

    const canDelete = useCanDeleteLink(link, model, editor);
    const linkIsDeleted = (
        isDeletedByItself(editor.authoringState, link) ||
        isSourceOrTargetDeleted(editor.authoringState, link)
    );

    if (!(editor.inAuthoringMode && link instanceof RelationLink) || linkIsDeleted) {
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
            onSelect={() => editor.deleteRelation(link.data)}
        />
    );
}

function useCanDeleteLink(
    link: Link,
    graph: GraphStructure,
    editor: EditorController
): boolean | undefined {
    const [canDelete, setCanDelete] = React.useState<boolean | undefined>();

    const authoringStateStore = useEventStore(editor.events, 'changeAuthoringState');
    const debouncedStateStore = useFrameDebouncedStore(authoringStateStore);
    const authoringState = useSyncStore(debouncedStateStore, () => editor.authoringState);

    React.useEffect(() => {
        const cancellation = new AbortController();
        if (!(editor.metadataApi && link instanceof RelationLink)) {
            setCanDelete(false);
            return;
        }
        if (isSourceOrTargetDeleted(authoringState, link)) {
            setCanDelete(false);
        } else {
            setCanDelete(undefined);
            const source = graph.getElement(link.sourceId) as EntityElement;
            const target = graph.getElement(link.targetId) as EntityElement;
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

/**
 * 
 */
export interface LinkActionMoveEndpointProps extends Omit<LinkActionStyleProps, 'dockIndex'> {}

/**
 * Link action component to change the relation link by moving its endpoint
 * to another entity element.
 *
 * The changed endpoint is specified via `dockSide` prop.
 *
 * This action is visible only when graph authoring mode is active.
 *
 * Changing a link adds a command to the command history.
 *
 * @category Components
 */
export function LinkActionMoveEndpoint(props: LinkActionMoveEndpointProps) {
    const {dockSide, className, title, ...otherProps} = props;
    const {link, buttonSize, getAngleInDegrees} = useLinkActionContext();
    const {canvas} = useCanvas();
    const {editor, overlay} = useWorkspace();

    if (!(editor.inAuthoringMode && link instanceof RelationLink)) {
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
                overlay.startEditing({
                    mode: dockSide === 'source' ? 'moveSource' : 'moveTarget',
                    link,
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

/**
 * Props for `LinkActionRename` component.
 *
 * @see LinkActionRename
 */
export interface LinkActionRenameProps
    extends Pick<LinkActionStyleProps, 'className' | 'title'> {}

/**
 * Link action component to rename a link (change its label).
 *
 * This action is visible only when `RenameLinkProvider.canRename()` returns `true`
 * for the selected link.
 *
 * @category Components
 */
export function LinkActionRename(props: LinkActionRenameProps) {
    const {className, title} = props;
    const {link} = useLinkActionContext();
    const {canvas} = useCanvas();
    const {view: {renameLinkProvider}, overlay} = useWorkspace();

    const labelBoundsStore = useEventStore(canvas.renderingState.events, 'changeLinkLabelBounds');
    const labelBounds = useSyncStore(
        labelBoundsStore,
        () => canvas.renderingState.getLinkLabelBounds(link)
    );

    if (!(renameLinkProvider?.canRename(link) && labelBounds)) {
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
            onClick={() => overlay.showRenameLinkForm(link)}
        />
    );
}

function isDeletedLink(state: AuthoringState, link: Link) {
    return isDeletedByItself(state, link) || isSourceOrTargetDeleted(state, link);
}

function isDeletedByItself(state: AuthoringState, link: Link): boolean {
    if (!(link instanceof RelationLink)) {
        return false;
    }
    const event = state.links.get(link.data);
    return event?.deleted || false;
}

function isSourceOrTargetDeleted(state: AuthoringState, link: Link): boolean {
    if (!(link instanceof RelationLink)) {
        return false;
    }
    const sourceEvent = state.elements.get(link.data.sourceId);
    const targetEvent = state.elements.get(link.data.targetId);
    return (
        sourceEvent?.deleted ||
        targetEvent?.deleted ||
        false
    );
}
