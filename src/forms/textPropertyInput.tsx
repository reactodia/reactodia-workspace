import cx from 'clsx';
import * as React from 'react';

import { shallowArrayEqual } from '../coreUtils/collections';
import { useTranslation } from '../coreUtils/i18n';

import * as Rdf from '../data/rdf/rdfModel';
import type { MetadataPropertyShape, MetadataValueShape } from '../data/metadataProvider';

const CLASS_NAME = 'reactodia-text-property-input';

export type PropertyUpdater = (previous: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>) =>
    ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;

function TextPropertyInputInner(props: {
    shape: MetadataPropertyShape;
    languages: ReadonlyArray<string>;
    values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;
    updateValues: (updater: PropertyUpdater) => void;
    factory: Rdf.DataFactory;
}) {
    const {shape, languages, values, updateValues, factory} = props;
    const t = useTranslation();

    const keys = React.useRef<number[]>([]);
    const nextKey = React.useRef(1);
    while (keys.current.length < values.length) {
        keys.current.push(nextKey.current);
        nextKey.current += 1;
    }

    const hasLanguageSelector = shape.valueShape.termType === 'Literal' && (
        !shape.valueShape.datatype ||
        shape.valueShape.datatype.value === XSD_STRING ||
        shape.valueShape.datatype.value === RDF_LANG_STRING
    );

    const placeholder = t.text('visual_authoring.property.text_value.placeholder');
    return (
        <>
            {values.map((term, index) => (
                <div key={keys.current[index]}
                    className={`${CLASS_NAME}__row`}>
                    <input name='reactodia-text-property-input'
                        className='reactodia-form-control'
                        placeholder={placeholder}
                        value={term.value}
                        onChange={e => {
                            const changedValue = e.currentTarget.value;
                            updateValues(previous => {
                                if (previous[index] !== term) {
                                    return previous;
                                }
                                const nextValues = [...previous];
                                nextValues[index] = setTermValue(term, changedValue, factory);
                                return nextValues;
                            });
                        }}
                    />
                    {hasLanguageSelector ? (
                        <LanguageSelector language={term.termType === 'Literal' ? term.language : ''}
                            languages={languages}
                            onChangeLanguage={language => updateValues(previous => {
                                if (previous[index] !== term) {
                                    return previous;
                                }
                                const nextValues = [...previous];
                                nextValues[index] = setTermLanguage(term, language, factory);
                                return nextValues;
                            })}
                        />
                    ) : null}
                    <button type='button'
                        className={cx(
                            'reactodia-btn',
                            'reactodia-btn-default',
                            `${CLASS_NAME}__value-remove`
                        )}
                        title={t.text('visual_authoring.property.remove_value.title')}
                        onClick={() => updateValues(previous => {
                            if (previous[index] !== term) {
                                return previous;
                            }
                            const nextValues = [...previous];
                            keys.current.splice(index, 1);
                            nextValues.splice(index, 1);
                            return nextValues;
                        })}
                    />
                </div>
            ))}
            <div key='add' className={`${CLASS_NAME}__row`}>
                <button type='button'
                    className={cx(
                        'reactodia-btn',
                        'reactodia-btn-default',
                        `${CLASS_NAME}__value-add`
                    )}
                    title={t.text('visual_authoring.property.add_value.title')}
                    onClick={() => updateValues(previous => {
                        return [...previous, makeEmptyTerm(shape.valueShape, factory)];
                    })}
                />
            </div>
        </>
    );
}

const RDF_LANG_STRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString';
const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';

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

function makeEmptyTerm(
    valueShape: MetadataValueShape,
    factory: Rdf.DataFactory
): Rdf.NamedNode | Rdf.Literal {
    switch (valueShape.termType) {
        case 'NamedNode': {
            return factory.namedNode('');
        }
        default: {
            return factory.literal('', valueShape.datatype);
        }
    }
}

export const TextPropertyInput = React.memo(
    TextPropertyInputInner,
    (prevProps, nextProps) => (
        prevProps.shape === nextProps.shape &&
        shallowArrayEqual(prevProps.languages, nextProps.languages) &&
        prevProps.values === nextProps.values &&
        prevProps.updateValues === nextProps.updateValues &&
        prevProps.factory === nextProps.factory
    )
);
