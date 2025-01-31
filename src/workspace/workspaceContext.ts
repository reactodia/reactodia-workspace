import * as React from 'react';

import type { Translation } from '../coreUtils/i18n';

import type { ElementIri, ElementTypeIri } from '../data/model';

import type { CanvasApi } from '../diagram/canvasApi';
import type { Element } from '../diagram/elements';
import type { LayoutFunction } from '../diagram/layout';
import type { SharedCanvasState } from '../diagram/sharedCanvasState';

import type { DataDiagramModel } from '../editor/dataDiagramModel';
import type { EntityElement, EntityGroup } from '../editor/dataElements';
import type { EditorController } from '../editor/editorController';
import type { OverlayController } from '../editor/overlayController';

/**
 * Represents a context for the whole workspace, its stores and services.
 *
 * This context is created once and exists for the full lifetime of the workspace.
 */
export interface WorkspaceContext {
    /**
     * Stores the diagram content and asynchronously fetches from a data provider.
     */
    readonly model: DataDiagramModel;
    /**
     * Stores common state and settings for all canvases in the workspace.
     */
    readonly view: SharedCanvasState;
    /**
     * Stores, modifies and validates changes from the visual graph authoring.
     */
    readonly editor: EditorController;
    /**
     * Controls UI overlays for the canvases, including dialogs and tasks.
     */
    readonly overlay: OverlayController;
    /**
     * Provides a translation for UI text strings.
     */
    readonly translation: Translation;
    /**
     * Cancellation signal that becomes aborted when the workspace is disposed.
     */
    readonly disposeSignal: AbortSignal;

    /**
     * Computes a style to display target element in various parts of the UI.
     */
    readonly getElementStyle: (element: Element) => ProcessedTypeStyle;
    /**
     * Computes a style to display an element with target set of types
     * in various parts of the UI.
     */
    readonly getElementTypeStyle: (types: ReadonlyArray<ElementTypeIri>) => ProcessedTypeStyle;
    /**
     * Computes and applies **with animation** graph layout algorithm on the diagram content.
     *
     * A spinner overlay will be displayed if layout calculation will take too long (> 200ms).
     *
     * The operation puts a command to the {@link DiagramModel.history command history}.
     */
    readonly performLayout: (params: WorkspacePerformLayoutParams) => Promise<void>;
    /**
     * Groups **with animation** multiple elements into an entity group.
     *
     * The operation puts a command to the {@link DiagramModel.history command history}.
     *
     * @see {@link DataDiagramModel.group}
     */
    readonly group: (params: WorkspaceGroupParams) => Promise<EntityGroup>;
    /**
     * Ungroups **with animation** one or many entity groups into all contained elements.
     *
     * The operation puts a command to the {@link DiagramModel.history command history}.
     *
     * @see {@link DataDiagramModel.ungroupAll}
     */
    readonly ungroupAll: (params: WorkspaceUngroupAllParams) => Promise<EntityElement[]>;
    /**
     * Ungroups **with animation** some entities from an entity group.
     *
     * The operation puts a command to the {@link DiagramModel.history command history}.
     *
     * @see {@link DataDiagramModel.ungroupSome}
     */
    readonly ungroupSome: (params: WorkspaceUngroupSomeParams) => Promise<EntityElement[]>;
    /**
     * Triggers a well-known workspace event.
     */
    readonly triggerWorkspaceEvent: (key: WorkspaceEventKey) => void;
}

/**
 * Options for {@link WorkspaceContext.performLayout} method.
 *
 * @see {@link WorkspaceContext.performLayout}
 */
export interface WorkspacePerformLayoutParams {
    /**
     * Target canvas to get element sizes from and perform layout algorithm on.
     *
     * If not specified, uses the result from {@link SharedCanvasState.findAnyCanvas}.
     * It is recommended to provide this value if possible for consistent
     * multi-canvas support.
     */
    canvas?: CanvasApi;
    /**
     * Layout function to use when computing element positions.
     *
     * Default is defined by {@link WorkspaceProps.defaultLayout}.
     */
    layoutFunction?: LayoutFunction;
    /**
     * Restrict the layout application to the subset of graph elements.
     */
    selectedElements?: ReadonlySet<Element>;
    /**
     * Whether moving elements to final layout positions should be animated.
     *
     * @default false
     */
    animate?: boolean;
    /**
     * Whether to fit elements into viewport after layout.
     * 
     * @default true
     */
    zoomToFit?: boolean;
    /**
     * Signal to cancel computing and applying the layout.
     */
    signal?: AbortSignal;
}

/**
 * Options for {@link WorkspaceContext.group} method.
 *
 * @see {@link WorkspaceContext.group}
 */
export interface WorkspaceGroupParams {
    /**
     * Selected elements to group.
     */
    elements: ReadonlyArray<EntityElement>;
    /**
     * Target canvas to get element sizes from for animation.
     */
    canvas: CanvasApi;
}

/**
 * Options for {@link WorkspaceContext.ungroupAll} method.
 *
 * @see {@link WorkspaceContext.ungroupAll}
 */
export interface WorkspaceUngroupAllParams {
    /**
     * Selected groups to ungroup all entities from.
     */
    groups: ReadonlyArray<EntityGroup>;
    /**
     * Target canvas to get element sizes from for animation.
     */
    canvas: CanvasApi;
}

/**
 * Options for {@link WorkspaceContext.ungroupSome} method.
 *
 * @see {@link WorkspaceContext.ungroupSome}
 */
export interface WorkspaceUngroupSomeParams {
    /**
     * Selected group to ungroup some entities from.
     */
    group: EntityGroup;
    /**
     * Subset of entities to ungroup from the target group.
     */
    entities: ReadonlySet<ElementIri>;
    /**
     * Target canvas to get element sizes from for animation.
     */
    canvas: CanvasApi;
}

/**
 * Well-known workspace events.
 */
export enum WorkspaceEventKey {
    searchUpdateCriteria = 'search:updateCriteria',
    searchQueryItem = 'search:queryItems',
    connectionsLoadLinks = 'connections:loadLinks',
    connectionsExpandLink = 'connections:expandLink',
    connectionsLoadElements = 'connections:loadElements',
    editorChangeSelection = 'editor:changeSelection',
    editorToggleDialog = 'editor:toggleDialog',
    editorAddElements = 'editor:addElements',
}

/**
 * Represents a computed style to display an element in various parts of the UI.
 */
export interface ProcessedTypeStyle {
    /**
     * CSS color string.
     */
    readonly color: string;
    /**
     * Icon image URL.
     */
    readonly icon: string | undefined;
}

/** @hidden */
export const WorkspaceContext = React.createContext<WorkspaceContext | null>(null);

/**
 * React hook to get current workspace context.
 *
 * Throws an error if called from component which is outside the workspace.
 *
 * @category Hooks
 */
export function useWorkspace(): WorkspaceContext {
    const context = React.useContext(WorkspaceContext);
    if (!context) {
        throw new Error('Missing Reactodia workspace context');
    }
    return context;
}
