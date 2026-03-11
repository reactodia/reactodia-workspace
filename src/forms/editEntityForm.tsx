import cx from 'clsx';
import * as React from 'react';

import { mapAbortedToNull } from '../coreUtils/async';

import { ElementModel, ElementIri, PropertyTypeIri } from '../data/model';
import type {
    MetadataProvider, MetadataCanModifyEntity, MetadataEntityShape, MetadataPropertyShape,
} from '../data/metadataProvider';

import { HtmlSpinner } from '../diagram/spinner';

import { useWorkspace } from '../workspace/workspaceContext';

import { type FormInputMultiUpdater } from './input/inputCommon';
import { FormInputGroup, type FormInputGroupProps } from './input/formInputGroup';

const FORM_CLASS = 'reactodia-form';
const CLASS_NAME = 'reactodia-edit-entity-form';

export function EditEntityForm(props: {
    entity: ElementModel;
    onApply: (entity: ElementModel) => void;
    onCancel: () => void;
    resolveInput: FormInputGroupProps['resolveInput'];
}) {
    const {entity, onApply, onCancel, resolveInput} = props;
    const {model, editor, translation: t} = useWorkspace();

    const [data, setData] = React.useState(entity);
    React.useEffect(() => {
        setData(entity);
    }, [entity]);

    const [metadata, metadataError] = useEntityMetadata(editor.metadataProvider, entity);
    const languages = React.useMemo(
        () => editor.metadataProvider?.getLiteralLanguages() ?? [], []
    );

    const iriValues = React.useMemo(() => [model.factory.namedNode(data.id)], [data.id]);
    const onChangeIri = React.useCallback((updater: FormInputMultiUpdater) => {
        setData(previous => {
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
        updater: FormInputMultiUpdater
    ): void => {
        setData(previous => {
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
                    })}
                </div>
                <div className={`${FORM_CLASS}__row`}>
                    <label>
                        {t.text('visual_authoring.edit_entity.type.label')}
                        {data.types.map(type => (
                            <input key={type}
                                className='reactodia-form-control'
                                name='reactodia-edit-entity-type'
                                title={type}
                                value={t.formatLabel(
                                    model.getElementType(type)?.data?.label, type, model.language
                                )}
                                disabled={true}
                            />
                        ))}
                    </label>
                </div>
                <FormInputGroup className={`${CLASS_NAME}__properties`}
                    languages={languages}
                    extraPropertyShape={metadata.shape.extraProperty}
                    propertyShapes={metadata.shape.properties}
                    propertyValues={data.properties}
                    onChangeData={onChangeProperty}
                    resolveInput={resolveInput}
                    readonly={!metadata.editable.canEdit}
                />
            </div>
            <div className={`${FORM_CLASS}__controls`}>
                <button type='button'
                    className={`reactodia-btn reactodia-btn-primary ${FORM_CLASS}__apply-button`}
                    title={t.text('visual_authoring.dialog.apply.title')}
                    onClick={() => onApply(data)}>
                    {t.text('visual_authoring.dialog.apply.label')}
                </button>
                <button type='button'
                    className='reactodia-btn reactodia-btn-secondary'
                    title={t.text('visual_authoring.dialog.cancel.title')}
                    onClick={onCancel}>
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
    const [metadata, setMetadata] = React.useState<EntityMetadata>();
    const [metadataError, setMetadataError] = React.useState<unknown>();

    React.useEffect(() => {
        if (metadataProvider) {
            setMetadata(undefined);
            setMetadataError(undefined);
            const cancellation = new AbortController();
            const signal = cancellation.signal;
            mapAbortedToNull(
                Promise.all([
                    metadataProvider.canModifyEntity(entity, {signal}),
                    metadataProvider.getEntityShape(entity.types, {signal}),
                ]),
                signal
            ).then(
                result => {
                    if (result === null) {
                        return;
                    }
                    const [editable, shape] = result;
                    setMetadata({editable, shape});
                },
                error => {
                    console.error('Failed to load entity shape:', error);
                    setMetadataError(error);
                }
            );
            return () => cancellation.abort();
        } else {
            setMetadata({editable: {}, shape: DEFAULT_ENTITY_SHAPE});
        }
    }, [entity]);

    return [metadata, metadataError];
}
