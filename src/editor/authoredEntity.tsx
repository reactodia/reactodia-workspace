import * as React from 'react';

import { mapAbortedToNull } from '../coreUtils/async';
import { useObservedProperty } from '../coreUtils/hooks';

import { Element } from '../diagram/elements';

import { EntityElement } from '../editor/dataElements';

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
    element: Element,
    shouldLoad: boolean
): AuthoredEntityContext {
    const data = element instanceof EntityElement ? element.data : undefined;
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
        onEdit: () => {
            if (element instanceof EntityElement) {
                overlay.showEditEntityForm(element);
            }
        },
        onDelete: () => {
            if (data) {
                editor.deleteEntity(data.id);
            }
        },
    };
}
