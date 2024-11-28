import * as React from 'react';

import { mapAbortedToNull } from '../../coreUtils/async';
import { useObservedProperty } from '../../coreUtils/hooks';

import { ElementModel } from '../../data/model';

import { Element } from '../../diagram/elements';

import { EntityElement } from '../../editor/dataElements';

import { useWorkspace } from '../../workspace/workspaceContext';

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

const NO_AUTHORING_CONTEXT: AuthoredEntityContext = {
    canEdit: false,
    canDelete: false,
    onEdit: () => {/* nothing */},
    onDelete: () => {/* nothing */},
};

/**
 * React hook to load entity authoring status for the graph authoring.
 *
 * @category Hooks
 */
export function useAuthoredEntity(
    data: ElementModel | undefined,
    shouldLoad: boolean
): AuthoredEntityContext {
    const {editor} = useWorkspace();

    const entity = editor.inAuthoringMode ? data : undefined;

    const [allowedActions, setAllowedActions] = React.useState<AllowedActions | undefined>();
   
    const authoringEvent = useObservedProperty(
        editor.events,
        'changeAuthoringState',
        () => entity ? editor.authoringState.elements.get(entity.id) : undefined
    );

    React.useEffect(() => {
        const cancellation = new AbortController();
        if (!entity) {
            setAllowedActions(AllowedActions.None);
        } else if (shouldLoad) {
            if (!editor.metadataApi || (authoringEvent && authoringEvent.deleted)) {
                setAllowedActions(AllowedActions.None);
            } else {
                mapAbortedToNull(
                    Promise.all([
                        editor.metadataApi.canEditElement(entity, cancellation.signal),
                        editor.metadataApi.canDeleteElement(entity, cancellation.signal),
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
    }, [entity, authoringEvent, shouldLoad]);

    if (!entity) {
        return NO_AUTHORING_CONTEXT;
    }

    return {
        editedIri: authoringEvent ? authoringEvent.newIri : undefined,
        canEdit: allowedActions === undefined
            ? undefined : Boolean(allowedActions & AllowedActions.Edit),
        canDelete: allowedActions === undefined
            ? undefined : Boolean(allowedActions & AllowedActions.Delete),
        onEdit: (target: Element) => {
            if (target instanceof EntityElement) {
                editor.authoringCommands.trigger('editEntity', {target});
            }
        },
        onDelete: () => {
            editor.deleteEntity(entity.id);
        },
    };
}
