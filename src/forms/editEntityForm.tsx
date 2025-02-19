import classnames from 'classnames';
import * as React from 'react';

import { mapAbortedToNull } from '../coreUtils/async';
import { useKeyedSyncStore } from '../coreUtils/keyedObserver';
import { useTranslation } from '../coreUtils/i18n';

import { ElementModel, ElementIri, PropertyTypeIri } from '../data/model';
import * as Rdf from '../data/rdf/rdfModel';
import type {
    MetadataEntityShape, MetadataPropertyShape, MetadataValueShape,
} from '../data/metadataProvider';

import { HtmlSpinner } from '../diagram/spinner';

import { subscribePropertyTypes } from '../editor/observedElement';
import { WithFetchStatus } from '../editor/withFetchStatus';

import { useWorkspace } from '../workspace/workspaceContext';

import { PropertyUpdater, TextPropertyInput } from './textPropertyInput';

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
    const [shape, setShape] = React.useState<MetadataEntityShape>();
    const [error, setError] = React.useState<unknown>();

    React.useEffect(() => {
        setData(entity);
        if (editor.metadataProvider) {
            setShape(undefined);
            setError(undefined);
            const cancellation = new AbortController();
            const signal = cancellation.signal;
            mapAbortedToNull(
                editor.metadataProvider.getEntityShape(entity.types, {signal}),
                signal
            ).then(
                result => {
                    if (result === null) {
                        return;
                    }
                    setShape(result);
                },
                error => setError(error)
            );
        } else {
            setShape(DEFAULT_ENTITY_SHAPE);
        }
    }, [entity]);

    const languages = React.useMemo(
        () => editor.metadataProvider?.getLiteralLanguages() ?? [], []
    );

    const onChangeIri = React.useCallback((e: React.FormEvent<HTMLInputElement>) => {
        const target = (e.target as HTMLInputElement);
        const iri = target.value as ElementIri;
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
            <div className={classnames(FORM_CLASS, CLASS_NAME, `${CLASS_NAME}--loading`)}>
                <HtmlSpinner width={30} height={30}
                    errorOccurred={Boolean(error)}
                />
            </div>
        );
    }

    return (
        <div className={classnames(FORM_CLASS, CLASS_NAME)}>
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
                <Properties properties={shape.properties}
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
const DEFAULT_VALUE_SHAPE: MetadataValueShape = {
    termType: 'Literal',
};
const DEFAULT_PROPERTY_SHAPE: MetadataPropertyShape = {
    valueShape: DEFAULT_VALUE_SHAPE,
};

function Properties(props: {
    properties: ReadonlyMap<PropertyTypeIri, MetadataPropertyShape>;
    languages: ReadonlyArray<string>;
    data: { readonly [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> };
    onChangeData: (property: PropertyTypeIri, updater: PropertyUpdater) => void;
}) {
    const {properties, languages, data, onChangeData} = props;
    const {model, translation: t} = useWorkspace();

    const extendedProperties = new Map(properties);
    for (const propertyIri of Object.keys(data) as PropertyTypeIri[]) {
        if (!extendedProperties.has(propertyIri)) {
            extendedProperties.set(propertyIri, DEFAULT_PROPERTY_SHAPE);
        }
    }
    const propertyIris = Array.from(extendedProperties.keys());
    useKeyedSyncStore(subscribePropertyTypes, propertyIris, model);

    if (propertyIris.length === 0) {
        return null;
    }

    const labelledProperties = Array.from(extendedProperties, ([iri, shape]) => {
        const property = model.getPropertyType(iri);
        const values = Object.prototype.hasOwnProperty.call(data, iri) ? data[iri] : undefined;
        return {
            iri,
            label: t.formatLabel(property?.data?.label, iri, model.language),
            shape,
            values: values ?? [],
        };
    });
    labelledProperties.sort((a, b) => a.label.localeCompare(b.label));

    return (
        <div role='list'
            className={`${CLASS_NAME}__properties`}>
            {labelledProperties.map(({iri, label, shape, values}) =>
                <Property key={iri}
                    iri={iri}
                    label={label}
                    shape={shape}
                    languages={languages}
                    values={values}
                    onChange={onChangeData}
                    factory={model.factory}
                />
            )}
        </div>
    );
}

function Property(props: {
    iri: PropertyTypeIri;
    label: string;
    shape: MetadataPropertyShape;
    languages: ReadonlyArray<string>;
    values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;
    onChange: (iri: PropertyTypeIri, updater: PropertyUpdater) => void;
    factory: Rdf.DataFactory;
}) {
    const {iri, label, shape, languages, values, onChange, factory} = props;
    const t = useTranslation();

    const updateValues = React.useCallback((updater: PropertyUpdater) => {
        onChange(iri, updater);
    }, [iri, onChange]);

    return (
        <div className={`${FORM_CLASS}__row`}>
            <label
                title={t.text('visual_authoring.property.title', {
                    property: label,
                    propertyIri: iri,
                })}>
                <WithFetchStatus type='propertyType' target={iri}>
                    <span>
                        {t.text('visual_authoring.property.label', {
                            property: label,
                            propertyIri: iri,
                        })}
                    </span>
                </WithFetchStatus>
            </label>
            <TextPropertyInput shape={shape}
                languages={languages}
                values={values}
                updateValues={updateValues}
                factory={factory}
            />
        </div>
    );
}
