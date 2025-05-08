import cx from 'clsx';
import * as React from 'react';

import { useTranslation } from '../../coreUtils/i18n';

import * as Rdf from '../../data/rdf/rdfModel';

import { type PropertyInputSingleProps } from './inputCommon';

const CLASS_NAME = 'reactodia-property-input-text';

/**
 * Props for {@link PropertyInputText} component.
 *
 * @see {@link PropertyInputText}
 */
export interface PropertyInputTextProps extends PropertyInputSingleProps {
    /**
     * Placeholder text for the property input.
     *
     * @default "Property value"
     */
    placeholder?: string;
}

/**
 * Property input to edit a single value as a plain string.
 *
 * If specified value shape has `rdf:langString` or `xsd:string` datatype,
 * a language selector with languages from {@link MetadataProvider.getLiteralLanguages}
 * will be displayed as well.
 */
export function PropertyInputText(props: PropertyInputTextProps) {
    const {shape: {valueShape}, languages, value: term, setValue, factory, placeholder} = props;

    const t = useTranslation();

    const hasLanguageSelector = valueShape.termType === 'Literal' && (
        !valueShape.datatype ||
        valueShape.datatype.value === Rdf.Vocabulary.rdf.langString ||
        valueShape.datatype.value === Rdf.Vocabulary.xsd.string
    );

    return (
        <>
            <input name='reactodia-text-property-input'
                className='reactodia-form-control'
                placeholder={placeholder ?? t.text('visual_authoring.property.text_value.placeholder')}
                value={term.value}
                onChange={e => {
                    const changedValue = e.currentTarget.value;
                    setValue(setTermValue(term, changedValue, factory));
                }}
            />
            {hasLanguageSelector ? (
                <LanguageSelector language={term.termType === 'Literal' ? term.language : ''}
                    languages={languages}
                    onChangeLanguage={language => setValue(setTermLanguage(term, language, factory))}
                />
            ) : null}
        </>
    );
}

function LanguageSelector(props: {
    language: string;
    languages: ReadonlyArray<string>;
    onChangeLanguage: (language: string) => void;
}) {
    const {language, languages, onChangeLanguage} = props;
    return (
        <select className={cx('reactodia-form-control', `${CLASS_NAME}__language`)}
            disabled={languages.length === 0 && !language}
            value={language}
            onChange={e => onChangeLanguage(e.currentTarget.value)}>
            <option value=''>—</option>
            {language && !languages.includes(language) ? (
                <option value={language}>{language}</option>
            ) : null}
            {languages.map(code => <option key={code} value={code}>{code}</option>)}
        </select>
    );
}

function setTermValue(
    term: Rdf.NamedNode | Rdf.Literal,
    value: string,
    factory: Rdf.DataFactory
): Rdf.NamedNode | Rdf.Literal {
    if (term.termType === 'NamedNode') {
        return factory.namedNode(value);
    } else if (term.language) {
        return factory.literal(value, term.language);
    } else {
        return factory.literal(value, term.datatype);
    }
}

function setTermLanguage(
    term: Rdf.NamedNode | Rdf.Literal,
    language: string,
    factory: Rdf.DataFactory
): Rdf.NamedNode | Rdf.Literal {
    if (term.termType === 'Literal') {
        return factory.literal(term.value, language);
    }
    return term;
}
