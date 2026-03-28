import cx from 'clsx';
import * as React from 'react';
import { flushSync } from 'react-dom';

import { useTranslation } from '../../coreUtils/i18n';
import { useAsync } from '../../coreUtils/hooks';

import type { ElementModel, ElementIri, PropertyTypeIri } from '../../data/model';
import type {
    MetadataProvider, MetadataCanModifyEntity, MetadataEntityShape, MetadataPropertyShape,
} from '../../data/metadataProvider';

import { HtmlSpinner } from '../../diagram/spinner';
import { AuthoredEntity } from '../../editor/authoringState';
import { EntityElement } from '../../editor/dataElements';

import type { InputMultiUpdater, InputMultiProps } from '../../forms';

import { useWorkspace } from '../../workspace/workspaceContext';

import type { PropertyEditorOptionsEntity } from '../visualAuthoring/visualAuthoring';

import { InputGroup } from './inputGroup';

const FORM_CLASS = 'reactodia-form';
const CLASS_NAME = 'reactodia-edit-entity-form';

/**
 * State provided by {@link EntityEditor} to nested components.
 */
export interface EntityEditorProvidedProps {
    /**
     * Current (draft) entity data to edit.
     */
    data: ElementModel;
    /**
     * Handler to update current entity data in the property editor.
     */
    updateData: (update: (previous: ElementModel) => ElementModel) => void;
    /**
     * Handler to apply changes to the entity, including changes
     * from calling {@link updateData}.
     */
    applyChanges: () => void;
}

/**
 * Component which allows to build an entity editor by using provided state
 * and callbacks to the nested components.
 *
 * `target` is an {@link EntityElement} on the canvas or one which
 * was created but not placed on the canvas yet.
 *
 * @category Components
 */
export function EntityEditor(props: {
    /**
     * Target entity element to edit.
     */
    target: EntityElement;
    /**
     * Render function to make an editor UI using provided state.
     */
    children: (props: EntityEditorProvidedProps) => React.ReactElement;
}) {
    const {target, children} = props;
    const {editor} = useWorkspace();
    const initialEvent = editor.authoringState.elements.get(target.data.id);
    const [data, setData] = React.useState(computeChangedEntityData(target.data, initialEvent));
    React.useEffect(() => {
        const latestEvent = editor.authoringState.elements.get(target.data.id);
        setData(computeChangedEntityData(target.data, latestEvent));
    }, [target]);
    return children({
        data,
        updateData: setData,
        applyChanges: () => {
            let finalData: ElementModel = data;
            flushSync(() => {
                setData(previous => {
                    finalData = previous;
                    return previous;
                });
            });
            editor.changeEntity(target.data, finalData);
        },
    });
}

function computeChangedEntityData(data: ElementModel, event: AuthoredEntity | undefined): ElementModel {
    if (event && event.type == 'entityChange' && event.newIri) {
        return {...data, id: event.newIri};
    }
    return data;
}

export interface DefaultEditEntityFormProps extends PropertyEditorOptionsEntity {
    resolveInput: (property: PropertyTypeIri, inputProps: InputMultiProps) =>
        React.ReactElement | null;
}

export function DefaultEditEntityForm(props: DefaultEditEntityFormProps) {
    const {target, resolveInput, onClose} = props;
    return (
        <EntityEditor target={target}>
            {providedProps => (
                <EditEntityProperties {...providedProps}
                    originalData={target.data}
                    resolveInput={resolveInput}
                    onClose={onClose}
                />
            )}
        </EntityEditor>
    );
}

interface EditEntityPropertiesProps extends EntityEditorProvidedProps {
    originalData: ElementModel;
    resolveInput: (property: PropertyTypeIri, inputProps: InputMultiProps) =>
        React.ReactElement | null;
    onClose: () => void;
}

function EditEntityProperties(props: EditEntityPropertiesProps) {
    const {
        originalData: entity, data, updateData, applyChanges, onClose, resolveInput,
    } = props;
    const {model, editor} = useWorkspace();
    const t = useTranslation();

    const [metadata, metadataError] = useEntityMetadata(editor.metadataProvider, entity);
    const languages = React.useMemo(
        () => editor.metadataProvider?.getLiteralLanguages() ?? [], []
    );

    const iriValues = React.useMemo(() => [model.factory.namedNode(data.id)], [data.id]);
    const onChangeIri = React.useCallback((updater: InputMultiUpdater) => {
        updateData(previous => {
            const nextIriValues = updater([model.factory.namedNode(previous.id)]);
            if (nextIriValues.length === 0) {
                return previous;
            }
            const iri: ElementIri = nextIriValues[0].value;
            return {...previous, id: iri};
        });
    }, []);

    const onChangeProperty = React.useCallback((
        property: PropertyTypeIri,
        updater: InputMultiUpdater
    ): void => {
        updateData(previous => {
            const properties = previous.properties;
            const values = Object.prototype.hasOwnProperty.call(properties, property)
                ? properties[property] : undefined;
            const nextValues = updater(values ?? []);
            const nextProperties = {...properties, [property]: nextValues};
            if (nextValues.length === 0) {
                delete nextProperties[property];
            }
            return {
                ...previous,
                properties: nextProperties,
            };
        });
    }, []);

    if (!metadata) {
        return (
            <div className={cx(FORM_CLASS, CLASS_NAME, `${CLASS_NAME}--loading`)}>
                <HtmlSpinner width={30} height={30}
                    errorOccurred={Boolean(metadataError)}
                />
            </div>
        );
    }

    return (
        <div className={cx(FORM_CLASS, CLASS_NAME)}>
            <div className={`reactodia-scrollable ${FORM_CLASS}__body`}>
                <div className={`${FORM_CLASS}__row`}>
                    <label>{t.text('visual_authoring.edit_entity.iri.label')}</label>
                    {resolveInput('urn:reactodia:entityIri', {
                        shape: IRI_SHAPE,
                        languages,
                        values: iriValues,
                        updateValues: onChangeIri,
                        factory: model.factory,
                        readonly: !metadata.editable.canChangeIri,
                        placeholder: t.text('visual_authoring.edit_entity.iri.placeholder'),
                    })}
                </div>
                <InputGroup className={`${CLASS_NAME}__properties`}
                    languages={languages}
                    extraPropertyShape={metadata.shape.extraProperty}
                    propertyShapes={metadata.shape.properties}
                    propertyValues={data.properties}
                    onChangeData={onChangeProperty}
                    readonly={!metadata.editable.canEdit}
                    resolveInput={resolveInput}
                />
            </div>
            <div className={`${FORM_CLASS}__controls`}>
                <button type='button'
                    className={`reactodia-btn reactodia-btn-primary ${FORM_CLASS}__apply-button`}
                    title={
                        t.textOptional('visual_authoring.edit_entity.dialog.apply.title') ??
                        t.text('visual_authoring.dialog.apply.title')
                    }
                    onClick={() => {
                        applyChanges();
                        onClose();
                    }}>
                    {(
                        t.textOptional('visual_authoring.edit_entity.dialog.apply.label') ??
                        t.text('visual_authoring.dialog.apply.label')
                    )}
                </button>
                <button type='button'
                    className='reactodia-btn reactodia-btn-secondary'
                    title={t.text('visual_authoring.dialog.cancel.title')}
                    onClick={onClose}>
                    {t.text('visual_authoring.dialog.cancel.label')}
                </button>
            </div>
        </div>
    );
}

const DEFAULT_ENTITY_SHAPE: MetadataEntityShape = {
    properties: new Map(),
};
const IRI_SHAPE: MetadataPropertyShape = {
    valueShape: {termType: 'NamedNode'},
    minCount: 1,
    maxCount: 1,
};

interface EntityMetadata {
    readonly editable: MetadataCanModifyEntity;
    readonly shape: MetadataEntityShape;
}

function useEntityMetadata(
    metadataProvider: MetadataProvider | undefined,
    entity: ElementModel
): readonly [shape: EntityMetadata | undefined, error?: unknown] {
    const {data, status, error} = useAsync({
        input: [metadataProvider, entity],
        load: async ([provider, target], {signal}): Promise<EntityMetadata> => {
            if (provider) {
                const [editable, shape] = await Promise.all([
                    provider.canModifyEntity(target, {signal}),
                    provider.getEntityShape(target.types, {signal}),
                ]);
                return {editable, shape};
            } else {
                return {editable: {}, shape: DEFAULT_ENTITY_SHAPE};
            }
        }
    });

    if (data && status === 'completed') {
        return [data];
    } else {
        return [undefined, error];
    }
}
