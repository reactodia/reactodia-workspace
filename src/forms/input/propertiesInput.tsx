import * as React from 'react';

import { useKeyedSyncStore } from '../../coreUtils/keyedObserver';
import { useTranslation } from '../../coreUtils/i18n';

import { PropertyTypeIri } from '../../data/model';
import * as Rdf from '../../data/rdf/rdfModel';
import type { MetadataPropertyShape } from '../../data/metadataProvider';

import { subscribePropertyTypes } from '../../editor/observedElement';
import { WithFetchStatus } from '../../editor/withFetchStatus';

import { useWorkspace } from '../../workspace/workspaceContext';

import {
    type PropertyInputMultiUpdater, type PropertyInputMultiProps, DEFAULT_PROPERTY_SHAPE,
} from './inputCommon';

const FORM_CLASS = 'reactodia-form';

export type PropertyInputResolver = (property: PropertyTypeIri, props: PropertyInputMultiProps) =>
    React.ReactElement | null;

export function PropertiesInput(props: {
    className?: string;
    properties: ReadonlyMap<PropertyTypeIri, MetadataPropertyShape>;
    languages: ReadonlyArray<string>;
    data: { readonly [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> };
    onChangeData: (property: PropertyTypeIri, updater: PropertyInputMultiUpdater) => void;
    resolveInput: PropertyInputResolver;
}) {
    const {className, properties, languages, data, onChangeData, resolveInput} = props;
    const {model, translation: t} = useWorkspace();

    const extendedProperties = new Map(properties);
    for (const propertyIri of Object.keys(data)) {
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
            className={className}>
            {labelledProperties.map(({iri, label, shape, values}) =>
                <Property key={iri}
                    iri={iri}
                    label={label}
                    shape={shape}
                    languages={languages}
                    values={values}
                    onChange={onChangeData}
                    factory={model.factory}
                    resolveInput={resolveInput}
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
    onChange: (iri: PropertyTypeIri, updater: PropertyInputMultiUpdater) => void;
    factory: Rdf.DataFactory;
    resolveInput: PropertyInputResolver;
}) {
    const {iri, label, shape, languages, values, onChange, factory, resolveInput} = props;
    const t = useTranslation();

    const updateValues = React.useCallback((updater: PropertyInputMultiUpdater) => {
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
            {resolveInput(iri, {
                shape,
                languages,
                values,
                updateValues,
                factory,
            })}
        </div>
    );
}
