import * as React from 'react';

import type { PropertyTypeIri } from '../../data/model';

import type { InputMultiProps } from '../../forms';

import type { PropertyEditorOptions } from '../visualAuthoring/visualAuthoring';

import { DefaultEditEntityForm } from './editEntityForm';
import { DefaultEditRelationForm } from './editRelationForm';

/**
 * Props for {@link DefaultPropertyEditor} component.
 *
 * @see {@link DefaultPropertyEditor}
 */
export interface DefaultPropertyEditorProps {
    options: PropertyEditorOptions;
    resolveInput: PropertyEditorResolveInput;
}

/**
 * Resolves an input component to edit a specific entity or relation property.
 *
 * If the resolver returns `null` then the input will be hidden.
 *
 * @see {@link DefaultPropertyEditorProps.resolveInput}
 */
export type PropertyEditorResolveInput = (
    property: PropertyTypeIri,
    inputProps: InputMultiProps
) => React.ReactElement | null;

/**
 * Default editor for entity or relation properties at {@link VisualAuthoring}.
 *
 * @category Components
 * @see {@link PropertyEditor}
 */
export function DefaultPropertyEditor(props: DefaultPropertyEditorProps) {
    const {options, resolveInput} = props;
    switch (options.type) {
        case 'entity': {
            return (
                <DefaultEditEntityForm {...options} resolveInput={resolveInput} />
            );
        }
        case 'relation': {
            return (
                <DefaultEditRelationForm {...options} resolveInput={resolveInput} />
            );
        }
        default: {
            return null;
        }
    }
}
