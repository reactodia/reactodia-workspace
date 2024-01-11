import * as React from 'react';

import { mapAbortedToNull } from '../coreUtils/async';
import { useObservedProperty } from '../coreUtils/hooks';

import { ElementModel } from '../data/model';

import { useWorkspace } from '../workspace/workspaceContext';

export interface AuthoredEntityContext {
    editedIri?: string;
    canEdit: boolean | undefined;
    canDelete: boolean | undefined;
    onEdit: () => void;
    onDelete: () => void;
}

enum AllowedActions {
    None = 0,
    Edit = 1,
    Delete = 2,
    All = Edit | Delete,
}

export function useAuthoredEntity(
    elementId: string,
    data: ElementModel,
    shouldLoad: boolean
): AuthoredEntityContext {
    const {model, editor, overlayController} = useWorkspace();

    const [allowedActions, setAllowedActions] = React.useState<AllowedActions | undefined>();

    const authoringState = useObservedProperty(
        editor.events,
        'changeAuthoringState',
        () => editor.authoringState
    );
    const authoringEvent = authoringState.elements.get(data.id);

    React.useEffect(() => {
        const cancellation = new AbortController();
        if (shouldLoad) {
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
        onEdit: () => {
            const element = model.getElement(elementId);
            if (element) {
                overlayController.showEditEntityForm(element);
            }
        },
        onDelete: () => {
            editor.deleteEntity(data.id);
        },
    };
}
