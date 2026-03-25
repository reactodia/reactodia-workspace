import * as React from 'react';

import { EventObserver } from '../../coreUtils/events';
import {
    useEventStore, useObservedProperty, useSyncStore,
} from '../../coreUtils/hooks';
import { useTranslation } from '../../coreUtils/i18n';

import type { ElementModel } from '../../data/model';
import { useCanvas } from '../../diagram/canvasApi';
import { Link } from '../../diagram/elements';
import { useLayerDebouncedStore } from '../../diagram/renderingState';

import { AuthoringState } from '../../editor/authoringState';
import { BuiltinDialogType } from '../../editor/builtinDialogType';
import { EntityElement, RelationLink } from '../../editor/dataElements';

import { VisualAuthoringTopic } from '../../workspace/commandBusTopic';
import { useWorkspace } from '../../workspace/workspaceContext';

import { FindOrCreateEntityForm } from '../editorForms/findOrCreateEntityForm';

import { AuthoredEntityDecorator } from './authoredEntityDecorator';
import { AuthoredRelationOverlay } from './authoredRelationOverlay';
import { DragEditLayer, DragEditOperation } from './dragEditLayer';

/**
 * Props for {@link VisualAuthoring} component.
 *
 * @see {@link VisualAuthoring}
 */
export interface VisualAuthoringProps {
    /**
     * Provides property editor for elements and links in the graph authoring mode.
     *
     * @see {@link DefaultPropertyEditor}
     */
    propertyEditor: PropertyEditor;
    /**
     * Whether to display inline authoring actions (edit, delete) on entity elements.
     *
     * @default true
     */
    inlineEntityActions?: boolean;
}

/**
 * Provides editor for the entity or relation data.
 *
 * @see {@link VisualAuthoringProps.propertyEditor}
 */
export type PropertyEditor = (options: PropertyEditorOptions) => React.ReactElement;

/**
 * Parameters for {@link PropertyEditor}.
 */
export type PropertyEditorOptions =
    | PropertyEditorOptionsEntity
    | PropertyEditorOptionsRelation;

/**
 * Parameters for {@link PropertyEditor} for an entity target.
 */
export interface PropertyEditorOptionsEntity {
    /**
     * Type for the target to edit.
     */
    readonly type: 'entity';
    /**
     * Target entity element to edit.
     */
    readonly target: EntityElement;
    /**
     * Handler to close the editor after editing is finished or cancelled.
     */
    readonly onClose: () => void;
}

/**
 * Parameters for {@link PropertyEditor} for a relation target.
 *
 * @see {@link RelationTypeSelector}
 */
export interface PropertyEditorOptionsRelation {
    /**
     * Type for the target to edit.
     */
    readonly type: 'relation';
    /**
     * Target relation link to edit.
     */
    readonly target: RelationLink;
    /**
     * Handler to re-open the editor for the new link with changed endpoints.
     */
    readonly onChangeTarget: (newLink: RelationLink) => void;
    /**
     * Handler to close the editor after editing is finished or cancelled.
     */
    readonly onClose: () => void;
}

/**
 * Events for {@link VisualAuthoring} event bus.
 *
 * @see {@link VisualAuthoring}
 * @see {@link VisualAuthoringTopic}
 */
export interface VisualAuthoringCommands {
    /**
     * Can be triggered to start drag operaton on a relation.
     */
    startDragEdit: {
        /**
         * Drag relation operation to initiate.
         */
        readonly operation: DragEditOperation;
    };
    /**
     * Can be triggered to open dialog to edit an entity.
     */
    editEntity: {
        /**
         * Target entity element to edit.
         */
        readonly target: EntityElement | ElementModel;
    };
    /**
     * Can be triggered to open dialog to find existing or create a new entity
     * at the relation endpoint, then replace the `target` with it.
     */
    findOrCreateEntity: {
        /**
         * Target relation link connected to an exising or a new entity.
         */
        readonly link: RelationLink;
        /**
         * An exising or a new entity element to replace.
         */
        readonly target: EntityElement;
    };
    /**
     * Can be triggered to open dialog to edit a relation.
     */
    editRelation: {
        /**
         * Target relation link to edit.
         */
        readonly target: RelationLink;
    };
    /**
     * Can be triggered to open dialog to {@link RenameLinkProvider rename a link}.
     *
     * @deprecated Use {@link AnnotationCommands.renameLink} from {@link AnnotationTopic} instead.
     */
    renameLink: {
        /**
         * Target link to rename (change its label).
         */
        readonly target: Link;
    };
}

/**
 * Canvas widget component to provide UI for the visual graph authoring.
 *
 * @category Components
 */
export function VisualAuthoring(props: VisualAuthoringProps) {
    const {propertyEditor, inlineEntityActions = true} = props;
    const {model, editor, overlay, getCommandBus} = useWorkspace();
    const t = useTranslation();

    React.useLayoutEffect(() => {
        const listener = new EventObserver();

        listener.listen(overlay.events, 'changeOpenedDialog', ({previous}) => {
            if (previous && previous.target) {
                editor.removeTemporaryCells([previous.target]);
            }
        });

        return () => {
            listener.stopListening();
        };
    }, []);

    React.useLayoutEffect(() => {
        const commands = getCommandBus(VisualAuthoringTopic);
        const listener = new EventObserver();

        listener.listen(commands, 'editEntity', ({target}) => {
            let editorTarget: EntityElement;
            if (target instanceof EntityElement) {
                editorTarget = target;
            } else {
                // Use "virtual" target which is not on the canvas
                editorTarget = new EntityElement({data: target});
            }

            const content = propertyEditor({
                type: 'entity',
                target: editorTarget,
                onClose: () => overlay.hideDialog(),
            });

            overlay.showDialog({
                target: target instanceof EntityElement ? target : undefined,
                dialogType: BuiltinDialogType.editEntity,
                style: {
                    caption: t.text('visual_authoring.edit_entity.dialog.caption'),
                    defaultSize: {width: 340, height: 400},
                },
                content,
                holdSelection: true,
            });
        });

        listener.listen(commands, 'findOrCreateEntity', e => {
            const {link, target} = e;
            const source = model.getElement(link.sourceId) as EntityElement;
            const targetIsNew = editor.temporaryState.elements.has(target.iri);
            const content = (
                <FindOrCreateEntityForm source={source}
                    target={target}
                    initialTargetIsNew={targetIsNew}
                    originalLink={link}
                    onAfterApply={() => {
                        overlay.hideDialog();
                        if (AuthoringState.isAddedEntity(editor.authoringState, target.iri)) {
                            commands.trigger('editEntity', {target});
                        }
                    }}
                    onCancel={() => overlay.hideDialog()}
                    translation={t}
                />
            );
            overlay.showDialog({
                target,
                dialogType: BuiltinDialogType.findOrCreateEntity,
                style: {
                    caption: t.text('visual_authoring.find_or_create.dialog.caption'),
                    minSize: {width: 250, height: 320},
                },
                content,
                onClose: () => editor.removeAllTemporaryCells(),
            });
        });

        listener.listen(commands, 'editRelation', ({target: link}) => {
            const caption = editor.temporaryState.links.has(link.data)
                ? t.text('visual_authoring.edit_relation.dialog.caption_new')
                : t.text('visual_authoring.edit_relation.dialog.caption');

            const content = propertyEditor({
                type: 'relation',
                target: link,
                onChangeTarget: newTarget => {
                    // Close current dialog before opening a new one to avoid
                    // target temporary link removal
                    overlay.hideDialog();
                    commands.trigger('editRelation', {target: newTarget});
                },
                onClose: () => overlay.hideDialog(),
            });

            overlay.showDialog({
                target: link,
                dialogType: BuiltinDialogType.editRelation,
                style: {
                    defaultSize: {width: 340, height: 300},
                    caption,
                },
                content,
                onClose: () => editor.removeTemporaryCells([link]),
            });
        });

        return () => listener.stopListening();
    }, []);

    return (
        <>
            <AuthoredRelationOverlay />
            <EntityDecorators inlineActions={inlineEntityActions} />
            <DragEditState />
        </>
    );
}

function EntityDecoratorsInner(props: {
    inlineActions: boolean;
}) {
    const {inlineActions} = props;
    const {canvas} = useCanvas();
    const {model, editor} = useWorkspace();

    const inAuthoringMode = useObservedProperty(
        editor.events,
        'changeMode',
        () => editor.inAuthoringMode
    );
    const cellsVersion = useSyncStore(
        useLayerDebouncedStore(
            useEventStore(model.events, 'changeCells'),
            canvas.renderingState
        ),
        () => model.cellsVersion
    );

    const cachedDecorators = React.useMemo(
        () => new WeakMap<EntityElement, React.ReactNode>(),
        [inlineActions, cellsVersion]
    );

    const decorators: React.ReactNode[] = [];
    if (inAuthoringMode) {
        for (const element of model.elements) {
            if (element instanceof EntityElement) {
                let decorator = cachedDecorators.get(element);
                if (!decorator) {
                    decorator = (
                        <AuthoredEntityDecorator key={element.id}
                            target={element}
                            inlineActions={inlineActions}
                        />
                    );
                    cachedDecorators.set(element, decorator);
                }
                decorators.push(decorator);
            }
        }
    }

    return decorators;
}

const EntityDecorators = React.memo(EntityDecoratorsInner);

function DragEditState() {
    const [layer, setLayer] = React.useState<React.ReactElement | null>(null);

    const {getCommandBus} = useWorkspace();

    React.useLayoutEffect(() => {
        const commands = getCommandBus(VisualAuthoringTopic);
        const listener = new EventObserver();

        listener.listen(commands, 'startDragEdit', ({operation}) => {
            setLayer(
                <DragEditLayer operation={operation}
                    onFinishEditing={() => setLayer(null)}
                />
            );
        });
    
        return () => listener.stopListening();
    }, []);

    return layer;
}
