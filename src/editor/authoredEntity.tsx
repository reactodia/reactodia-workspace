import * as React from 'react';

import { mapAbortedToNull } from '../coreUtils/async';
import { useObservedProperty } from '../coreUtils/hooks';

import { ElementModel } from '../data/model';

import { Element } from '../diagram/elements';

import { EntityElement } from '../editor/dataElements';

import { useWorkspace } from '../workspace/workspaceContext';

/**
 * Graph authoring status for an entity.
 */
export interface AuthoredEntityContext {
    /**
     * The new IRI if entity IRI has changed in the entity data,
     * otherwise `undefined`.
     */
    editedIri?: string;
    /**
     * Whether its allowed to change the entity data.
     */
    canEdit: boolean | undefined;
    /**
     * Whether its allowed to delete the entity.
     */
    canDelete: boolean | undefined;
    /**
     * Handler to begin editing the entity data from the UI.
     */
    onEdit: (target: Element) => void;
    /**
     * Handler to delete the entity.
     */
    onDelete: () => void;
}

enum AllowedActions {
    None = 0,
    Edit = 1,
    Delete = 2,
    All = Edit | Delete,
}

/**
 * React hook to load entity authoring status for the graph authoring.
 *
 * @category Hooks
 */
export function useAuthoredEntity(
    data: ElementModel | undefined,
    shouldLoad: boolean
): AuthoredEntityContext {
    const {editor, overlay} = useWorkspace();

    const [allowedActions, setAllowedActions] = React.useState<AllowedActions | undefined>();

    const authoringState = useObservedProperty(
        editor.events,
        'changeAuthoringState',
        () => editor.authoringState
    );
    const authoringEvent = data ? authoringState.elements.get(data.id) : undefined;

    React.useEffect(() => {
        const cancellation = new AbortController();
        if (!data) {
            setAllowedActions(AllowedActions.None);
        } else if (shouldLoad) {
            if (!editor.metadataApi || (authoringEvent && authoringEvent.deleted)) {
                setAllowedActions(AllowedActions.None);
            } else {
                mapAbortedToNull(
                    Promise.all([
                        editor.metadataApi.canEditElement(data, cancellation.signal),
                        editor.metadataApi.canDeleteElement(data, cancellation.signal),
                    ]),
                    cancellation.signal
                ).then(result => {
                    if (result === null) { return; }
                    const [canEdit, canDelete] = result;
                    setAllowedActions(
                        (canEdit ? AllowedActions.Edit : AllowedActions.None) |
                        (canDelete ? AllowedActions.Delete : AllowedActions.None)
                    );
                });
            }
        }
        return () => cancellation.abort();
    }, [data, authoringEvent, shouldLoad]);

    return {
        editedIri: authoringEvent ? authoringEvent.newIri : undefined,
        canEdit: allowedActions === undefined
            ? undefined : Boolean(allowedActions & AllowedActions.Edit),
        canDelete: allowedActions === undefined
            ? undefined : Boolean(allowedActions & AllowedActions.Delete),
        onEdit: (target: Element) => {
            if (target instanceof EntityElement) {
                overlay.showEditEntityForm(target);
            }
        },
        onDelete: () => {
            if (data) {
                editor.deleteEntity(data.id);
            }
        },
    };
}
