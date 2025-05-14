import * as React from 'react';

import * as Rdf from '../../data/rdf/rdfModel';
import { PropertyTypeIri } from '../../data/model';

import type { MetadataPropertyShape } from '../../data/metadataProvider';

/**
 * Resolves an input component to edit a specific entity or relation property.
 *
 * If the resolver returns `undefined` then the default input will be used,
 * else if it returns `null` then the input will be hidden,
 * otherwise the returned input will be used.
 *
 * @see {@link VisualAuthoring.inputResolver}
 */
export type FormInputOrDefaultResolver = (property: PropertyTypeIri, inputProps: FormInputMultiProps) =>
    React.ReactElement | undefined | null;

/**
 * Props for a property input accepting a single value to edit.
 *
 * @see {@link FormInputOrDefaultResolver}
 */
export interface FormInputSingleProps {
    /**
     * Property shape metadata.
     */
    shape: MetadataPropertyShape;
    /**
     * Languages to author text literals.
     *
     * Usually provided by {@link MetadataProvider.getLiteralLanguages}.
     */
    languages: ReadonlyArray<string>;
    /**
     * Current value for the edited property.
     */
    value: Rdf.NamedNode | Rdf.Literal;
    /**
     * Sets the current value for the edited property.
     */
    setValue: (value: Rdf.NamedNode | Rdf.Literal) => void;
    /**
     * RDF/JS-compatible term factory to create RDF terms.
     */
    factory: Rdf.DataFactory;
}

/**
 * Props for a property input accepting multiple values to edit.
 *
 * @see {@link FormInputOrDefaultResolver}
 */
export interface FormInputMultiProps {
    /**
     * Property shape metadata.
     */
    shape: MetadataPropertyShape;
    /**
     * Languages to author text literals.
     *
     * Usually provided by {@link MetadataProvider.getLiteralLanguages}.
     */
    languages: ReadonlyArray<string>;
    /**
     * Current list (or set) of values for the edited property.
     */
    values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;
    /**
     * Sets the current list (or set) of values for the edited property.
     */
    updateValues: (updater: FormInputMultiUpdater) => void;
    /**
     * RDF/JS-compatible term factory to create RDF terms.
     */
    factory: Rdf.DataFactory;
}

/**
 * Pure function to update a previous set of property values into a new one.
 *
 * @see {@link FormInputMultiProps.updateValues}
 */
export type FormInputMultiUpdater = (previous: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>) =>
    ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;
