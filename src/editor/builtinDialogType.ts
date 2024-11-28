import type { OverlayDialogType } from './overlayController';

/**
 * Well-known overlay dialog types for the built-in workspace components.
 *
 * @category Constants
 */
export const BuiltinDialogType = {
    connectionsMenu: 'reactodia:connectionsMenu' as OverlayDialogType,
    editEntity: 'reactodia:editEntity' as OverlayDialogType,
    editRelation: 'reactodia:editRelation' as OverlayDialogType,
    findOrCreateEntity: 'reactodia:findOrCreateEntity' as OverlayDialogType,
    renameLink: 'reactodia:renameLink' as OverlayDialogType,
} as const;
