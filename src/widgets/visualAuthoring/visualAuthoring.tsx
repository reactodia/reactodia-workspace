import * as React from 'react';

import { EventObserver } from '../../coreUtils/events';

import { ElementModel } from '../../data/model';
import { defineCanvasWidget } from '../../diagram/canvasWidget';
import { Link } from '../../diagram/elements';
import { Size } from '../../diagram/geometry';
import type { ElementDecoratorResolver } from '../../diagram/sharedCanvasState';

import { AuthoringState } from '../../editor/authoringState';
import { BuiltinDialogType } from '../../editor/builtinDialogType';
import { EntityElement, RelationLink } from '../../editor/dataElements';

import { EditEntityForm } from '../../forms/editEntityForm';
import { EditLinkForm } from '../../forms/editLinkForm';
import { FindOrCreateEntityForm } from '../../forms/findOrCreateEntityForm';
import { RenameLinkForm } from '../../forms/renameLinkForm';

import { useWorkspace } from '../../workspace/workspaceContext';

import { EditLayer, DragEditOperation } from './editLayer';
import { ElementDecorator } from './elementDecorator';
import { LinkStateWidget } from './linkStateWidget';

/**
 * Props for `VisualAuthoring` component.
 *
 * @see VisualAuthoring
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
 * Parameters for `PropertyEditor`.
 */
export interface PropertyEditorOptions {
    /**
     * Target entity data to edit.
     */
    elementData: ElementModel;
    /**
     * Handler to submit changed entity data.
     *
     * Changed data may have a different entity IRI (`ElementModel.id`)
     * in case when the entity identity needs to be changed.
     */
    onSubmit: (newData: ElementModel) => void;
    /**
     * Handler to abort changing the entity, discarding the operation.
     */
    onCancel?: () => void;
}

/**
 * Events for `VisualAuthoring` event bus.
 *
 * @see VisualAuthoring
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
    const {model, view, editor, overlay} = useWorkspace();

    React.useLayoutEffect(() => {
        const listener = new EventObserver();

        listener.listen(model.events, 'loadingSuccess', () => {
            view.setCanvasWidget('states', {
                element: <LinkStateWidget />,
                attachment: 'overLinks',
            });
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
            if (previous) {
                editor.removeTemporaryCells([previous.target]);
            }
        });

        return () => listener.stopListening();
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
            if (event && event.newIri) {
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
                    caption: 'Edit entity',
                },
                content,
                holdSelection: true,
                onClose: onCancel,
            });
        });

        listener.listen(editor.authoringCommands, 'findOrCreateEntity', e => {
            const {link, source, target, targetIsNew} = e;
            const onCancel = () => {
                editor.removeAllTemporaryCells();
                overlay.hideDialog();
            };
            const content = (
                <FindOrCreateEntityForm source={source}
                    target={target}
                    initialTargetIsNew={targetIsNew}
                    originalLink={link}
                    onAfterApply={() => {
                        overlay.hideDialog();
                        if (AuthoringState.isNewElement(editor.authoringState, target.iri)) {
                            editor.authoringCommands.trigger('editEntity', {target});
                        }
                    }}
                    onCancel={onCancel}
                />
            );
            overlay.showDialog({
                target,
                dialogType: BuiltinDialogType.findOrCreateEntity,
                style: {
                    caption: 'Establish New Connection',
                    minSize: {width: 250, height: 320},
                },
                content,
                onClose: onCancel,
            });
        });

        listener.listen(editor.authoringCommands, 'editRelation', ({target: link}) => {
            const source = (model.getElement(link.sourceId) as EntityElement).data;
            const target = (model.getElement(link.targetId) as EntityElement).data;
            const onCancel = () => {
                editor.removeTemporaryCells([link]);
                overlay.hideDialog();
            };
            const content = (
                <EditLinkForm link={link.data}
                    source={source}
                    target={target}
                    onChange={data => {
                        if (editor.temporaryState.links.has(link.data)) {
                            editor.removeTemporaryCells([link]);
                            const newLink = link.withDirection(data);
                            editor.authoringCommands.trigger('editRelation', {
                                target: editor.createRelation(newLink, {temporary: true}),
                            });
                        }
                    }}
                    onApply={data => {
                        if (editor.temporaryState.links.has(link.data)) {
                            editor.removeTemporaryCells([link]);
                            const newLink = link.withDirection(data);
                            editor.createRelation(newLink);
                        } else {
                            editor.changeRelation(link.data, data);
                        }
                        overlay.hideDialog();
                    }}
                    onCancel={onCancel}/>
            );
            const caption = editor.temporaryState.links.has(link.data)
                ? 'Establish New Connection'
                : 'Edit Connection';
            overlay.showDialog({
                target: link,
                dialogType: BuiltinDialogType.editRelation,
                style: {
                    defaultSize: {width: 300, height: 180},
                    resizableBy: 'x',
                    caption,
                },
                content,
                onClose: onCancel,
            });
        });

        listener.listen(editor.authoringCommands, 'renameLink', ({target: link}) => {
            const defaultSize: Size = {width: 300, height: 165};
            const onFinish = () => overlay.hideDialog();
            overlay.showDialog({
                target: link,
                dialogType: BuiltinDialogType.renameLink,
                style: {
                    defaultSize,
                    resizableBy: 'x',
                    caption: 'Rename Link',
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
                        onFinish={onFinish}
                    />
                ),
                onClose: onFinish,
            });
        });

        return () => listener.stopListening();
    }, []);

    return null;
}

defineCanvasWidget(VisualAuthoring, element => ({element, attachment: 'viewport'}));