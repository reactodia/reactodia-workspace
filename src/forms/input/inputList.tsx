import cx from 'clsx';
import * as React from 'react';

import { useTranslation } from '../../coreUtils/i18n';

import type * as Rdf from '../../data/rdf/rdfModel';
import type { MetadataValueShape } from '../../data/metadataProvider';

import type { InputSingleProps, InputMultiProps } from './inputCommon';

const CLASS_NAME = 'reactodia-property-input-list';

/**
 * Props for {@link InputList} component.
 *
 * @see {@link InputList}
 */
export interface InputListProps extends InputMultiProps {
    /**
     * Form input component type to edit each property value.
     */
    valueInput: React.ElementType<InputSingleProps>;
}

function InputListInner(props: InputListProps) {
    const {
        shape, languages, values, updateValues, factory, readonly, placeholder,
        valueInput: ValueInput,
    } = props;
    const t = useTranslation();

    const {minCount = 0, maxCount = Infinity} = shape;

    const keys = React.useRef<number[]>([]);
    const nextKey = React.useRef(1);
    while (keys.current.length < values.length) {
        keys.current.push(nextKey.current);
        nextKey.current += 1;
    }

    return (
        <>
            {values.map((term, index) => (
                <div key={keys.current[index]}
                    className={`${CLASS_NAME}__row`}>
                    <ValueInput
                        shape={shape}
                        languages={languages}
                        value={values[index]}
                        setValue={nextValue => {
                            updateValues(previous => {
                                if (index >= previous.length || !previous[index].equals(term)) {
                                    return previous;
                                }
                                const nextValues = [...previous];
                                nextValues[index] = nextValue;
                                return nextValues;
                            });
                        }}
                        factory={factory}
                        readonly={readonly}
                        placeholder={placeholder}
                    />
                    {readonly || values.length <= minCount ? null : (
                        <button type='button'
                            className={cx(
                                'reactodia-btn',
                                'reactodia-btn-default',
                                `${CLASS_NAME}__value-remove`
                            )}
                            title={t.text('forms.input_list.remove_value.title')}
                            onClick={() => updateValues(previous => {
                                if (index >= previous.length || !previous[index].equals(term)) {
                                    return previous;
                                }
                                const nextValues = [...previous];
                                keys.current.splice(index, 1);
                                nextValues.splice(index, 1);
                                return nextValues;
                            })}
                        />
                    )}
                </div>
            ))}
            {readonly || values.length >= maxCount ? null : (
                <div key='add' className={`${CLASS_NAME}__row`}>
                    <button type='button'
                        className={cx(
                            'reactodia-btn',
                            'reactodia-btn-default',
                            `${CLASS_NAME}__value-add`
                        )}
                        title={t.text('forms.input_list.add_value.title')}
                        onClick={() => updateValues(previous => {
                            return [...previous, makeDefaultTerm(shape.valueShape, factory)];
                        })}
                    />
                </div>
            )}
        </>
    );
}

const InputListMemo = React.memo(
    InputListInner,
    (prevProps, nextProps) => (
        prevProps.shape === nextProps.shape &&
        sameLanguages(prevProps.languages, nextProps.languages) &&
        prevProps.values === nextProps.values &&
        prevProps.updateValues === nextProps.updateValues &&
        prevProps.factory === nextProps.factory &&
        prevProps.valueInput === nextProps.valueInput
    )
);

/**
 * Form input to edit multiple values in a list of specified single value inputs.
 *
 * **Unstable**: this component will likely change in the future.
 *
 * @category Components
 */
export function InputList(props: InputListProps) {
    return <InputListMemo {...props} />;
}

function sameLanguages(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

function makeDefaultTerm(
    valueShape: MetadataValueShape,
    factory: Rdf.DataFactory
): Rdf.NamedNode | Rdf.Literal {
    switch (valueShape.termType) {
        case 'NamedNode': {
            return valueShape.defaultValue ?? factory.namedNode('');
        }
        default: {
            return valueShape.defaultValue ?? factory.literal('', valueShape.datatype);
        }
    }
}
