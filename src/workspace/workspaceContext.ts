import * as React from 'react';

import type { CanvasApi } from '../diagram/canvasApi';
import type { LayoutFunction } from '../diagram/layout';
import type { DiagramView } from '../diagram/view';

import type { AsyncModel } from '../editor/asyncModel';
import type { EditorController } from '../editor/editorController';
import type { OverlayController } from '../editor/overlayController';

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

export interface WorkspaceContext {
    readonly model: AsyncModel;
    readonly view: DiagramView;
    readonly editor: EditorController;
    readonly overlayController: OverlayController;
    readonly disposeSignal: AbortSignal;
    readonly performLayout: WorkspacePerformLayout;
    readonly triggerWorkspaceEvent: WorkspaceEventHandler;
}

export type WorkspacePerformLayout = (params: {
    canvas: CanvasApi;
    layoutFunction: LayoutFunction;
    animate?: boolean;
    signal?: AbortSignal;
}) => Promise<void>;

export const WorkspaceContext = React.createContext<WorkspaceContext | null>(null);
