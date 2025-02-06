// Disable statically-typed translation keys when used externally:
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path='../../i18n/i18n.reactodia-translation.d.ts' preserve="true" />

import * as React from 'react';

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
