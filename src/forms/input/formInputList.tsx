import cx from 'clsx';
import * as React from 'react';

import { shallowArrayEqual } from '../../coreUtils/collections';
import { useTranslation } from '../../coreUtils/i18n';

import * as Rdf from '../../data/rdf/rdfModel';
import type { MetadataValueShape } from '../../data/metadataProvider';

import type { FormInputSingleProps, FormInputMultiProps } from './inputCommon';

const CLASS_NAME = 'reactodia-property-input-list';

/**
 * Props for {@link FormInputList} component.
 *
 * @see {@link FormInputList}
 */
export interface FormInputListProps extends FormInputMultiProps {
    /**
     * Form input component type to edit each property value.
     */
    valueInput: React.ElementType<FormInputSingleProps>;
}

function FormInputListInner(props: FormInputListProps) {
    const {shape, languages, values, updateValues, factory, valueInput: ValueInput} = props;
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
                                if (index >= previous.length || !Rdf.equalTerms(previous[index], term)) {
                                    return previous;
                                }
                                const nextValues = [...previous];
                                nextValues[index] = nextValue;
                                return nextValues;
                            });
                        }}
                        factory={factory}
                    />
                    {values.length <= minCount ? null : (
                        <button type='button'
                            className={cx(
                                'reactodia-btn',
                                'reactodia-btn-default',
                                `${CLASS_NAME}__value-remove`
                            )}
                            title={t.text('visual_authoring.property.remove_value.title')}
                            onClick={() => updateValues(previous => {
                                if (index >= previous.length || !Rdf.equalTerms(previous[index], term)) {
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
            {values.length >= maxCount ? null : (
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
            )}
        </>
    );
}

/**
 * Form input to edit multiple values in a list of specified single value inputs.
 *
 * **Unstable**: this component will likely change in the future.
 */
export const FormInputList = React.memo(
    FormInputListInner,
    (prevProps, nextProps) => (
        prevProps.shape === nextProps.shape &&
        shallowArrayEqual(prevProps.languages, nextProps.languages) &&
        prevProps.values === nextProps.values &&
        prevProps.updateValues === nextProps.updateValues &&
        prevProps.factory === nextProps.factory &&
        prevProps.valueInput === nextProps.valueInput
    )
);

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
