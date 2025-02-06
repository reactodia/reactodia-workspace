// Disable statically-typed translation keys when used externally:
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path='../../i18n/i18n.reactodia-translation.d.ts' preserve="true" />

import * as React from 'react';

import type * as Rdf from '../data/rdf/rdfModel';

import DefaultTranslationBundle from '../../i18n/translations/en.reactodia-translation.json';

/**
 * Translation strings bundle (content).
 *
 * **Example**:
 * ```json
 * {
 *   "$schema": "../i18n.schema.json",
 *   "my_component": {
 *     "submit.label": "Submit data",
 *     "submit.command": "Apply changes to the data",
 *     ...
 *   }
 * }
 * ```
 */
export type TranslationBundle = Omit<typeof DefaultTranslationBundle, '$schema'>;
/**
 * Key for a translation string.
 *
 * @see Translation
 */
export type TranslationKey = TranslationKeyOf<TranslationBundle>;

/**
 * Provides i18n strings and templates for the UI elements.
 *
 * @group Core
 */
export interface Translation {
    /**
     * Gets a simple translation string without any formatting.
     */
    text(key: TranslationKey): string;

    /**
     * Formats a translation string by replacing placeholders with
     * provided values.
     */
    format(
        key: TranslationKey,
        placeholders: Record<string, string | number | boolean>
    ): string;

    /**
     * Templates a translation string into React Fragment by replacing
     * placeholders with provided React nodes (elements, etc).
     */
    template(
        key: TranslationKey,
        parts: Record<string, React.ReactNode>
    ): React.ReactNode;

    /**
     * Selects a single preferred literal for the target language out of several candidates.
     *
     * Language code is specified as lowercase [BCP47](https://www.rfc-editor.org/rfc/rfc5646)
     * string (examples: `en`, `en-gb`, etc).
     *
     * **Example**:
     * ```ts
     * model.setLanguage('de');
     * // Returns: Rdf.Literal { value = 'Apfel', language = 'de' }
     * const name = model.locale.formatLabel([
     *     model.factory.literal('Apple', 'en'),
     *     model.factory.literal('Apfel', 'de'),
     *     model.factory.literal('Яблоко', 'ru'),
     * ]);
     * ```
     *
     * @param labels candidate literal with same or different language codes
     * @param language target language code
     * @returns selected literal or `undefined` if no suitable literal was found
     */
    selectLabel(
        labels: ReadonlyArray<Rdf.Literal>,
        language: string
    ): Rdf.Literal | undefined;

    /**
     * Same as {@link selectLabel selectLabel()} but uses local part of
     * the `fallbackIri` as a fallback to display an entity referred by IRI
     * even if there is no suitable label to use.
     *
     * **Example**:
     * ```ts
     * // Returns: 'Apple'
     * const name = model.locale.formatLabel(
     *     [
     *         model.factory.literal('Apfel', 'de'),
     *         model.factory.literal('Яблоко', 'ru'),
     *     ],
     *     'http://example.com/entity/Apple',
     *     'en'
     * );
     * ```
     */
    formatLabel(
        labels: ReadonlyArray<Rdf.Literal> | undefined,
        fallbackIri: string,
        language: string
    ): string;

    /**
     * Formats IRI to display in the UI:
     *   - usual IRIs are enclosed in `<IRI>`;
     *   - anonymous element IRIs displayed as `(blank node)`.
     */
    formatIri(iri: string): string;

    /**
     * Formats an array of element types into a sorted labels
     * to display in the UI.
     */
    formatLabels<Iri extends string>(
        iris: ReadonlyArray<Iri>,
        getLabels: (iri: Iri) => ReadonlyArray<Rdf.Literal> | undefined,
        language: string
    ): string[];

    /**
     * Formats a map of property values into a sorted list with labels
     * to display in the UI.
     */
    formatProperties<Iri extends string>(
        properties: Readonly<Record<Iri, ReadonlyArray<Rdf.NamedNode | Rdf.Literal>>>,
        getLabels: (iri: Iri) => ReadonlyArray<Rdf.Literal> | undefined,
        language: string
    ): TranslatedProperty[];
}

/**
 * Selects a single preferred literal for the target language out of several candidates.
 *
 * Language code is specified as lowercase [BCP47](https://www.rfc-editor.org/rfc/rfc5646)
 * string (examples: `en`, `en-gb`, etc).
 *
 * @param labels candidate literal with same or different language codes
 * @param language target language code
 * @returns selected literal or `undefined` if no suitable literal was found
 */
export type LabelLanguageSelector =
    (labels: ReadonlyArray<Rdf.Literal>, language: string) => Rdf.Literal | undefined;

/**
 * Property with translated label and filtered values to display in the UI.
 */
export interface TranslatedProperty {
    /**
     * Property IRI.
     */
    readonly iri: string;
    /**
     * Translated property label.
     */
    readonly label: string;
    /**
     * Filtered based on language property values.
     */
    readonly values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;
}

export const TranslationContext = React.createContext<Translation | null>(null);

/**
 * Gets current translation data for the UI elements.
 *
 * @group Hooks
 */
export function useTranslation(): Translation {
    const translation = React.useContext(TranslationContext);
    if (!translation) {
        throw new Error('Missing Reactodia translation context');
    }
    return translation;
}

type TranslationKeyOf<T> = DeepPath<T>;

type DeepPath<T> = T extends object ? (
    { 
        [K in string & keyof T]: T[K] extends object ? `${K}.${DeepPath<T[K]>}` : K
    }[string & keyof T]
) : never;

/**
 * Represents a lazily-resolved simple or formatted translation string.
 *
 * @see Translation
 */
export class TranslatedText {
    private constructor(
        private readonly key: TranslationKey,
        private readonly formatPlaceholders?: Record<string, string | number | boolean>
    ) {}

    /**
     * Constructs a reference to simple translation string without any formatting.
     *
     * @see {@link Translation.text}
     */
    static text(key: TranslationKey): TranslatedText {
        return new TranslatedText(key);
    }

    /**
     * Constructs a reference to a translation string formatted with the provided
     * placeholders.
     *
     * @see {@link Translation.format}
     */
    static format(
        key: TranslationKey,
        placeholders: Record<string, string | number | boolean>
    ): TranslatedText {
        return new TranslatedText(key, placeholders);
    }

    /**
     * Resolves a translation string referenced by the current instance.
     */
    resolve(translation: Translation): string {
        return this.formatPlaceholders
            ? translation.format(this.key, this.formatPlaceholders)
            : translation.text(this.key);
    }
}
