import * as React from 'react';

import * as Rdf from '../../data/rdf/rdfModel';
import { getLocalName } from '../../data/rdf/rdfModel';

import type { InputSingleProps } from './inputCommon';

/**
 * Props for {@link InputSelect} component.
 *
 * @see {@link InputSelect}
 */
export interface InputSelectProps extends InputSingleProps {
    /**
     * Ordered list of variants to select from.
     */
    variants: ReadonlyArray<InputSelectVariant>;
}

/**
 * Variant to select in {@link InputSelect} input.
 */
export interface InputSelectVariant {
    /**
     * RDF value to select.
     */
    readonly value: Rdf.NamedNode | Rdf.Literal;
    /**
     * Label for the variant.
     */
    readonly label?: string;
}

/**
 * Form input to select a value from a predefined list of variants.
 *
 * **Unstable**: this component will likely change in the future.
 *
 * @category Components
 */
export function InputSelect(props: InputSelectProps) {
    const {variants, value, setValue} = props;
    
    React.useEffect(() => {
        if (value.value === '' && variants.length > 0) {
            const variant = variants.find(v => value.equals(v.value));
            if (!variant) {
                setValue(variants[0].value);
            }
        }
    }, [value, variants]);

    return (
        <select className='reactodia-form-control'
            value={props.value.value}
            onChange={e => {
                const nextValue = e.currentTarget.value;
                const variant = variants.find(v => v.value.value === nextValue);
                if (variant) {
                    props.setValue(variant.value);
                }
            }}>
            {variants.map(({value: term, label}) => {
                let variantLabel = label;
                if (!variantLabel && term.termType === 'NamedNode') {
                    variantLabel = getLocalName(term.value);
                }
                return (
                    <option key={term.value} value={term.value}>
                        {variantLabel ?? term.value}
                    </option>
                );
            })}
        </select>
    );
}
