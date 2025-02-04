import * as React from 'react';
import classnames from 'classnames';

import { mapAbortedToNull } from '../coreUtils/async';
import { EventObserver, EventTrigger } from '../coreUtils/events';
import {
    SyncStore, useEventStore, useFrameDebouncedStore, useObservedProperty, useSyncStore,
} from '../coreUtils/hooks';
import { useTranslation } from '../coreUtils/i18n';

import { useCanvas } from '../diagram/canvasApi';
import { setElementExpanded } from '../diagram/commands';
import { Element, Link } from '../diagram/elements';
import { getContentFittingBox } from '../diagram/geometry';
import type { DiagramModel } from '../diagram/model';
import { HtmlSpinner } from '../diagram/spinner';

import { AuthoringState } from '../editor/authoringState';
import { BuiltinDialogType } from '../editor/builtinDialogType';
import { EntityElement, EntityGroup, iterateEntitiesOf } from '../editor/dataElements';
import type { EditorController } from '../editor/editorController';
import { groupEntitiesAnimated, ungroupAllEntitiesAnimated } from '../editor/elementGrouping';

import { useWorkspace } from '../workspace/workspaceContext';

import type { DockDirection } from './utility/viewportDock';

import type { ConnectionsMenuCommands } from './connectionsMenu';
import type { InstancesSearchCommands } from './instancesSearch';

/**
 * Base props for selection action components.
 *
 * @see {@link SelectionAction}
 */
export interface SelectionActionStyleProps {
    /**
     * Dock side direction for the action around the selected elements.
     */
    dock: DockDirection;
    /**
     * Vertical place shift for the action button
     * (e.g. `-1` for one place above, `1` for one place below).
     */
    dockRow?: number;
    /**
     * Horizontal place shift for the action button
     * (e.g. `-1` for one place to the left, `1` for one place to the right).
     */
    dockColumn?: number;
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
 * Props for {@link SelectionAction} component.
 *
 * @see {@link SelectionAction}
 */
export interface SelectionActionProps extends SelectionActionStyleProps {
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

const CLASS_NAME = 'reactodia-selection-action';

/**
 * Base component to display an action on the selected diagram elements
 * from {@link Halo} or {@link Selection}.
 *
 * @category Components
 */
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

/**
 * Props for {@link SelectionActionSpinner} component.
 *
 * @see {@link SelectionActionSpinner}
 */
export interface SelectionActionSpinnerProps extends SelectionActionStyleProps {}

/**
 * Selection action component to display a loading spinner.
 *
 * @category Components
 */
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

/**
 * Props for {@link SelectionActionRemove} component.
 *
 * @see {@link SelectionActionRemove}
 */
export interface SelectionActionRemoveProps extends SelectionActionStyleProps {}

/**
 * Selection action component to remove an element from the diagram.
 *
 * Removing the elements adds a command to the command history.
 *
 * @category Components
 */
export function SelectionActionRemove(props: SelectionActionRemoveProps) {
    const {className, title, ...otherProps} = props;
    const {model, editor, translation: t} = useWorkspace();
    const elements = model.selection.filter((cell): cell is Element => cell instanceof Element);
    
    let newEntities = 0;
    let totalEntities = 0;
    for (const element of elements) {
        if (element instanceof EntityElement) {
            totalEntities++;
            if (AuthoringState.isAddedEntity(editor.authoringState, element.iri)) {
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
                singleNewEntity ? t.text('selection_action.remove.title_on_new') :
                elements.length === 1 ? t.text('selection_action.remove.title_on_single') :
                t.text('selection_action.remove.title')
            }
            onSelect={() => editor.removeSelectedElements()}
        />
    );
}

/**
 * Props for {@link SelectionActionZoomToFit} component.
 *
 * @see {@link SelectionActionZoomToFit}
 */
export interface SelectionActionZoomToFitProps extends SelectionActionStyleProps {}

/**
 * Selection action component to zoom-in or zoom-out the viewport
 * to fit all selected diagram elements.
 *
 * @category Components
 */
export function SelectionActionZoomToFit(props: SelectionActionZoomToFitProps) {
    const {className, title, ...otherProps} = props;
    const {model, canvas} = useCanvas();
    const t = useTranslation();
    const elements = model.selection.filter((cell): cell is Element => cell instanceof Element);
    if (elements.length <= 1) {
        return null;
    }
    return (
        <SelectionAction {...otherProps}
            className={classnames(className, `${CLASS_NAME}__zoomToFit`)}
            title={title ?? t.text('selection_action.zoom_to_fit.title')}
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

/**
 * Props for {@link SelectionActionLayout} component.
 *
 * @see {@link SelectionActionLayout}
 */
export interface SelectionActionLayoutProps extends SelectionActionStyleProps {}

/**
 * Selection action component to perform graph layout algorithm on the sub-graph
 * formed from the selected elements.
 *
 * Applying the layout adds a command to the command history.
 *
 * @category Components
 */
export function SelectionActionLayout(props: SelectionActionLayoutProps) {
    const {className, title, ...otherProps} = props;
    const {model, canvas} = useCanvas();
    const {translation: t, performLayout} = useWorkspace();
    const elements = model.selection.filter((cell): cell is Element => cell instanceof Element);
    if (elements.length <= 1) {
        return null;
    }
    return (
        <SelectionAction {...otherProps}
            className={classnames(className, `${CLASS_NAME}__layout`)}
            title={title ?? t.text('selection_action.layout.title')}
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

/**
 * Props for {@link SelectionActionExpand} component.
 *
 * @see {@link SelectionActionExpand}
 */
export interface SelectionActionExpandProps extends SelectionActionStyleProps {}

/**
 * Selection action component to toggle expanded state for the selected elements.
 *
 * Elements are collapsed if all of them are expanded, otherwise only collapsed
 * ones are expanded instead.
 *
 * Expanding or collapsing the elements adds a command to the command history.
 *
 * @category Components
 */
export function SelectionActionExpand(props: SelectionActionExpandProps) {
    const {className, title, ...otherProps} = props;
    const {model, translation: t} = useWorkspace();

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
                    ? t.text('selection_action.expand.title_on_single')
                    : t.text('selection_action.expand.title')
            )}
            onSelect={() => {
                if (elements.length === 1) {
                    const target = elements[0];
                    model.history.execute(setElementExpanded(target, !target.isExpanded));
                } else {
                    const batch = model.history.startBatch({
                        titleKey: allExpanded
                            ? 'selection_action.expand.collapse_command'
                            : 'selection_action.expand.expand_command',
                    });
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

/**
 * Props for {@link SelectionActionAnchor} component.
 *
 * @see {@link SelectionActionAnchor}
 */
export interface SelectionActionAnchorProps extends SelectionActionStyleProps {
    onSelect?: (target: EntityElement, e: React.MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Selection action component to display a link to the entity IRI.
 *
 * @category Components
 */
export function SelectionActionAnchor(props: SelectionActionAnchorProps) {
    const {dock, dockRow, dockColumn, className, title, onSelect} = props;
    const {model, canvas} = useCanvas();
    const t = useTranslation();
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
            title={title ?? t.text('selection_action.anchor.title')}
            onClick={e => {
                if (onSelect) {
                    onSelect(target, e);
                } else {
                    canvas.renderingState.shared.onIriClick(target.iri, target, 'jumpToEntity', e);
                }
            }}
        />
    );
}

/**
 * Props for {@link SelectionActionConnections} component.
 *
 * @see {@link SelectionActionConnections}
 */
export interface SelectionActionConnectionsProps extends SelectionActionStyleProps {
    /**
     * Event bus to send commands to {@link ConnectionMenu} component.
     */
    commands?: EventTrigger<ConnectionsMenuCommands>;
}

/**
 * Selection action component to open a {@link ConnectionsMenu} for the selected entities.
 *
 * @category Components
 */
export function SelectionActionConnections(props: SelectionActionConnectionsProps) {
    const {className, title, commands, ...otherProps} = props;
    const {model, overlay, translation: t} = useWorkspace();

    const menuOpened = useObservedProperty(
        overlay.events,
        'changeOpenedDialog',
        () => overlay.openedDialog?.knownType === BuiltinDialogType.connectionsMenu
    );

    const elements = model.selection.filter((cell): cell is Element => cell instanceof Element);

    let entityCount = 0;
    for (const element of elements) {
        for (const _entity of iterateEntitiesOf(element)) {
            entityCount++;
        }
    }

    if (!(commands && entityCount > 0)) {
        return null;
    }
    return (
        <SelectionAction {...otherProps}
            className={classnames(
                className,
                menuOpened
                    ? `${CLASS_NAME}__navigate-close`
                    : `${CLASS_NAME}__navigate-open`
            )}
            title={title ?? t.text('selection_action.connections.title')}
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

/**
 * Props for {@link SelectionActionAddToFilter} component.
 *
 * @see {@link SelectionActionAddToFilter}
 */
export interface SelectionActionAddToFilterProps extends SelectionActionStyleProps {
    /**
     * Event bus to send commands to {@link InstancesSearch} component.
     */
    commands?: EventTrigger<InstancesSearchCommands>;
}

/**
 * Selection action component to add the selected entity to the {@link InstancesSearch} filter.
 *
 * @category Components
 */
export function SelectionActionAddToFilter(props: SelectionActionAddToFilterProps) {
    const {className, title, commands, ...otherProps} = props;
    const {model} = useCanvas();
    const t = useTranslation();
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
            title={title ?? t.text('selection_action.add_to_filter.title')}
            onSelect={() => {
                commands.trigger('setCriteria', {
                    criteria: {refElement: target.iri},
                });
            }}
        />
    );
}

/**
 * Props for {@link SelectionActionGroup} component.
 *
 * @see {@link SelectionActionGroup}
 */
export interface SelectionActionGroupProps extends SelectionActionStyleProps {}

/**
 * Selection action component to group or ungroup selected elements.
 *
 * Selected elements can be grouped if only entity elements are selected,
 * the elements can be ungrouped if only entity groups are selected.
 *
 * Grouping or ungrouping the elements adds a command to the command history.
 *
 * @category Components
 */
export function SelectionActionGroup(props: SelectionActionGroupProps) {
    const {className, title, ...otherProps} = props;
    const {canvas} = useCanvas();
    const workspace = useWorkspace();
    const {model, translation: t} = workspace;

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
                canUngroup
                    ? t.text('selection_action.group.title_on_ungroup')
                    : t.text('selection_action.group.title')
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

/**
 * Props for {@link SelectionActionEstablishLink} component.
 *
 * @see {@link SelectionActionEstablishLink}
 */
export interface SelectionActionEstablishLinkProps extends SelectionActionStyleProps {}

/**
 * Selection action component to start creating a relation link to an existing
 * or a new entity.
 *
 * This action is visible only when graph authoring mode is active.
 *
 * Creating a link adds a command to the command history.
 *
 * @category Components
 */
export function SelectionActionEstablishLink(props: SelectionActionEstablishLinkProps) {
    const {className, title, ...otherProps} = props;
    const {canvas} = useCanvas();
    const {model, editor, translation: t} = useWorkspace();

    const inAuthoringMode = useObservedProperty(
        editor.events, 'changeMode', () => editor.inAuthoringMode
    );

    const elements = model.selection.filter((cell): cell is Element => cell instanceof Element);
    const target = elements.length === 1 ? elements[0] : undefined;
    const canLink = useCanEstablishLink(editor, inAuthoringMode ? target : undefined);

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
                    ? t.text('selection_action.establish_relation.title')
                    : t.text('selection_action.establish_relation.title_on_disabled')
            )}
            onMouseDown={e => {
                const point = canvas.metrics.pageToPaperCoords(e.pageX, e.pageY);
                editor.authoringCommands.trigger('startDragEdit', {
                    operation: {mode: 'connect', source: target, point},
                });
            }}
        />
    );
}

function useCanEstablishLink(editor: EditorController, target: Element | undefined) {
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
        if (!(editor.metadataProvider && targetData)) {
            setCanLink(false);
            return;
        }
        if (authoringEvent && authoringEvent.type === 'entityDelete') {
            setCanLink(false);
        } else {
            setCanLink(undefined);
            const signal = cancellation.signal;
            mapAbortedToNull(
                editor.metadataProvider.canConnect(targetData, undefined, undefined, {signal}),
                signal
            ).then(connections => {
                if (connections === null) { return; }
                setCanLink(connections.length > 0);
            });
        }
        return () => cancellation.abort();
    }, [targetData, authoringEvent]);

    return canLink;
}
