import * as React from 'react';

import DefaultTranslationBundle from '../../i18n/translations/translation.en.json';

import { Translation, TranslationBundle, TranslationContext } from './i18n';

export function makeTranslation(bundle: Partial<TranslationBundle>): Translation {
    const text: Translation['text'] = (group, key) => {
        const bundleGroup = bundle[group] ?? DefaultTranslationBundle[group];
        return (
            bundleGroup[key] ?? DefaultTranslationBundle[group][key] ?? `${group as string}.${key as string}`
        ) as string;
    };
    return {
        text,
        format: (group, key, placeholders) => {
            const template = text(group, key);
            return formatPlaceholders(template, placeholders);
        },
        template: (group, key, parts) => {
            const template = text(group, key);
            return templatePlaceholders(template, parts);
        },
    };
}

function formatPlaceholders(template: string, values: Record<string, string | number | boolean>): string {
    let result = template;
    for (const replaceKey in values) {
        if (!Object.prototype.hasOwnProperty.call(values, replaceKey)) {
            continue;
        }
        const replaceValue = String(values[replaceKey] ?? '');
        result = result.replace(new RegExp(`{${replaceKey}}`, 'g'), replaceValue);
    }
    return result;
}

function templatePlaceholders(template: string, values: Record<string, React.ReactNode>): React.ReactNode {
    const parts: React.ReactNode[] = [];
    const templateRegex = /\{([a-zA-Z0-9_]+)\}/g;
    let lastIndex = 0;
    let result: RegExpExecArray | null;
    while ((result = templateRegex.exec(template))) {
        const startIndex = templateRegex.lastIndex - result[0].length;
        if (startIndex != lastIndex) {
            parts.push(template.substring(lastIndex, startIndex));
        }
        const part = Object.prototype.hasOwnProperty.call(values, result[1])
            ? values[result[1]] : undefined;
        parts.push(part ?? null);
        lastIndex = templateRegex.lastIndex;
    }
    if (lastIndex < template.length) {
        parts.push(template.substring(lastIndex, template.length));
    }
    return React.createElement(React.Fragment, null, ...parts);
}

export function TranslationProvider(props: {
    translation: Translation;
    children: React.ReactNode;
}) {
    const {translation, children} = props;
    return (
        <TranslationContext.Provider value={translation}>
            {children}
        </TranslationContext.Provider>
    );
}
