import * as React from 'react';
import classnames from 'classnames';

import { mapAbortedToNull } from '../coreUtils/async';
import { EventObserver, EventTrigger } from '../coreUtils/events';
import { SyncStore, useEventStore, useFrameDebouncedStore, useSyncStore } from '../coreUtils/hooks';

import { CanvasContext } from '../diagram/canvasApi';
import { setElementExpanded } from '../diagram/commands';
import { Element, Link } from '../diagram/elements';
import { getContentFittingBox } from '../diagram/geometry';
import type { DiagramModel } from '../diagram/model';
import { HtmlSpinner } from '../diagram/spinner';

import { AuthoringState } from '../editor/authoringState';
import type { EditorController } from '../editor/editorController';

import { WorkspaceContext } from '../workspace/workspaceContext';

import type { ConnectionsMenuCommands } from './connectionsMenu';
import type { InstancesSearchCommands } from './instancesSearch';

export interface SelectionActionStyleProps {
    dock: DockDirection;
    dockRow?: number;
    dockColumn?: number;
    className?: string;
    title?: string;
}

export interface SelectionActionProps extends SelectionActionStyleProps {
    disabled?: boolean;
    onSelect?: () => void;
    onMouseDown?: (e: React.MouseEvent) => void;
    children?: React.ReactNode;
}

export type DockDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const CLASS_NAME = 'reactodia-selection-action';

export function SelectionAction(props: SelectionActionProps) {
    const {
        dock, dockRow, dockColumn, className, title, disabled, onSelect, onMouseDown,
    } = props;
    return (
        <button type='button'
            className={classnames(CLASS_NAME, getDockClass(dock), className)}
            style={getDockStyle(dockRow, dockColumn)}
            title={title}
            disabled={disabled}
            onClick={onSelect}
            onMouseDown={onMouseDown}
        />
    );
}

function getDockClass(dock: DockDirection): string | undefined {
    switch (dock) {
        case 'nw': return `${CLASS_NAME}--dock-nw`;
        case 'n': return `${CLASS_NAME}--dock-n`;
        case 'ne': return `${CLASS_NAME}--dock-ne`;
        case 'e': return `${CLASS_NAME}--dock-e`;
        case 'se': return `${CLASS_NAME}--dock-se`;
        case 's': return `${CLASS_NAME}--dock-s`;
        case 'sw': return `${CLASS_NAME}--dock-sw`;
        case 'w': return `${CLASS_NAME}--dock-w`;
        default: return undefined;
    }
}

function getDockStyle(
    dockRow: number | undefined,
    dockColumn: number | undefined
): React.CSSProperties {
    const dockStyle = {
        '--reactodia-dock-x': dockColumn ?? 0,
        '--reactodia-dock-y': dockRow ?? 0,
    } as React.CSSProperties;
    return dockStyle;
}

export interface SelectionActionSpinnerProps extends SelectionActionStyleProps {}

export function SelectionActionSpinner(props: SelectionActionSpinnerProps) {
    const {dock, dockRow, dockColumn, className, title} = props;
    return (
        <div role='button'
            className={classnames(className, getDockClass(dock), `${CLASS_NAME}__spinner`)}
            style={getDockStyle(dockRow, dockColumn)}
            title={title}>
            <HtmlSpinner width={20} height={20} />
        </div>
    );
}

export interface SelectionActionRemoveProps extends SelectionActionStyleProps {}

export function SelectionActionRemove(props: SelectionActionRemoveProps) {
    const {className, title, ...otherProps} = props;
    const {editor} = React.useContext(WorkspaceContext)!;
    const elements = editor.selection.filter((cell): cell is Element => cell instanceof Element);
    const isNewElement = Boolean(
        elements.length === 1 &&
        AuthoringState.isNewElement(editor.authoringState, elements[0].iri)
    );
    return (
        <SelectionAction {...otherProps}
            className={classnames(
                className,
                isNewElement ? `${CLASS_NAME}__delete` : `${CLASS_NAME}__remove`
            )}
            title={
                title ? title :
                isNewElement ? 'Delete new element' :
                elements.length === 1 ? 'Remove an element from the diagram' :
                'Remove selected elements from the diagram'
            }
            onSelect={() => editor.removeSelectedElements()}
        />
    );
}

export interface SelectionActionZoomToFitProps extends SelectionActionStyleProps {}

export function SelectionActionZoomToFit(props: SelectionActionZoomToFitProps) {
    const {className, title, ...otherProps} = props;
    const {model, editor} = React.useContext(WorkspaceContext)!;
    const {canvas} = React.useContext(CanvasContext)!;
    const elements = editor.selection.filter((cell): cell is Element => cell instanceof Element);
    if (elements.length <= 1) {
        return null;
    }
    return (
        <SelectionAction {...otherProps}
            className={classnames(className, `${CLASS_NAME}__zoomToFit`)}
            title={title ?? 'Zoom to fit selected elements into view'}
            onSelect={() => {
                const links = new Set<Link>();
                for (const element of elements) {
                    for (const link of model.getElementLinks(element)) {
                        links.add(link);
                    }
                }
                const fittingBox = getContentFittingBox(elements, links, canvas.renderingState);
                canvas.zoomToFitRect(fittingBox, {animate: true});
            }}
        />
    );
}

export interface SelectionActionExpandProps extends SelectionActionStyleProps {}

export function SelectionActionExpand(props: SelectionActionExpandProps) {
    const {className, title, ...otherProps} = props;
    const {model, editor} = React.useContext(WorkspaceContext)!;

    const elements = editor.selection.filter((cell): cell is Element => cell instanceof Element);
    const elementExpandedStore = useElementExpandedStore(model, elements);
    const debouncedExpandedStore = useFrameDebouncedStore(elementExpandedStore);
    const allExpanded = useSyncStore(
        debouncedExpandedStore,
        () => elements.every(element => element.isExpanded)
    );

    return (
        <SelectionAction {...otherProps}
            className={classnames(
                className,
                allExpanded ? `${CLASS_NAME}__collapse` : `${CLASS_NAME}__expand`
            )}
            title={title ?? (
                elements.length === 1
                    ? 'Expand an element to reveal additional properties'
                    : 'Expand all elements  to reveal additional properties'
            )}
            onSelect={() => {
                if (elements.length === 1) {
                    const target = elements[0];
                    model.history.execute(setElementExpanded(target, !target.isExpanded));
                } else {
                    const batch = model.history.startBatch(
                        allExpanded ? 'Collapse elements' : 'Expand elements'
                    );
                    for (const element of elements) {
                        batch.history.execute(setElementExpanded(element, !allExpanded));
                    }
                    batch.store();
                }
            }}
        />
    );
}

function useElementExpandedStore(model: DiagramModel, elements: ReadonlyArray<Element>): SyncStore {
    return React.useCallback<SyncStore>(onChange => {
        if (elements.length === 0) {
            return () => {/* void */};
        }
        const elementSet = new Set(elements);
        const listener = new EventObserver();
        listener.listen(model.events, 'elementEvent', ({data}) => {
            if (data.changeExpanded && elementSet.has(data.changeExpanded.source)) {
                onChange();
            }
        });
        return () => listener.stopListening();
    }, [model.events, elements]);
}

export interface SelectionActionAnchorProps extends SelectionActionStyleProps {}

export function SelectionActionAnchor(props: SelectionActionAnchorProps) {
    const {dock, dockRow, dockColumn, className, title} = props;
    const {view, editor} = React.useContext(WorkspaceContext)!;
    const elements = editor.selection.filter((cell): cell is Element => cell instanceof Element);
    if (elements.length !== 1) {
        return null;
    }
    const [target] = elements;
    return (
        <a role='button'
            className={classnames(
                CLASS_NAME,
                getDockClass(dock),
                className,
                `${CLASS_NAME}__link`
            )}
            style={getDockStyle(dockRow, dockColumn)}
            href={target.iri}
            title={title ?? 'Jump to resource'}
            onClick={e => view.onIriClick(target.iri, target, 'jumpToEntity', e)}
        />
    );
}

export interface SelectionActionConnectionsProps extends SelectionActionStyleProps {
    commands?: EventTrigger<ConnectionsMenuCommands>;
}

export function SelectionActionConnections(props: SelectionActionConnectionsProps) {
    const {className, title, commands, ...otherProps} = props;
    const {editor, overlayController} = React.useContext(WorkspaceContext)!;
    const elements = editor.selection.filter((cell): cell is Element => cell instanceof Element);
    if (!(commands && elements.length === 1)) {
        return null;
    }
    const [target] = elements;
    const {openedDialog} = overlayController;
    const menuOpened = Boolean(
        openedDialog &&
        openedDialog.target === target &&
        openedDialog.knownType === 'connectionsMenu'
    );
    return (
        <SelectionAction {...otherProps}
            className={classnames(
                className,
                menuOpened
                    ? `${CLASS_NAME}__navigate-close`
                    : `${CLASS_NAME}__navigate-open`
            )}
            title={title ?? 'Navigate to connected elements'}
            onSelect={() => {
                if (menuOpened) {
                    overlayController.hideDialog();
                } else {
                    commands.trigger('show', {target});
                }
            }}
        />
    );
}

export interface SelectionActionAddToFilterProps extends SelectionActionStyleProps {
    commands?: EventTrigger<InstancesSearchCommands>;
}

export function SelectionActionAddToFilter(props: SelectionActionAddToFilterProps) {
    const {className, title, commands, ...otherProps} = props;
    const {editor} = React.useContext(WorkspaceContext)!;
    const elements = editor.selection.filter((cell): cell is Element => cell instanceof Element);
    if (!(commands && elements.length === 1)) {
        return null;
    }
    const [target] = elements;
    return (
        <SelectionAction {...otherProps}
            className={classnames(className, `${CLASS_NAME}__add-to-filter`)}
            title={title ?? 'Search for connected elements'}
            onSelect={() => {
                commands.trigger('setCriteria', {
                    criteria: {refElement: target},
                });
            }}
        />
    );
}

export interface SelectionActionEstablishLinkProps extends SelectionActionStyleProps {}

export function SelectionActionEstablishLink(props: SelectionActionEstablishLinkProps) {
    const {className, title, ...otherProps} = props;
    const {editor, overlayController} = React.useContext(WorkspaceContext)!;
    const {canvas} = React.useContext(CanvasContext)!;

    const elements = editor.selection.filter((cell): cell is Element => cell instanceof Element);
    const target = elements.length === 1 ? elements[0] : undefined;
    const canLink = useCanEstablishLink(editor, target);

    if (!target) {
        return null;
    } else if (canLink === undefined) {
        const {dock, dockRow, dockColumn} = props;
        return (
            <SelectionActionSpinner dock={dock}
                dockRow={dockRow}
                dockColumn={dockColumn}
            />
        );
    }
    return (
        <SelectionAction {...otherProps}
            className={classnames(
                className,
                `${CLASS_NAME}__establish-link`
            )}
            disabled={!canLink}
            title={title ?? (
                canLink
                    ? 'Establish link'
                    : 'Establishing link is not allowed for the element'
            )}
            onMouseDown={e => {
                const point = canvas.metrics.pageToPaperCoords(e.pageX, e.pageY);
                overlayController.startEditing({target, mode: 'establishLink', point});
            }}
        />
    );
}

function useCanEstablishLink(editor: EditorController, target: Element | undefined) {
    const [canLink, setCanLink] = React.useState<boolean | undefined>();

    const authoringStateStore = useEventStore(editor.events, 'changeAuthoringState');
    const debouncedStateStore = useFrameDebouncedStore(authoringStateStore);
    const authoringState = useSyncStore(debouncedStateStore, () => editor.authoringState);

    React.useEffect(() => {
        const cancellation = new AbortController();
        if (!(editor.metadataApi && target)) {
            setCanLink(false);
            return;
        }
        const event = authoringState.elements.get(target.iri);
        if (event && event.deleted) {
            setCanLink(false);
        } else {
            setCanLink(undefined);
            const signal = cancellation.signal;
            mapAbortedToNull(
                editor.metadataApi.canLinkElement(target.data, signal),
                signal
            ).then(canLink => {
                if (canLink === null) { return; }
                setCanLink(canLink);
            });
        }
        return () => cancellation.abort();
    }, [target, authoringState]);

    return canLink;
}
