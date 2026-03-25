import * as React from 'react';

import { useObservedProperty } from '../../coreUtils/hooks';
import { useTranslation } from '../../coreUtils/i18n';
import { useKeyedSyncStore } from '../../coreUtils/keyedObserver';

import { PropertyTypeIri } from '../../data/model';
import * as Rdf from '../../data/rdf/rdfModel';
import type { MetadataPropertyShape } from '../../data/metadataProvider';

import { subscribePropertyTypes } from '../../editor/observedElement';
import { WithFetchStatus } from '../../editor/withFetchStatus';

import type { InputMultiUpdater, InputMultiProps } from '../../forms';

import { useWorkspace } from '../../workspace/workspaceContext';

const FORM_CLASS = 'reactodia-form';

export interface InputGroupProps {
    className?: string;
    languages: ReadonlyArray<string>;
    readonly?: boolean;
    propertyShapes: ReadonlyMap<PropertyTypeIri, MetadataPropertyShape>;
    extraPropertyShape?: MetadataPropertyShape;
    propertyValues: { readonly [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> };
    onChangeData: (property: PropertyTypeIri, updater: InputMultiUpdater) => void;
    resolveInput: (property: PropertyTypeIri, props: InputMultiProps) =>
        React.ReactElement | null;
}

export function InputGroup(props: InputGroupProps) {
    const {
        className, languages, propertyShapes, extraPropertyShape, propertyValues,
        onChangeData, resolveInput, readonly,
    } = props;
    const {model} = useWorkspace();
    const t = useTranslation();
    const language = useObservedProperty(model.events, 'changeLanguage', () => model.language);

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
                label: t.formatLabel(property?.data?.label, iri, language),
                shape,
                values: values ?? [],
            });
        }
    }

    labelledProperties.sort(compareProperties);

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
                    readonly={Boolean(readonly)}
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

function compareProperties(a: LabelledProperty, b: LabelledProperty): number {
    if (!(a.shape.order === undefined && b.shape.order === undefined)) {
        const aOrder = a.shape.order ?? Infinity;
        const bOrder = b.shape.order ?? Infinity;
        if (aOrder !== bOrder) {
            return aOrder - bOrder;
        }
    }
    return a.label.localeCompare(b.label);
}

function Property(props: {
    iri: PropertyTypeIri;
    label: string;
    shape: MetadataPropertyShape;
    languages: ReadonlyArray<string>;
    values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;
    onChange: (iri: PropertyTypeIri, updater: InputMultiUpdater) => void;
    readonly: boolean;
    factory: Rdf.DataFactory;
    resolveInput: Exclude<InputGroupProps['resolveInput'], undefined>;
}) {
    const {
        iri, label, shape, languages, values, onChange, readonly, factory, resolveInput,
    } = props;
    const {model} = useWorkspace();
    const t = useTranslation();

    const updateValues = React.useCallback((updater: InputMultiUpdater) => {
        onChange(iri, updater);
    }, [iri, onChange]);

    const input = resolveInput(iri, {
        shape,
        languages,
        values,
        updateValues,
        factory,
        readonly,
        placeholder: t.text('visual_authoring.property.text_value.placeholder'),
    });
    if (!input) {
        return null;
    }

    return (
        <div className={`${FORM_CLASS}__row`}>
            <label
                title={t.text('visual_authoring.property.title', {
                    property: label,
                    propertyIri: model.locale.formatIri(iri),
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
