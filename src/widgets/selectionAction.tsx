import cx from 'clsx';
import * as React from 'react';

import { EventObserver } from '../coreUtils/events';
import {
    SyncStore, useAsync, useEventStore, useObservedProperty, useSyncStore,
} from '../coreUtils/hooks';
import type { HotkeyString } from '../coreUtils/hotkey';
import { TranslatedText, useTranslation } from '../coreUtils/i18n';

import { LinkTypeIri } from '../data/model';
import { AnnotationContent, TemplateProperties } from '../data/schema';

import { useCanvas } from '../diagram/canvasApi';
import { useCanvasHotkey } from '../diagram/canvasHotkey';
import { setElementExpanded } from '../diagram/commands';
import { Element, Link } from '../diagram/elements';
import { getContentFittingBox } from '../diagram/geometry';
import type { DiagramModel } from '../diagram/model';
import { HtmlSpinner } from '../diagram/spinner';
import { useLayerDebouncedStore } from '../diagram/renderingState';

import { AnnotationElement } from '../editor/annotationCells';
import { AuthoringState } from '../editor/authoringState';
import { BuiltinDialogType } from '../editor/builtinDialogType';
import { EntityElement, EntityGroup, iterateEntitiesOf } from '../editor/dataElements';
import type { EditorController } from '../editor/editorController';
import { groupEntities, ungroupAllEntities } from '../editor/elementGrouping';

import {
    AnnotationTopic, ConnectionsMenuTopic, InstancesSearchTopic, VisualAuthoringTopic,
} from '../workspace/commandBusTopic';
import { useWorkspace } from '../workspace/workspaceContext';

import type { DockDirection } from './utility/viewportDock';

import type { AnnotationCommands } from './annotation';
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
    /**
     * Keyboard hotkey for the action when it's mounted.
     *
     * Passing `null` disables a default hotkey if there is one.
     */
    hotkey?: HotkeyString | null;
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
     * Raw handler for pointer down event on the action button.
     */
    onPointerDown?: (e: React.PointerEvent) => void;
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
        dock, dockRow, dockColumn, className, title, hotkey,
        disabled, onSelect, onMouseDown, onPointerDown, children,
    } = props;

    const actionKey = useCanvasHotkey(hotkey, disabled ? undefined : onSelect);
    const titleWithHotkey = title && actionKey ? `${title} (${actionKey.text})` : title;

    return (
        <button type='button'
            className={cx(CLASS_NAME, getDockClass(dock), className)}
            style={getDockStyle(dockRow, dockColumn)}
            title={titleWithHotkey}
            disabled={disabled}
            onClick={onSelect}
            onMouseDown={onMouseDown}
            onPointerDown={onPointerDown}>
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

export function useSingleSelectedElement(model: DiagramModel): Element | undefined {
    return useObservedProperty(
        model.events,
        'changeSelection',
        () => {
            const target = model.selection.length === 1 ? model.selection[0] : undefined;
            return target instanceof Element ? target : undefined;
        }
    );
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
            className={cx(className, getDockClass(dock), `${CLASS_NAME}__spinner`)}
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
export interface SelectionActionRemoveProps extends SelectionActionStyleProps {
    /**
     * @default "None+Delete"
     */
    hotkey?: HotkeyString | null;
}

/**
 * Selection action component to remove an element from the diagram.
 *
 * Removing the elements adds a command to the command history.
 *
 * @category Components
 */
export function SelectionActionRemove(props: SelectionActionRemoveProps) {
    const {className, title, hotkey, ...otherProps} = props;
    const {canvas} = useCanvas();
    const {model, editor} = useWorkspace();
    const t = useTranslation();
    const selection = useObservedProperty(model.events, 'changeSelection', () => model.selection);
    const elements = selection.filter(item => item instanceof Element);
    
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
            className={cx(
                className,
                singleNewEntity ? `${CLASS_NAME}__delete` : `${CLASS_NAME}__remove`
            )}
            title={
                title ? title :
                singleNewEntity ? t.text('selection_action.remove.title_new') :
                elements.length === 1 ? t.text('selection_action.remove.title_single') :
                t.text('selection_action.remove.title')
            }
            hotkey={hotkey === undefined ? 'None+Delete' : hotkey}
            onSelect={() => {
                editor.removeSelectedElements();
                canvas.focus();
            }}
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
    const selection = useObservedProperty(model.events, 'changeSelection', () => model.selection);
    const elements = selection.filter(item => item instanceof Element);
    if (elements.length <= 1) {
        return null;
    }
    return (
        <SelectionAction {...otherProps}
            className={cx(className, `${CLASS_NAME}__zoomToFit`)}
            title={title ?? t.text('selection_action.zoom_to_fit.title')}
            onSelect={() => {
                const links = new Set<Link>();
                for (const element of elements) {
                    for (const link of model.getElementLinks(element)) {
                        links.add(link);
                    }
                }
                const fittingBox = getContentFittingBox(elements, links, canvas.renderingState);
                void canvas.zoomToFitRect(fittingBox, {animate: true});
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
    const {performLayout} = useWorkspace();
    const t = useTranslation();
    const selection = useObservedProperty(model.events, 'changeSelection', () => model.selection);
    const elements = selection.filter(item => item instanceof Element);
    if (elements.length <= 1) {
        return null;
    }
    return (
        <SelectionAction {...otherProps}
            className={cx(className, `${CLASS_NAME}__layout`)}
            title={title ?? t.text('selection_action.layout.title')}
            onSelect={() => {
                void performLayout({
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
 * This action is visible only when at least one of the selected elements
 * have {@link TemplateProperties.Expanded} property in {@link ElementTemplate.supports}.
 *
 * Expanding or collapsing the elements adds a command to the command history.
 *
 * @category Components
 */
export function SelectionActionExpand(props: SelectionActionExpandProps) {
    const {className, title, ...otherProps} = props;
    const {canvas} = useCanvas();
    const {model} = useWorkspace();
    const t = useTranslation();

    const selection = useObservedProperty(model.events, 'changeSelection', () => model.selection);
    const elements = selection.filter(item => item instanceof Element);
    const elementExpandedStore = useElementExpandedStore(model, elements);

    const canExpand = (element: Element) => {
        const template = canvas.renderingState.getElementTemplate(element);
        return Boolean(template.supports?.[TemplateProperties.Expanded]);
    };
    const allExpanded = useSyncStore(
        useLayerDebouncedStore(elementExpandedStore, canvas.renderingState),
        () => elements.every(element => !canExpand(element) || element.isExpanded)
    );

    if (!elements.some(canExpand)) {
        return null;
    }

    return (
        <SelectionAction {...otherProps}
            className={cx(
                className,
                allExpanded ? `${CLASS_NAME}__collapse` : `${CLASS_NAME}__expand`
            )}
            title={title ?? (
                elements.length === 1
                    ? t.text('selection_action.expand.title_single')
                    : t.text('selection_action.expand.title')
            )}
            onSelect={() => {
                if (elements.length === 1) {
                    const target = elements[0];
                    model.history.execute(setElementExpanded(target, !target.isExpanded));
                } else {
                    const batch = model.history.startBatch(
                        allExpanded
                            ? TranslatedText.text('selection_action.expand.collapse_command')
                            : TranslatedText.text('selection_action.expand.expand_command')
                    );
                    for (const element of elements) {
                        if (canExpand(element)) {
                            batch.history.execute(setElementExpanded(element, !allExpanded));
                        }
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
            if (data.changeElementState && elementSet.has(data.changeElementState.source)) {
                const previousExpanded = Boolean(
                    data.changeElementState.previous.get(TemplateProperties.Expanded)
                );
                if (data.changeElementState.source.isExpanded !== previousExpanded) {
                    onChange();
                }
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
    /**
     * Additional props for the inner `<a>` element.
     *
     * See {@link DataLocaleProvider.prepareAnchor()} for default anchor props.
     */
    anchorProps?: React.HTMLProps<HTMLAnchorElement>;
    /**
     * Handler to call when the action is selected.
     */
    onSelect?: (target: EntityElement, e: React.MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Selection action component to display a link to the entity IRI.
 *
 * This action is visible only if the selected element is an {@link EntityElement}.
 *
 * @category Components
 */
export function SelectionActionAnchor(props: SelectionActionAnchorProps) {
    const {dock, dockRow, dockColumn, className, title, anchorProps, onSelect} = props;
    const {model} = useWorkspace();
    const t = useTranslation();
    const target = useSingleSelectedElement(model);
    if (!(target instanceof EntityElement)) {
        return null;
    }
    const preparedAnchor = model.locale.prepareAnchor(target.iri);
    return (
        <a {...preparedAnchor}
            role='button'
            {...anchorProps}
            className={cx(
                CLASS_NAME,
                getDockClass(dock),
                className,
                `${CLASS_NAME}__link`
            )}
            style={getDockStyle(dockRow, dockColumn)}
            title={title ?? t.text('selection_action.anchor.title')}
            onClick={e => {
                if (onSelect) {
                    onSelect(target, e);
                } else {
                    preparedAnchor.onClick?.(e);
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
export interface SelectionActionConnectionsProps extends SelectionActionStyleProps {}

/**
 * Selection action component to open a {@link ConnectionsMenu} for the selected entities.
 *
 * This action is visible if at least one {@link EntityElement} or {@link EntityGroup}
 * is selected.
 *
 * @category Components
 */
export function SelectionActionConnections(props: SelectionActionConnectionsProps) {
    const {className, title, ...otherProps} = props;
    const {model, overlay, getCommandBus} = useWorkspace();
    const t = useTranslation();

    const menuOpened = useObservedProperty(
        overlay.events,
        'changeOpenedDialog',
        () => overlay.openedDialog?.knownType === BuiltinDialogType.connectionsMenu
    );

    const selection = useObservedProperty(model.events, 'changeSelection', () => model.selection);
    const elements = selection.filter(item => item instanceof Element);

    let entityCount = 0;
    for (const element of elements) {
        for (const _entity of iterateEntitiesOf(element)) {
            entityCount++;
        }
    }

    const commands = getCommandBus(ConnectionsMenuTopic);
    const event: ConnectionsMenuCommands['findCapabilities'] = {capabilities: []};
    commands.trigger('findCapabilities', event);

    if (!(event.capabilities.length > 0 && entityCount > 0)) {
        return null;
    }

    return (
        <SelectionAction {...otherProps}
            className={cx(
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
export interface SelectionActionAddToFilterProps extends SelectionActionStyleProps {}

/**
 * Selection action component to add the selected entity to the {@link InstancesSearch} filter.
 *
 * This action is visible only if the selected element is an {@link EntityElement}.
 *
 * @category Components
 */
export function SelectionActionAddToFilter(props: SelectionActionAddToFilterProps) {
    const {className, title, ...otherProps} = props;
    const {model, getCommandBus} = useWorkspace();
    const t = useTranslation();

    const target = useSingleSelectedElement(model);
    const commands = getCommandBus(InstancesSearchTopic);
    const event: InstancesSearchCommands['findCapabilities'] = {capabilities: []};
    commands.trigger('findCapabilities', event);

    if (!(target instanceof EntityElement && event.capabilities.length > 0)) {
        return null;
    }
    return (
        <SelectionAction {...otherProps}
            className={cx(className, `${CLASS_NAME}__add-to-filter`)}
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
export interface SelectionActionGroupProps extends SelectionActionStyleProps {
    /**
     * @default "None+G"
     */
    hotkey?: HotkeyString | null;
}

/**
 * Selection action component to group or ungroup selected elements.
 *
 * Selected elements can be grouped if only {@link EntityElement entity elements}
 * are selected, the elements can be ungrouped if only {@link EntityGroup entity groups}
 * are selected.
 *
 * Grouping or un-grouping the elements adds a command to the command history.
 *
 * @category Components
 */
export function SelectionActionGroup(props: SelectionActionGroupProps) {
    const {className, title, hotkey, ...otherProps} = props;
    const {canvas} = useCanvas();
    const workspace = useWorkspace();
    const t = useTranslation();
    const {model} = workspace;

    const selection = useObservedProperty(model.events, 'changeSelection', () => model.selection);
    const elements = selection.filter(item => item instanceof Element);

    const canGroup = elements.length > 0 && elements.every(element => element instanceof EntityElement);
    const canUngroup = elements.length > 0 && elements.every(element => element instanceof EntityGroup);

    const onSelect = async () => {
        if (canGroup) {
            const group = await groupEntities(workspace, {elements, canvas});
            model.setSelection([group]);
            group.focus();
        } else if (canUngroup) {
            const ungrouped = await ungroupAllEntities(workspace, {groups: elements, canvas});
            model.setSelection(ungrouped);
            canvas.focus();
        }
    };

    if (
        elements.length === 0 ||
        elements.length === 1 && canGroup ||
        elements.every(element => element instanceof AnnotationElement)
    ) {
        return null;
    }

    return (
        <SelectionAction {...otherProps}
            className={cx(
                className,
                canUngroup ? `${CLASS_NAME}__ungroup` : `${CLASS_NAME}__group`
            )}
            disabled={!(canGroup || canUngroup)}
            title={title ?? (
                canUngroup
                    ? t.text('selection_action.group.title_ungroup')
                    : t.text('selection_action.group.title')
            )}
            hotkey={hotkey === undefined ? 'None+G' : hotkey}
            onSelect={onSelect}
        />
    );
}

/**
 * Props for {@link SelectionActionEstablishLink} component.
 *
 * @see {@link SelectionActionEstablishLink}
 */
export interface SelectionActionEstablishLinkProps extends SelectionActionStyleProps {
    /**
     * If specified, creates the relation link of that type.
     */
    linkType?: LinkTypeIri;
}

/**
 * Selection action component to start creating a link to an existing or a new element.
 *
 * This action is visible either if selected element is an {@link AnnotationElement}
 * it is an {@link EntityElement} and {@link EditorController.inAuthoringMode graph authoring mode}
 * is active.
 *
 * Creating a link adds a command to the command history.
 *
 * @category Components
 */
export function SelectionActionEstablishLink(props: SelectionActionEstablishLinkProps) {
    const {model} = useCanvas();

    const target = useSingleSelectedElement(model);

    if (target instanceof EntityElement) {
        return <SelectionActionEstablishRelation {...props} target={target} />;
    } else if (target instanceof AnnotationElement) {
        return <SelectionActionEstablishAnnotationLink {...props} target={target} />;
    } else {
        return null;
    }
}

function SelectionActionEstablishRelation(
    props: SelectionActionEstablishLinkProps & { target: EntityElement }
) {
    const {target, className, title, linkType, ...otherProps} = props;
    const {canvas} = useCanvas();
    const {editor, getCommandBus} = useWorkspace();
    const t = useTranslation();

    const inAuthoringMode = useObservedProperty(
        editor.events, 'changeMode', () => editor.inAuthoringMode
    );
    
    const canLink = useCanEstablishLink(
        editor,
        inAuthoringMode ? target : undefined,
        linkType
    );

    if (!inAuthoringMode) {
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
            className={cx(
                className,
                `${CLASS_NAME}__establish-link`
            )}
            disabled={!canLink}
            title={title ?? (
                canLink
                    ? t.text('selection_action.establish_relation.title')
                    : t.text('selection_action.establish_relation.title_disabled')
            )}
            onPointerDown={e => {
                e.preventDefault();
                const point = canvas.metrics.pageToPaperCoords(e.pageX, e.pageY);
                getCommandBus(VisualAuthoringTopic)
                    .trigger('startDragEdit', {
                        operation: {
                            mode: 'connect',
                            source: target,
                            linkType,
                            point,
                        },
                    });
            }}
        />
    );
}

function useCanEstablishLink(
    editor: EditorController,
    target: Element | undefined,
    linkType: LinkTypeIri | undefined
): boolean | undefined {
    const {canvas} = useCanvas();

    const entityTarget = target instanceof EntityElement ? target : undefined;
    const loadDataStore = useEventStore(entityTarget?.events, 'changeData');
    const targetData = useSyncStore(loadDataStore, () => entityTarget?.data);

    const authoringStateStore = useEventStore(editor.events, 'changeAuthoringState');
    const authoringState = useSyncStore(
        useLayerDebouncedStore(authoringStateStore, canvas.renderingState),
        () => editor.authoringState
    );
    const authoringEvent = target instanceof EntityElement
        ? authoringState.elements.get(target.iri) : undefined;

    const {data: canLink, status} = useAsync({
        input: [editor.metadataProvider, targetData, authoringEvent, linkType],
        load: async ([provider, targetData, authoringEvent, linkType], {signal}) => {
            if (
                provider &&
                targetData &&
                !(authoringEvent && authoringEvent.type === 'entityDelete')
            ) {
                const connections = await provider.canConnect(
                    targetData, undefined, linkType, {signal}
                );
                return connections.length > 0;
            }
            return false;
        },
    });

    return status === 'completed' ? canLink : undefined;
}

function SelectionActionEstablishAnnotationLink(
    props: SelectionActionEstablishLinkProps & { target: AnnotationElement }
) {
    const {target, className, title, linkType, ...otherProps} = props;
    const {canvas} = useCanvas();
    const {getCommandBus} = useWorkspace();
    const t = useTranslation();

    const commands = getCommandBus(AnnotationTopic);
    const event: AnnotationCommands['findCapabilities'] = {capabilities: []};
    commands.trigger('findCapabilities', event);

    if (event.capabilities.length === 0) {
        return null;
    }

    return (
        <SelectionAction {...otherProps}
            className={cx(
                className,
                `${CLASS_NAME}__establish-link`
            )}
            title={title ?? t.text('selection_action.establish_relation.title')}
            onPointerDown={e => {
                e.preventDefault();
                const point = canvas.metrics.pageToPaperCoords(e.pageX, e.pageY);
                getCommandBus(AnnotationTopic)
                    .trigger('startDragOperation', {
                        operation: {mode: 'connect', source: target, point},
                    });
            }}
        />
    );
}

/**
 * Props for {@link SelectionActionAnnotate} component.
 *
 * @see {@link SelectionActionAnnotate}
 */
export interface SelectionActionAnnotateProps extends SelectionActionStyleProps {
    /**
     * Initial annotation content.
     *
     * @default Translation.text('selection_action.annotate.defaultContent')
     */
    initialContent?: AnnotationContent | GetInitialAnnotationContent | null;
}

type GetInitialAnnotationContent = (elements: readonly Element[]) => AnnotationContent | undefined;

/**
 * Selection action component to create a new annotaion element
 * connected to the selected elements.
 *
 * @category Components
 */
export function SelectionActionAnnotate(props: SelectionActionAnnotateProps) {
    const {className, title, initialContent, ...otherProps} = props;
    const {model, getCommandBus} = useWorkspace();
    const t = useTranslation();

    const selection = useObservedProperty(model.events, 'changeSelection', () => model.selection);
    const elements = selection.filter(item => item instanceof Element);

    const commands = getCommandBus(AnnotationTopic);
    const event: AnnotationCommands['findCapabilities'] = {capabilities: []};
    commands.trigger('findCapabilities', event);

    if (elements.length === 0 || event.capabilities.length === 0) {
        return null;
    }

    return (
        <SelectionAction {...otherProps}
            className={cx(
                className,
                `${CLASS_NAME}__annotate`
            )}
            title={title ?? t.text('selection_action.annotate.title')}
            onSelect={() => {
                let content: AnnotationContent | undefined;
                if (typeof initialContent === 'function') {
                    content = initialContent(elements);
                } else if (initialContent === undefined) {
                    content = {
                        type: 'plaintext',
                        text: t.text('selection_action.annotate.defaultContent'),
                    };
                } else if (initialContent !== null) {
                    content = initialContent;
                }

                getCommandBus(AnnotationTopic)
                    .trigger('createAnnotation', {
                        targets: elements,
                        content,
                    });
            }}
        />
    );
}
