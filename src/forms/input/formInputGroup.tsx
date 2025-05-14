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
    type FormInputMultiUpdater, type FormInputMultiProps,
} from './inputCommon';

const FORM_CLASS = 'reactodia-form';

export interface FormInputGroupProps {
    className?: string;
    languages: ReadonlyArray<string>;
    propertyShapes: ReadonlyMap<PropertyTypeIri, MetadataPropertyShape>;
    extraPropertyShape?: MetadataPropertyShape;
    propertyValues: { readonly [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> };
    onChangeData: (property: PropertyTypeIri, updater: FormInputMultiUpdater) => void;
    resolveInput: (property: PropertyTypeIri, props: FormInputMultiProps) =>
        React.ReactElement | null;
}

export function FormInputGroup(props: FormInputGroupProps) {
    const {
        className, languages, propertyShapes, extraPropertyShape, propertyValues, onChangeData, resolveInput,
    } = props;
    const {model, translation: t} = useWorkspace();

    const propertyIris: PropertyTypeIri[] = Array.from(propertyShapes.keys());
    if (extraPropertyShape) {
        for (const propertyIri in propertyValues) {
            if (
                Object.prototype.hasOwnProperty.call(propertyValues, propertyIri) &&
                !propertyShapes.has(propertyIri)
            ) {
                propertyIris.push(propertyIri);
            }
        }
    }

    useKeyedSyncStore(subscribePropertyTypes, propertyIris, model);

    if (propertyIris.length === 0) {
        return null;
    }

    const labelledProperties: LabelledProperty[] = [];
    for (const iri of propertyIris) {
        const shape = propertyShapes.get(iri) ?? extraPropertyShape;
        if (shape) {
            const property = model.getPropertyType(iri);
            const values = Object.prototype.hasOwnProperty.call(propertyValues, iri)
                ? propertyValues[iri] : undefined;
            labelledProperties.push({
                iri,
                label: t.formatLabel(property?.data?.label, iri, model.language),
                shape,
                values: values ?? [],
            });
        }
    }

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

interface LabelledProperty {
    readonly iri: string;
    readonly label: string;
    readonly shape: MetadataPropertyShape;
    readonly values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;
}

function Property(props: {
    iri: PropertyTypeIri;
    label: string;
    shape: MetadataPropertyShape;
    languages: ReadonlyArray<string>;
    values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;
    onChange: (iri: PropertyTypeIri, updater: FormInputMultiUpdater) => void;
    factory: Rdf.DataFactory;
    resolveInput: FormInputGroupProps['resolveInput'];
}) {
    const {iri, label, shape, languages, values, onChange, factory, resolveInput} = props;
    const t = useTranslation();

    const updateValues = React.useCallback((updater: FormInputMultiUpdater) => {
        onChange(iri, updater);
    }, [iri, onChange]);

    const input = resolveInput(iri, {
        shape,
        languages,
        values,
        updateValues,
        factory,
    });
    if (!input) {
        return null;
    }

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
            {input}
        </div>
    );
}
