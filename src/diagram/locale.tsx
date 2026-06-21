import * as React from 'react';

import DefaultBundle from '../../i18n/translations/en.reactodia-translation.json';

import {
    LabelLanguageSelector, Translation, TranslationKey, TranslationBundle,
} from '../coreUtils/i18n';

import * as Rdf from '../data/rdf/rdfModel';

/**
 * Default (fallback) translation bundle `en` language.
 *
 * @category Constants
 */
export const DefaultTranslationBundle: TranslationBundle = DefaultBundle;

/**
 * Default built-in implementation for i18n strings interpolation and other
 * methods from {@link Translation} interface.
 *
 * @category Core
 */
export class DefaultTranslation<K extends string = TranslationKey> implements Translation<K> {
    protected readonly bundles: ReadonlyArray<Partial<TranslationBundle>>;

    private readonly _selectLabel: LabelLanguageSelector;

    constructor(options?: {
        /**
         * Translation bundles for UI text strings in the workspace
         * in order from higher to lower priority.
         *
         * @default []
         * @see {@link DefaultTranslationBundle}
         */
        bundles?: ReadonlyArray<Partial<TranslationBundle>>;
        /**
         * Overrides how a single label gets selected from multiple of them based on target language.
         */
        selectLabel?: LabelLanguageSelector;
    }) {
        const {
            bundles = [],
            selectLabel = defaultSelectLabel,
        } = options ?? {};
        this.bundles = bundles;
        this._selectLabel = selectLabel;
    }

    private getString(key: K): string | undefined {
        const dotIndex = key.indexOf('.');
        if (!(dotIndex > 0 && dotIndex < key.length)) {
            throw new Error(`Reactodia: Invalid translation key: ${key}`);
        }
        const group = key.substring(0, dotIndex);
        const leaf = key.substring(dotIndex + 1);
        for (const bundle of this.bundles) {
            const text = lookupString(bundle, group, leaf);
            if (!(text === null || text === undefined)) {
                return text;
            }
        }
        return undefined;
    }

    text(key: K, placeholders?: Record<string, string | number | boolean>): string {
        return this.textOptional(key, placeholders) ?? key;
    }

    textOptional(
        key: K,
        placeholders?: Record<string, string | number | boolean>
    ): string | undefined {
        const template = this.getString(key);
        if (template === undefined) {
            return undefined;
        }
        return formatPlaceholders(template, placeholders);
    }

    template(key: K, parts: Record<string, React.ReactNode>): React.ReactNode {
        const template = this.getString(key) ?? key;
        return templatePlaceholders(template, parts);
    }

    selectLabel(
        labels: ReadonlyArray<Rdf.Literal>,
        language: string
    ): Rdf.Literal | undefined {
        const {_selectLabel} = this;
        return _selectLabel(labels, language);
    }

    selectValues(
        values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>,
        language: string
    ): Array<Rdf.NamedNode | Rdf.Literal> {
        return values.filter(v =>
            v.termType === 'NamedNode' ||
            v.language === '' ||
            v.language === language
        );
    }

    formatLabel(
        labels: ReadonlyArray<Rdf.Literal> | undefined,
        fallbackIri: string,
        language: string
    ): string {
        const label = labels ? this.selectLabel(labels, language) : undefined;
        return resolveLabel(label, fallbackIri);
    }
}

function lookupString(
    bundle: Partial<TranslationBundle>,
    group: string,
    leaf: string
): string | undefined {
    if (!Object.prototype.hasOwnProperty.call(bundle, group)) {
        return undefined;
    }
    const bundleGroup = (bundle as Record<string, Record<string, string>>)[group];
    if (!(
        typeof bundleGroup === 'object' &&
        bundleGroup &&
        Object.prototype.hasOwnProperty.call(bundleGroup, leaf)
    )) {
        return undefined;
    }
    return bundleGroup[leaf];
}

function formatPlaceholders(
    template: string,
    values: Record<string, string | number | boolean> | undefined
): string {
    if (!template.includes('{{')) {
        return template;
    }
    const parts = replacePlaceholders(template, placeholder => {
        if (!(values && Object.prototype.hasOwnProperty.call(values, placeholder))) {
            return '';
        }
        return values[placeholder] ?? '';
    });
    return parts.join('');
}

function templatePlaceholders(template: string, values: Record<string, React.ReactNode>): React.ReactNode {
    const parts = replacePlaceholders(template, placeholder => {
        if (!Object.prototype.hasOwnProperty.call(values, placeholder)) {
            return null;
        }
        return values[placeholder] ?? null;
    });
    return React.createElement(React.Fragment, null, ...parts);
}

function replacePlaceholders<T>(
    template: string,
    replacer: (placeholder: string) => T
): Array<string | T> {
    const parts: Array<string | T> = [];
    const templateRegex = /\{\{([a-zA-Z0-9_]+)\}\}/g;
    let lastIndex = 0;
    let result: RegExpExecArray | null;
    while ((result = templateRegex.exec(template))) {
        const [prefix, placeholder] = result;
        const startIndex = templateRegex.lastIndex - prefix.length;
        if (startIndex != lastIndex) {
            parts.push(template.substring(lastIndex, startIndex));
        }
        const part = replacer(placeholder);
        parts.push(part);
        lastIndex = templateRegex.lastIndex;
    }
    if (lastIndex < template.length) {
        parts.push(template.substring(lastIndex, template.length));
    }
    return parts;
}

function defaultSelectLabel(
    texts: ReadonlyArray<Rdf.Literal>,
    language: string
): Rdf.Literal | undefined {
    if (texts.length === 0) { return undefined; }
    let defaultValue: Rdf.Literal | undefined;
    let englishValue: Rdf.Literal | undefined;
    for (const text of texts) {
        if (text.language === language) {
            return text;
        } else if (text.language === '') {
            defaultValue = text;
        } else if (text.language === 'en') {
            englishValue = text;
        }
    }
    return (
        defaultValue !== undefined ? defaultValue :
        englishValue !== undefined ? englishValue :
        texts[0]
    );
}

function resolveLabel(label: Rdf.Literal | undefined, fallbackIri: string): string {
    if (label) { return label.value; }
    return Rdf.getLocalName(fallbackIri) || fallbackIri;
}
