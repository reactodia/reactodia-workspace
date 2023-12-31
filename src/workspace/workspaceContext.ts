import * as React from 'react';

import type { ElementTypeIri } from '../data/model';

import type { CanvasApi } from '../diagram/canvasApi';
import type { Element } from '../diagram/elements';
import type { LayoutFunction } from '../diagram/layout';
import type { SharedCanvasState } from '../diagram/sharedCanvasState';

import type { AsyncModel } from '../editor/asyncModel';
import type { EditorController } from '../editor/editorController';
import type { OverlayController } from '../editor/overlayController';

export interface WorkspaceContext {
    readonly model: AsyncModel;
    readonly view: SharedCanvasState;
    readonly editor: EditorController;
    readonly overlayController: OverlayController;
    readonly disposeSignal: AbortSignal;
    readonly getElementTypeStyle: (types: ReadonlyArray<ElementTypeIri>) => ProcessedTypeStyle;
    readonly performLayout: (params: {
        canvas: CanvasApi;
        layoutFunction: LayoutFunction;
        selectedElements?: ReadonlySet<Element>;
        animate?: boolean;
        signal?: AbortSignal;
    }) => Promise<void>;
    readonly triggerWorkspaceEvent: WorkspaceEventHandler;
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

export const WorkspaceContext = React.createContext<WorkspaceContext | null>(null);
