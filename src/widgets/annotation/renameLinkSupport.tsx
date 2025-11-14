import * as React from 'react';

import { EventObserver } from '../../coreUtils/events';

import { Size } from '../../diagram/geometry';
import { BuiltinDialogType } from '../../editor/builtinDialogType';
import { RenameLinkForm } from '../../forms/renameLinkForm';

import { AnnotationTopic, VisualAuthoringTopic } from '../../workspace/commandBusTopic';
import { useWorkspace } from '../../workspace/workspaceContext';

import type { AnnotationCommands } from './annotationSupport';

export function RenameLinkSupport() {
    const {overlay, translation: t, getCommandBus} = useWorkspace();

    React.useLayoutEffect(() => {
        const onRenameLink = ({target: link}: AnnotationCommands['renameLink']) => {
            const defaultSize: Size = {width: 300, height: 165};
            overlay.showDialog({
                target: link,
                dialogType: BuiltinDialogType.renameLink,
                style: {
                    defaultSize,
                    resizableBy: 'x',
                    caption: t.text('visual_authoring.rename_link.dialog.caption'),
                },
                content: (
                    <RenameLinkForm link={link}
                        onFinish={() => overlay.hideDialog()}
                    />
                ),
            });
        };

        const listener = new EventObserver();

        const commands = getCommandBus(AnnotationTopic);
        listener.listen(commands, 'renameLink', onRenameLink);

        // Listen for deprecated command for compatibility
        const authoringCommands = getCommandBus(VisualAuthoringTopic);
        listener.listen(authoringCommands, 'renameLink', onRenameLink);

        return () => listener.stopListening();
    }, []);

    return null;
}
