import * as React from 'react';

import type { ElementTypeIri } from '../data/model';

import type { CanvasApi } from '../diagram/canvasApi';
import type { Element } from '../diagram/elements';
import type { LayoutFunction } from '../diagram/layout';
import type { SharedCanvasState } from '../diagram/sharedCanvasState';

import type { DataDiagramModel } from '../editor/dataDiagramModel';
import type { EditorController } from '../editor/editorController';
import type { OverlayController } from '../editor/overlayController';

export interface WorkspaceContext {
    readonly model: DataDiagramModel;
    readonly view: SharedCanvasState;
    readonly editor: EditorController;
    readonly overlay: OverlayController;
    readonly disposeSignal: AbortSignal;
    readonly getElementTypeStyle: (types: ReadonlyArray<ElementTypeIri>) => ProcessedTypeStyle;
    readonly performLayout: (params: WorkspacePerformLayoutParams) => Promise<void>;
    readonly triggerWorkspaceEvent: WorkspaceEventHandler;
}

export interface WorkspacePerformLayoutParams {
    /**
     * Target canvas to get element sizes from and perform layout on.
     *
     * If not specified, uses the result from `SharedCanvasState.findAnyCanvas()`.
     * It is recommended to provide this value if possible for consistent
     * multi-canvas support.
     */
    canvas?: CanvasApi;
    /**
     * Layout function to use when computing element positions.
     *
     * Default is defined by `WorkspaceProps.defaultLayout`.
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
     * Signal to cancel computing and applying the layout.
     */
    signal?: AbortSignal;
}

export type WorkspaceEventHandler = (key: WorkspaceEventKey) => void;
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

export interface ProcessedTypeStyle {
    readonly color: string;
    readonly icon: string | undefined;
}

/** @hidden */
export const WorkspaceContext = React.createContext<WorkspaceContext | null>(null);

export function useWorkspace(): WorkspaceContext {
    const context = React.useContext(WorkspaceContext);
    if (!context) {
        throw new Error('Missing Reactodia workspace context');
    }
    return context;
}
