import * as React from 'react';
import classnames from 'classnames';

import { mapAbortedToNull } from '../coreUtils/async';
import { EventObserver, EventTrigger } from '../coreUtils/events';
import { SyncStore, useEventStore, useFrameDebouncedStore, useObservedProperty, useSyncStore } from '../coreUtils/hooks';

import { useCanvas } from '../diagram/canvasApi';
import { setElementExpanded } from '../diagram/commands';
import { Element, Link } from '../diagram/elements';
import { getContentFittingBox } from '../diagram/geometry';
import type { DiagramModel } from '../diagram/model';
import { HtmlSpinner } from '../diagram/spinner';

import { AuthoringState } from '../editor/authoringState';
import type { DataDiagramModel } from '../editor/dataDiagramModel';
import { EntityElement, EntityGroup, iterateEntitiesOf } from '../editor/dataElements';
import type { EditorController } from '../editor/editorController';
import { groupEntitiesAnimated, ungroupAllEntitiesAnimated } from '../editor/elementGrouping';

import { useWorkspace } from '../workspace/workspaceContext';

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
        dock, dockRow, dockColumn, className, title, disabled,
        onSelect, onMouseDown, children,
    } = props;
    return (
        <button type='button'
            className={classnames(CLASS_NAME, getDockClass(dock), className)}
            style={getDockStyle(dockRow, dockColumn)}
            title={title}
            disabled={disabled}
            onClick={onSelect}
            onMouseDown={onMouseDown}>
            {children}
        </button>
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
    const {model, editor} = useWorkspace();
    const elements = model.selection.filter((cell): cell is Element => cell instanceof Element);
    
    let newEntities = 0;
    let totalEntities = 0;
    for (const element of elements) {
        if (element instanceof EntityElement) {
            totalEntities++;
            if (AuthoringState.isNewElement(editor.authoringState, element.iri)) {
                newEntities++;
            }
        }
    }

    const singleNewEntity = newEntities === 1 && totalEntities === 1;
    return (
        <SelectionAction {...otherProps}
            className={classnames(
                className,
                singleNewEntity ? `${CLASS_NAME}__delete` : `${CLASS_NAME}__remove`
            )}
            title={
                title ? title :
                singleNewEntity ? 'Delete new element' :
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
    const {model, canvas} = useCanvas();
    const elements = model.selection.filter((cell): cell is Element => cell instanceof Element);
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

export interface SelectionActionLayoutProps extends SelectionActionStyleProps {}

export function SelectionActionLayout(props: SelectionActionLayoutProps) {
    const {className, title, ...otherProps} = props;
    const {performLayout} = useWorkspace();
    const {model, canvas} = useCanvas();
    const elements = model.selection.filter((cell): cell is Element => cell instanceof Element);
    if (elements.length <= 1) {
        return null;
    }
    return (
        <SelectionAction {...otherProps}
            className={classnames(className, `${CLASS_NAME}__layout`)}
            title={title ?? 'Layout selected elements using force-directed algorithm'}
            onSelect={() => {
                performLayout({
                    canvas,
                    selectedElements: new Set(elements),
                    animate: true,
                });
            }}
        />
    );
}

export interface SelectionActionExpandProps extends SelectionActionStyleProps {}

export function SelectionActionExpand(props: SelectionActionExpandProps) {
    const {className, title, ...otherProps} = props;
    const {model} = useWorkspace();

    const elements = model.selection.filter((cell): cell is Element => cell instanceof Element);
    const elementExpandedStore = useElementExpandedStore(model, elements);
    const debouncedExpandedStore = useFrameDebouncedStore(elementExpandedStore);
    const allExpanded = useSyncStore(
        debouncedExpandedStore,
        () => elements.every(element => element.isExpanded)
    );

    if (elements.every(element => element instanceof EntityGroup)) {
        return null;
    }

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
    const {model, canvas} = useCanvas();
    const elements = model.selection.filter((cell): cell is Element => cell instanceof Element);
    if (elements.length !== 1) {
        return null;
    }
    const [target] = elements;
    if (!(target instanceof EntityElement)) {
        return null;
    }
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
            onClick={e => canvas.renderingState.shared.onIriClick(target.iri, target, 'jumpToEntity', e)}
        />
    );
}

export interface SelectionActionConnectionsProps extends SelectionActionStyleProps {
    commands?: EventTrigger<ConnectionsMenuCommands>;
}

export function SelectionActionConnections(props: SelectionActionConnectionsProps) {
    const {className, title, commands, ...otherProps} = props;
    const {model, overlay} = useWorkspace();
    const elements = model.selection.filter((cell): cell is Element => cell instanceof Element);

    let entityCount = 0;
    for (const element of elements) {
        for (const entity of iterateEntitiesOf(element)) {
            entityCount++;
        }
    }

    if (!(commands && entityCount > 0)) {
        return null;
    }
    const {openedDialog} = overlay;
    const menuOpened = Boolean(
        openedDialog &&
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
                    overlay.hideDialog();
                } else {
                    commands.trigger('show', {targets: elements});
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
    const {model} = useCanvas();
    const elements = model.selection.filter((cell): cell is Element => cell instanceof Element);
    if (!(commands && elements.length === 1)) {
        return null;
    }
    const [target] = elements;
    if (!(target instanceof EntityElement)) {
        return null;
    }
    return (
        <SelectionAction {...otherProps}
            className={classnames(className, `${CLASS_NAME}__add-to-filter`)}
            title={title ?? 'Search for connected elements'}
            onSelect={() => {
                commands.trigger('setCriteria', {
                    criteria: {refElement: target.iri},
                });
            }}
        />
    );
}

export interface SelectionActionGroupProps extends SelectionActionStyleProps {}

export function SelectionActionGroup(props: SelectionActionGroupProps) {
    const {className, title, ...otherProps} = props;
    const workspace = useWorkspace();
    const {model} = workspace;
    const {canvas} = useCanvas();

    const elements = model.selection.filter((cell): cell is Element => cell instanceof Element);

    const canGroup = elements.length > 0 && elements.every(element => element instanceof EntityElement);
    const canUngroup = elements.length > 0 && elements.every(element => element instanceof EntityGroup);

    if (elements.length === 0 || elements.length === 1 && canGroup) {
        return null;
    }

    return (
        <SelectionAction {...otherProps}
            className={classnames(
                className,
                canUngroup ? `${CLASS_NAME}__ungroup` : `${CLASS_NAME}__group`
            )}
            disabled={!(canGroup || canUngroup)}
            title={title ?? (
                canUngroup ? 'Ungroup entities': 'Group entities'
            )}
            onMouseDown={async () => {
                if (canGroup) {
                    const group = await groupEntitiesAnimated(elements, canvas, workspace);
                    model.setSelection([group]);
                } else if (canUngroup) {
                    const ungrouped = await ungroupAllEntitiesAnimated(elements, canvas, workspace);
                    model.setSelection(ungrouped);
                }
            }}
        />
    );
}

export interface SelectionActionEstablishLinkProps extends SelectionActionStyleProps {}

export function SelectionActionEstablishLink(props: SelectionActionEstablishLinkProps) {
    const {className, title, ...otherProps} = props;
    const {model, editor, overlay} = useWorkspace();
    const {canvas} = useCanvas();

    const inAuthoringMode = useObservedProperty(
        editor.events, 'changeMode', () => editor.inAuthoringMode
    );

    const elements = model.selection.filter((cell): cell is Element => cell instanceof Element);
    const target = elements.length === 1 ? elements[0] : undefined;
    const canLink = useCanEstablishLink(model, editor, target);

    if (!(target instanceof EntityElement && inAuthoringMode)) {
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
                overlay.startEditing({mode: 'connect', source: target, point});
            }}
        />
    );
}

function useCanEstablishLink(model: DataDiagramModel, editor: EditorController, target: Element | undefined) {
    const [canLink, setCanLink] = React.useState<boolean | undefined>();

    const entityTarget = target instanceof EntityElement ? target : undefined;
    const loadDataStore = useEventStore(entityTarget?.events, 'changeData');
    const targetData = useSyncStore(loadDataStore, () => entityTarget?.data);

    const authoringStateStore = useEventStore(editor.events, 'changeAuthoringState');
    const debouncedStateStore = useFrameDebouncedStore(authoringStateStore);
    const authoringState = useSyncStore(debouncedStateStore, () => editor.authoringState);
    const authoringEvent = target instanceof EntityElement
        ? authoringState.elements.get(target.iri) : undefined;

    React.useEffect(() => {
        const cancellation = new AbortController();
        if (!(editor.metadataApi && targetData)) {
            setCanLink(false);
            return;
        }
        if (authoringEvent && authoringEvent.deleted) {
            setCanLink(false);
        } else {
            setCanLink(undefined);
            const signal = cancellation.signal;
            mapAbortedToNull(
                editor.metadataApi.canLinkElement(targetData, signal),
                signal
            ).then(canLink => {
                if (canLink === null) { return; }
                setCanLink(canLink);
            });
        }
        return () => cancellation.abort();
    }, [targetData, authoringEvent]);

    return canLink;
}
