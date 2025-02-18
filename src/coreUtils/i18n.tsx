// Disable statically-typed translation keys when used externally:
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path='../../i18n/i18n.reactodia-translation.d.ts' preserve="true" />

import * as React from 'react';

import type * as Rdf from '../data/rdf/rdfModel';

import DefaultTranslationBundle from '../../i18n/translations/en.reactodia-translation.json';

type DefaultBundleData = Omit<typeof DefaultTranslationBundle, '$schema'>;

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
export type TranslationBundle = TranslationPartial<DefaultBundleData>;
/**
 * Key for a translation string.
 *
 * @see Translation
 */
export type TranslationKey = TranslationKeyOf<DefaultBundleData>;

/**
 * Provides i18n strings and templates for the UI elements.
 *
 * @category Core
 */
export interface Translation {
    /**
     * Formats a translation string by replacing placeholders with
     * provided values.
     */
    text(
        key: TranslationKey,
        placeholders?: Record<string, string | number | boolean>
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
     * // Returns: Rdf.Literal { value = 'Apfel', language = 'de' }
     * const name = t.selectLabel(
     *     [
     *         model.factory.literal('Apple', 'en'),
     *         model.factory.literal('Apfel', 'de'),
     *         model.factory.literal('Яблоко', 'ru'),
     *     ],
     *     'de'
     * );
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
     * Selects a subset of RDF values for the target language.
     *
     * The value is included if matches at least one criteria:
     *  - is a named node,
     *  - is a literal without language,
     *  - is a literal with language equal to the target language.
     *
     * Language code is specified as lowercase [BCP47](https://www.rfc-editor.org/rfc/rfc5646)
     * string (examples: `en`, `en-gb`, etc).
     */
    selectValues(
        values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>,
        language: string
    ): Array<Rdf.NamedNode | Rdf.Literal>;

    /**
     * Same as {@link selectLabel selectLabel()} but uses local part of
     * the `fallbackIri` as a fallback to display an entity referred by IRI
     * even if there is no suitable label to use.
     *
     * **Example**:
     * ```ts
     * // Returns: 'Apple'
     * const name = t.formatLabel(
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
export interface TranslatedProperty<Iri> {
    /**
     * Property IRI.
     */
    readonly iri: Iri;
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
 * @category Hooks
 */
export function useTranslation(): Translation {
    const translation = React.useContext(TranslationContext);
    if (!translation) {
        throw new Error('Missing Reactodia translation context');
    }
    return translation;
}

type TranslationPartial<T> = {
    [K in keyof T]?: Partial<T[K]>;
};

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
        private readonly placeholders: Record<string, string | number | boolean> | undefined
    ) {}

    /**
     * Constructs a reference to a translation string formatted with the provided
     * placeholders.
     *
     * @see {@link Translation.text}
     */
    static text(
        key: TranslationKey,
        placeholders?: Record<string, string | number | boolean>
    ): TranslatedText {
        return new TranslatedText(key, placeholders);
    }

    /**
     * Resolves a translation string referenced by the current instance.
     */
    resolve(translation: Translation): string {
        return translation.text(this.key, this.placeholders);
    }
}
