import * as React from 'react';

import { EventObserver } from '../../coreUtils/events';

import { ElementModel, equalLinks, equalProperties } from '../../data/model';
import { defineCanvasWidget } from '../../diagram/canvasWidget';
import { Link } from '../../diagram/elements';
import { Size } from '../../diagram/geometry';
import type { ElementDecoratorResolver } from '../../diagram/sharedCanvasState';

import { AuthoringState } from '../../editor/authoringState';
import { BuiltinDialogType } from '../../editor/builtinDialogType';
import { EntityElement, RelationLink } from '../../editor/dataElements';

import { EditRelationForm } from '../../forms/editRelationForm';
import { EditEntityForm } from '../../forms/editEntityForm';
import { FindOrCreateEntityForm } from '../../forms/findOrCreateEntityForm';
import { RenameLinkForm } from '../../forms/renameLinkForm';

import { useWorkspace } from '../../workspace/workspaceContext';

import { EditLayer, DragEditOperation } from './editLayer';
import { ElementDecorator } from './elementDecorator';
import { LinkStateWidget } from './linkStateWidget';

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
}

/**
 * Provides custom editor for the entity data.
 */
export type PropertyEditor = (options: PropertyEditorOptions) => React.ReactElement;
/**
 * Parameters for {@link PropertyEditor}.
 */
export interface PropertyEditorOptions {
    /**
     * Target entity data to edit.
     */
    elementData: ElementModel;
    /**
     * Handler to submit changed entity data.
     *
     * Changed data may have a different entity IRI ({@link ElementModel.id})
     * in case when the entity identity needs to be changed.
     */
    onSubmit: (newData: ElementModel) => void;
    /**
     * Handler to abort changing the entity, discarding the operation.
     */
    onCancel?: () => void;
}

/**
 * Events for {@link VisualAuthoring} event bus.
 *
 * @see {@link VisualAuthoring}
 */
export interface VisualAuthoringCommands {
    startDragEdit: {
        readonly operation: DragEditOperation;
    };
    editEntity: {
        readonly target: EntityElement;
    };
    findOrCreateEntity: {
        readonly link: RelationLink;
        readonly source: EntityElement;
        readonly target: EntityElement;
        readonly targetIsNew: boolean;
    };
    editRelation: {
        readonly target: RelationLink;
    };
    renameLink: {
        readonly target: Link;
    };
}

/**
 * Canvas widget component to provide UI for the visual graph authoring.
 *
 * @category Components
 */
export function VisualAuthoring(props: VisualAuthoringProps) {
    const {propertyEditor} = props;
    const {model, view, editor, overlay, translation: t} = useWorkspace();

    React.useLayoutEffect(() => {
        const listener = new EventObserver();

        view.setCanvasWidget('states', {
            element: <LinkStateWidget />,
            attachment: 'overLinks',
        });

        const authoringStateDecorator: ElementDecoratorResolver = element => {
            if (element instanceof EntityElement) {
                return (
                    <ElementDecorator target={element}
                        position={element.position}
                    />
                );
            }
            return undefined;
        };
        const updateElementDecorator = () => {
            view._setElementDecorator(
                editor.inAuthoringMode ? authoringStateDecorator : undefined
            );
        };
        listener.listen(editor.events, 'changeMode', () => updateElementDecorator());
        updateElementDecorator();

        listener.listen(overlay.events, 'changeOpenedDialog', ({previous}) => {
            if (previous && previous.target) {
                editor.removeTemporaryCells([previous.target]);
            }
        });

        return () => {
            listener.stopListening();
            view.setCanvasWidget('states', null);
            view._setElementDecorator(undefined);
        };
    }, []);

    React.useLayoutEffect(() => {
        const listener = new EventObserver();

        listener.listen(editor.authoringCommands, 'startDragEdit', ({operation}) => {
            const onFinishEditing = () => {
                view.setCanvasWidget('editLayer', null);
            };
            const editLayer = (
                <EditLayer operation={operation}
                    onFinishEditing={onFinishEditing}
                />
            );
            view.setCanvasWidget('editLayer', {element: editLayer, attachment: 'overElements'});
        });

        listener.listen(editor.authoringCommands, 'editEntity', ({target}) => {
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
            const content = propertyEditor ? propertyEditor({elementData: target.data, onSubmit, onCancel}) : (
                <EditEntityForm
                    entity={modelToEdit}
                    onApply={onSubmit}
                    onCancel={onCancel}
                />
            );
            overlay.showDialog({
                target,
                dialogType: BuiltinDialogType.editEntity,
                style: {
                    caption: t.text('visual_authoring.edit_entity.dialog.caption'),
                },
                content,
                holdSelection: true,
            });
        });

        listener.listen(editor.authoringCommands, 'findOrCreateEntity', e => {
            const {link, source, target, targetIsNew} = e;
            const content = (
                <FindOrCreateEntityForm source={source}
                    target={target}
                    initialTargetIsNew={targetIsNew}
                    originalLink={link}
                    onAfterApply={() => {
                        overlay.hideDialog();
                        if (AuthoringState.isAddedEntity(editor.authoringState, target.iri)) {
                            editor.authoringCommands.trigger('editEntity', {target});
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

        listener.listen(editor.authoringCommands, 'editRelation', ({target: link}) => {
            const source = (model.getElement(link.sourceId) as EntityElement).data;
            const target = (model.getElement(link.targetId) as EntityElement).data;
            const content = (
                <EditRelationForm link={link.data}
                    source={source}
                    target={target}
                    onChange={data => {
                        if (editor.temporaryState.links.has(link.data)) {
                            // Close current dialog before opening a new one to avoid
                            // target temporary link removal
                            overlay.hideDialog();

                            const newLink = link.withDirection(data);
                            const recreatedTarget = editor.createRelation(newLink, {temporary: true});
                            editor.authoringCommands.trigger('editRelation', {
                                target: recreatedTarget,
                            });
                        }
                    }}
                    onApply={data => {
                        if (editor.temporaryState.links.has(link.data)) {
                            editor.removeTemporaryCells([link]);
                            const newLink = link.withDirection(data);
                            editor.createRelation(newLink);
                        } else if (!(
                            equalLinks(link.data, data) &&
                            equalProperties(link.data.properties, data.properties)
                        )) {
                            editor.changeRelation(link.data, data);
                        }
                        overlay.hideDialog();
                    }}
                    onCancel={() => overlay.hideDialog()}
                />
            );
            const caption = editor.temporaryState.links.has(link.data)
                ? t.text('visual_authoring.edit_relation.dialog.caption_on_new')
                : t.text('visual_authoring.edit_relation.dialog.caption');
            overlay.showDialog({
                target: link,
                dialogType: BuiltinDialogType.editRelation,
                style: {
                    defaultSize: {width: 300, height: 180},
                    resizableBy: 'x',
                    caption,
                },
                content,
                onClose: () => editor.removeTemporaryCells([link]),
            });
        });

        listener.listen(editor.authoringCommands, 'renameLink', ({target: link}) => {
            const defaultSize: Size = {width: 300, height: 165};
            overlay.showDialog({
                target: link,
                dialogType: BuiltinDialogType.renameLink,
                style: {
                    defaultSize,
                    resizableBy: 'x',
                    caption: t.text('visual_authoring.rename_link.dialog.caption'),
                    offset: {x: 25, y: - defaultSize.height / 2},
                    calculatePosition: canvas => {
                        const bounds = canvas.renderingState.getLinkLabelBounds(link);
                        if (bounds) {
                            const {x, y, width, height} = bounds;
                            return {x: x + width, y: y + height / 2};
                        } else {
                            return undefined;
                        }
                    },
                },
                content: (
                    <RenameLinkForm link={link}
                        onFinish={() => overlay.hideDialog()}
                    />
                ),
            });
        });

        return () => listener.stopListening();
    }, []);

    return null;
}

defineCanvasWidget(VisualAuthoring, element => ({element, attachment: 'viewport'}));
