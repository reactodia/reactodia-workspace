import cx from 'clsx';
import * as React from 'react';

import { mapAbortedToNull } from '../coreUtils/async';

import { ElementModel, ElementIri, PropertyTypeIri } from '../data/model';
import * as Rdf from '../data/rdf/rdfModel';
import type { MetadataProvider, MetadataEntityShape } from '../data/metadataProvider';

import { HtmlSpinner } from '../diagram/spinner';

import { useWorkspace } from '../workspace/workspaceContext';

import { PropertiesInput, type PropertyUpdater, DEFAULT_PROPERTY_SHAPE } from './propertiesInput';
import { TextPropertyInput } from './textPropertyInput';

const FORM_CLASS = 'reactodia-form';
const CLASS_NAME = 'reactodia-edit-entity-form';

export function EditEntityForm(props: {
    entity: ElementModel;
    onApply: (entity: ElementModel) => void;
    onCancel: () => void;
}) {
    const {entity, onApply, onCancel} = props;
    const {model, editor, translation: t} = useWorkspace();

    const [data, setData] = React.useState(entity);
    React.useEffect(() => {
        setData(entity);
    }, [entity]);

    const [shape, shapeError] = useEntityShape(editor.metadataProvider, entity);
    const languages = React.useMemo(
        () => editor.metadataProvider?.getLiteralLanguages() ?? [], []
    );

    const onChangeIri = React.useCallback((e: React.FormEvent<HTMLInputElement>) => {
        const target = (e.target as HTMLInputElement);
        const iri: ElementIri = target.value;
        setData(previous => ({...previous, id: iri}));
    }, []);

    const onChangeLabel = React.useCallback((updater: PropertyUpdater) => {
        setData(previous => ({
            ...previous,
            label: updater(previous.label) as ReadonlyArray<Rdf.Literal>,
        }));
    }, []);

    const onChangeProperty = (
        property: PropertyTypeIri,
        updater: PropertyUpdater
    ): void => {
        setData(previous => {
            const properties = previous.properties;
            const values = Object.prototype.hasOwnProperty.call(properties, property)
                ? properties[property] : undefined;
            return {
                ...previous,
                properties: {
                    ...properties,
                    [property]: updater(values ?? []),
                }
            };
        });
    };

    if (!shape) {
        return (
            <div className={cx(FORM_CLASS, CLASS_NAME, `${CLASS_NAME}--loading`)}>
                <HtmlSpinner width={30} height={30}
                    errorOccurred={Boolean(shapeError)}
                />
            </div>
        );
    }

    return (
        <div className={cx(FORM_CLASS, CLASS_NAME)}>
            <div className={`reactodia-scrollable ${FORM_CLASS}__body`}>
                <div className={`${FORM_CLASS}__row`}>
                    <label>
                        {t.text('visual_authoring.edit_entity.iri.label')}
                        <input className='reactodia-form-control'
                            name='reactodia-edit-entity-iri'
                            defaultValue={data.id}
                            onChange={onChangeIri}
                        />
                    </label>
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
                <div className={`${FORM_CLASS}__row`}>
                    <label>{t.text('visual_authoring.edit_entity.label.label')}</label>
                    <TextPropertyInput shape={DEFAULT_PROPERTY_SHAPE}
                        languages={languages}
                        values={data.label}
                        updateValues={onChangeLabel}
                        factory={model.factory}
                    />
                </div>
                <PropertiesInput className={`${CLASS_NAME}__properties`}
                    properties={shape.properties}
                    languages={languages}
                    data={data.properties}
                    onChangeData={onChangeProperty}
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

function useEntityShape(
    metadataProvider: MetadataProvider | undefined,
    entity: ElementModel
): readonly [shape: MetadataEntityShape | undefined, error?: unknown] {
    const [shape, setShape] = React.useState<MetadataEntityShape>();
    const [shapeError, setShapeError] = React.useState<unknown>();

    React.useEffect(() => {
        if (metadataProvider) {
            setShape(undefined);
            setShapeError(undefined);
            const cancellation = new AbortController();
            const signal = cancellation.signal;
            mapAbortedToNull(
                metadataProvider.getEntityShape(entity.types, {signal}),
                signal
            ).then(
                result => {
                    if (result === null) {
                        return;
                    }
                    setShape(result);
                },
                error => {
                    console.error('Failed to load entity shape:', error);
                    setShapeError(error);
                }
            );
            return () => cancellation.abort();
        } else {
            setShape(DEFAULT_ENTITY_SHAPE);
        }
    }, [entity]);

    return [shape, shapeError];
}
