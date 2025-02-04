// Disable statically-typed translation keys when used externally:
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path='../../i18n/i18n.reactodia-translation.d.ts' preserve="true" />

import * as React from 'react';

import DefaultTranslationBundle from '../../i18n/translations/en.reactodia-translation.json';

export type TranslationBundle = Omit<typeof DefaultTranslationBundle, '$schema'>;
export type TranslationKey = TranslationKeyOf<TranslationBundle>;

/**
 * Provides i18n strings and templates for the UI elements.
 *
 * @group Core
 */
export interface Translation {
    /**
     * Gets a simple translated string.
     */
    text(key: TranslationKey): string;
    format(
        key: TranslationKey,
        placeholders: Record<string, string | number | boolean>
    ): string;
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
