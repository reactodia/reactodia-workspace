import * as React from 'react';

import DefaultBundle from '../../i18n/translations/en.reactodia-translation.json';

import {
    LabelLanguageSelector, TranslatedProperty, Translation, TranslationKey, TranslationBundle,
    TranslationContext,
} from '../coreUtils/i18n';

import { isEncodedBlank } from '../data/model';
import * as Rdf from '../data/rdf/rdfModel';

export const DefaultTranslationBundle: TranslationBundle = DefaultBundle;

export class DefaultTranslation implements Translation {
    constructor(
        protected readonly bundles: ReadonlyArray<Partial<TranslationBundle>>,
        protected readonly selectLabelLanguage: LabelLanguageSelector = defaultSelectLabel
    ) {}

    text(key: TranslationKey): string {
        const dotIndex = key.indexOf('.');
        if (!(dotIndex > 0 && dotIndex < key.length)) {
            throw new Error(`Reactodia: Invalid translation key: ${key}`);
        }
        const group = key.substring(0, dotIndex);
        const leaf = key.substring(dotIndex + 1);
        for (const bundle of this.bundles) {
            const text = getString(bundle, group, leaf);
            if (text !== undefined) {
                return text;
            }
        }
        return key;
    }

    format(key: TranslationKey, placeholders: Record<string, string | number | boolean>): string {
        const template = this.text(key);
        return formatPlaceholders(template, placeholders);
    }

    template(key: TranslationKey, parts: Record<string, React.ReactNode>): React.ReactNode {
        const template = this.text(key);
        return templatePlaceholders(template, parts);
    }

    selectLabel(
        labels: ReadonlyArray<Rdf.Literal>,
        language: string
    ): Rdf.Literal | undefined {
        const {selectLabelLanguage} = this;
        return selectLabelLanguage(labels, language);
    }

    formatLabel(
        labels: ReadonlyArray<Rdf.Literal> | undefined,
        fallbackIri: string,
        language: string
    ): string {
        const label = labels ? this.selectLabel(labels, language) : undefined;
        return resolveLabel(label, fallbackIri);
    }

    formatIri(iri: string): string {
        if (isEncodedBlank(iri)) {
            return '(blank node)';
        }
        return `<${iri}>`;
    }

    formatLabels<Iri extends string>(
        iris: ReadonlyArray<Iri>,
        getLabels: (iri: Iri) => ReadonlyArray<Rdf.Literal> | undefined,
        language: string
    ): string[] {
        const labelList = iris.map(iri => {
            const labels = getLabels(iri);
            return this.formatLabel(labels, iri, language);
        });
        labelList.sort();
        return labelList;
    }

    formatProperties<Iri extends string>(
        properties: Readonly<Record<Iri, ReadonlyArray<Rdf.NamedNode | Rdf.Literal>>>,
        getLabels: (iri: Iri) => ReadonlyArray<Rdf.Literal> | undefined,
        language: string
    ): TranslatedProperty[] {
        const propertyIris = Object.keys(properties) as Iri[];
        const propertyList = propertyIris.map((iri): TranslatedProperty => {
            const labels = getLabels(iri);
            const label = this.formatLabel(labels, iri, language);
            const allValues = properties[iri];
            const localizedValues = allValues.filter(v =>
                v.termType === 'NamedNode' ||
                v.language === '' ||
                v.language === language
            );
            return {
                iri,
                label,
                values: localizedValues.length === 0 ? allValues : localizedValues,
            };
        });
        propertyList.sort((a, b) => a.label.localeCompare(b.label));
        return propertyList;
    }
}

function getString(
    bundle: Record<string, Record<string, string> | string | undefined>,
    group: string,
    leaf: string
): string | undefined {
    if (!Object.prototype.hasOwnProperty.call(bundle, group)) {
        return undefined;
    }
    const bundleGroup = bundle[group];
    if (!(
        typeof bundleGroup === 'object' &&
        bundleGroup &&
        Object.prototype.hasOwnProperty.call(bundleGroup, leaf)
    )) {
        return undefined;
    }
    return bundleGroup[leaf];
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
