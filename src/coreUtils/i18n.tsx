import * as React from 'react';

import type DefaultTranslationBundle from '../../i18n/translations/translation.en.json';

export type TranslationBundle = Omit<typeof DefaultTranslationBundle, '$schema'>;

/**
 * Provides and formats text strings for the UI elements.
 *
 * @group Core
 */
export interface Translation {
    /**
     * Gets a simple translated string.
     */
    text<Group extends keyof TranslationBundle>(group: Group, key: keyof TranslationBundle[Group]): string;
    format<Group extends keyof TranslationBundle>(
        group: Group,
        key: keyof TranslationBundle[Group],
        placeholders: Record<string, string | number | boolean>
    ): string;
    template<Group extends keyof TranslationBundle>(
        group: Group,
        key: keyof TranslationBundle[Group],
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
