import * as React from 'react';

import type * as Rdf from '../../data/rdf/rdfModel';
import type { PropertyTypeIri } from '../../data/model';

import type { MetadataPropertyShape } from '../../data/metadataProvider';

/**
 * Props for a property input accepting a single value to edit.
 */
export interface InputSingleProps {
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
    /**
     * Whether the property input should be read-only (disabled).
     */
    readonly?: boolean;
    /**
     * Input placeholder text (if applicable).
     */
    placeholder?: string;
}

/**
 * Props for a property input accepting multiple values to edit.
 */
export interface InputMultiProps {
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
    updateValues: (updater: InputMultiUpdater) => void;
    /**
     * RDF/JS-compatible term factory to create RDF terms.
     */
    factory: Rdf.DataFactory;
    /**
     * Whether the property input should be read-only (disabled).
     */
    readonly?: boolean;
    /**
     * Input placeholder text (if applicable).
     */
    placeholder?: string;
}

/**
 * Resolves an input component to edit a specific entity or relation property.
 */
export type InputMultiResolver =
    (property: PropertyTypeIri, inputProps: InputMultiProps) => React.ReactElement;

/**
 * Pure function to update a previous set of property values into a new one.
 *
 * @see {@link InputMultiProps.updateValues}
 */
export type InputMultiUpdater = (previous: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>) =>
    ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;
