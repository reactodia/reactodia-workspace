import * as React from 'react';

import { EventObserver } from '../../coreUtils/events';
import {
    useEventStore, useObservedProperty, useSyncStore,
} from '../../coreUtils/hooks';

import type { ElementModel, LinkModel } from '../../data/model';
import { useCanvas } from '../../diagram/canvasApi';
import { Link } from '../../diagram/elements';
import { useLayerDebouncedStore } from '../../diagram/renderingState';

import { AuthoringState } from '../../editor/authoringState';
import { BuiltinDialogType } from '../../editor/builtinDialogType';
import { EntityElement, RelationLink } from '../../editor/dataElements';

import { FormInputList } from '../../forms/input/formInputList';
import { FormInputText } from '../../forms/input/formInputText';
import type { FormInputOrDefaultResolver } from '../../forms/input/inputCommon';
import { EditRelationForm } from '../../forms/editRelationForm';
import { EditEntityForm } from '../../forms/editEntityForm';
import { FindOrCreateEntityForm } from '../../forms/findOrCreateEntityForm';

import { VisualAuthoringTopic } from '../../workspace/commandBusTopic';
import { useWorkspace } from '../../workspace/workspaceContext';

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
     * Overrides default property editor for elements and links in the graph authoring mode.
     */
    propertyEditor?: PropertyEditor;
    /**
     * Overrides default input for a specific entity or relation property.
     *
     * **Unstable**: this feature will likely change in the future.
     */
    inputResolver?: FormInputOrDefaultResolver;
    /**
     * Whether to display inline authoring actions (edit, delete) on entity elements.
     *
     * @default true
     */
    inlineEntityActions?: boolean;
}

/**
 * Provides custom editor for the entity data.
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
     * Target entity data to edit.
     */
    readonly elementData: ElementModel;
    /**
     * Handler to submit changed entity data.
     *
     * Changed data may have a different entity IRI ({@link ElementModel.id})
     * in case when the entity identity needs to be changed.
     */
    readonly onSubmit: (newData: ElementModel) => void;
    /**
     * Handler to abort changing the entity, discarding the operation.
     */
    readonly onCancel?: () => void;
}

/**
 * Parameters for {@link PropertyEditor} for a relation target.
 */
export interface PropertyEditorOptionsRelation {
    /**
     * Type for the target to edit.
     */
    readonly type: 'relation';
    /**
     * Target relation data to edit.
     */
    readonly linkData: LinkModel;
    /**
     * Handler to submit changed relation data.
     */
    readonly onSubmit: (newData: LinkModel) => void;
    /**
     * Handler to abort changing the relation, discarding the operation.
     */
    readonly onCancel?: () => void;
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
        readonly target: EntityElement;
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
    const {propertyEditor, inputResolver, inlineEntityActions = true} = props;
    const {model, editor, overlay, translation: t, getCommandBus} = useWorkspace();

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
            const onSubmit = (newData: ElementModel) => {
                overlay.hideDialog();
                editor.changeEntity(target.data.id, newData);
            };
            let modelToEdit = target.data;
            const event = editor.authoringState.elements.get(target.data.id);
            if (event && event.type == 'entityChange' && event.newIri) {
                modelToEdit = {...target.data, id: event.newIri};
            }
            const onCancel = () => overlay.hideDialog();
            const content = propertyEditor ? (
                propertyEditor({
                    type: 'entity',
                    elementData: target.data,
                    onSubmit,
                    onCancel,
                })
            ) : (
                <EditEntityForm
                    entity={modelToEdit}
                    onApply={onSubmit}
                    onCancel={onCancel}
                    resolveInput={(property, inputProps) => {
                        const input = inputResolver?.(property, inputProps);
                        return input ?? <FormInputList {...inputProps} valueInput={FormInputText} />;
                    }}
                />
            );
            overlay.showDialog({
                target,
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
            const content = propertyEditor ? (
                propertyEditor({
                    type: 'relation',
                    linkData: link.data,
                    onSubmit: newData => {
                        editor.changeRelation(link.data, newData);
                        overlay.hideDialog();
                    },
                    onCancel: () => overlay.hideDialog(),
                })
            ) : (
                <EditRelationForm originalLink={link}
                    source={model.getElement(link.sourceId) as EntityElement}
                    target={model.getElement(link.targetId) as EntityElement}
                    onChangeTarget={newTarget => {
                        // Close current dialog before opening a new one to avoid
                        // target temporary link removal
                        overlay.hideDialog();
                        commands.trigger('editRelation', {target: newTarget});
                    }}
                    onAfterApply={() => overlay.hideDialog()}
                    onCancel={() => overlay.hideDialog()}
                    resolveInput={(property, inputProps) => {
                        const input = inputResolver?.(property, inputProps);
                        return input ?? <FormInputList {...inputProps} valueInput={FormInputText} />;
                    }}
                />
            );
            const caption = editor.temporaryState.links.has(link.data)
                ? t.text('visual_authoring.edit_relation.dialog.caption_new')
                : t.text('visual_authoring.edit_relation.dialog.caption');
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
