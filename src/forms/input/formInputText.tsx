import cx from 'clsx';
import * as React from 'react';

import { useTranslation } from '../../coreUtils/i18n';

import * as Rdf from '../../data/rdf/rdfModel';

import { type FormInputSingleProps } from './inputCommon';

const CLASS_NAME = 'reactodia-property-input-text';

/**
 * Props for {@link FormInputText} component.
 *
 * @see {@link FormInputText}
 */
export interface FormInputTextProps extends FormInputSingleProps {
    /**
     * Whether to use multiline `textarea` to display and edit the text value.
     *
     * @default false
     */
    multiline?: boolean;
    /**
     * Placeholder text for the form input.
     *
     * @default "Property value"
     */
    placeholder?: string;
}

/**
 * Form input to edit a single value as a plain string.
 *
 * If specified value shape has `rdf:langString` or `xsd:string` datatype,
 * a language selector with languages from {@link MetadataProvider.getLiteralLanguages}
 * will be displayed as well.
 *
 * **Unstable**: this component will likely change in the future.
 */
export function FormInputText(props: FormInputTextProps) {
    const {
        shape: {valueShape}, languages, value: term, setValue, factory,
        multiline, placeholder,
    } = props;

    const t = useTranslation();

    const Component = multiline ? 'textarea' : 'input';
    const hasLanguageSelector = valueShape.termType === 'Literal' && (
        !valueShape.datatype ||
        valueShape.datatype.value === Rdf.Vocabulary.rdf.langString ||
        valueShape.datatype.value === Rdf.Vocabulary.xsd.string
    );

    return (
        <>
            <Component name='reactodia-text-property-input'
                className={cx('reactodia-form-control', CLASS_NAME)}
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
    if (languages.length === 0 && !language) {
        return null;
    }
    return (
        <select className={cx('reactodia-form-control', `${CLASS_NAME}__language`)}
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
