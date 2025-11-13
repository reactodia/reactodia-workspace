import type { Size } from '../diagram/geometry';

import type { ElementTypeIri, LinkTypeIri, PropertyTypeIri } from './model';

/**
 * [JSON-LD](https://json-ld.org/) context IRI (`@context` value) for the
 * serialized diagram state.
 *
 * @category Constants
 */
export const DiagramContextV1 = 'https://ontodia.org/context/v1.json';
/**
 * Property type to mark placeholder (i.e. not loaded yet) entity data.
 *
 * @category Constants
 * @see {@link EntityElement.placeholderData}
 */
export const PlaceholderDataProperty: PropertyTypeIri = 'urn:reactodia:isPlaceholder';
/**
 * Type for a newly created temporary entity in graph authoring mode.
 *
 * @category Constants
 */
export const PlaceholderEntityType: ElementTypeIri = 'urn:reactodia:newElement';
/**
 * Type for an newly created temporary relation in graph authoring mode.
 *
 * @category Constants
 */
export const PlaceholderRelationType: LinkTypeIri = 'urn:reactodia:newLink';

/**
 * Typed {@link TemplateState template state} property (string literal).
 *
 * @see {@link templateProperty}
 */
export type TemplateProperty<K extends string = string, V = unknown> = K & { __value: V };

/**
 * Contains a state with typed values for any defined
 * {@link TemplateProperties template properties}.
 *
 * Each property value should be JSON-serializable to be able
 * to export and import it as part of the serialized diagram layout.
 */
export class TemplateState {
    static empty = new TemplateState(undefined);

    constructor(
        private readonly value: { [property: string]: unknown } | undefined
    ) {}

    /**
     * Utility function to define typed {@link TemplateProperty template property}.
     *
     * **Example**:
     * ```ts
     * const MyNumberProperty = TemplateState.property('urn:my:prop1').of<number>();
     * ```
     */
    static property<K extends string>(key: K): { of<V>(): TemplateProperty<K, V> } {
        return {
            of: <V>() => key as TemplateProperty<K, V>,
        };
    }

    /**
     * Gets typed {@link TemplateProperties template property} value from
     * a template state.
     */
    get<V>(property: TemplateProperty<string, V>): V | undefined {
        return this.value?.[property] as V | undefined;
    }

    /**
     * Sets optional typed {@link TemplateProperties template property} value
     * on a template state.
     *
     * This function never mutates the original state and always return
     * either original state (if the property value is the same) or newly
     * created updated state.
     *
     * If the `value` is `undefined`, the property will be removed from the `state`,
     * otherwise the new value will be set.
     */
    set<V>(property: TemplateProperty<string, V>, value: V): TemplateState {
        const state = this.value;
        if (value !== undefined) {
            if (state?.[property] !== value) {
                return new TemplateState({...state, [property]: value});
            }
        } else if (state?.[property] !== undefined) {
            const {[property]: _, ...withoutProperty} = state;
            return new TemplateState(withoutProperty);
        }
        return this;
    }

    static fromJSON(
        value: { readonly [property: string]: unknown } | undefined
    ): TemplateState {
        return value === undefined ? TemplateState.empty : new TemplateState(value);
    }

    toJSON(): SerializedTemplateState | undefined {
        return this.value ? {...this.value} : undefined;
    }
}

/**
 * Serialized template state.
 *
 * @see {@link TemplateState}
 */
export type SerializedTemplateState = { readonly [property: string]: unknown };

/**
 * Well-known {@link TemplateProperty template properties} for
 * element state ({@link Element.elementState}) or link state ({@link Link.linkState}).
 *
 * @category Constants
 */
export namespace TemplateProperties {
    /**
     * Element state property to display the element as expanded
     * (if element template supports expanded state).
     *
     * @see {@link Element.isExpanded}
     */
    export const Expanded =
        TemplateState.property('urn:reactodia:expanded').of<boolean>();
    /**
     * Element state property for user-modifiable template size
     * (if element template supports changing its size).
     */
    export const ElementSize =
        TemplateState.property('urn:reactodia:elementSize').of<Size>();
    /**
     * Element state property to mark some element data properties as "pinned",
     * i.e. displayed even if element is collapsed.
     *
     * @see {@link PinnedProperties}
     */
    export const PinnedProperties =
        TemplateState.property('urn:reactodia:pinnedProperties').of<PinnedProperties>();
    /**
     * Link state property to change to name of a specific link only on the diagram
     * (instead of displaying link type label).
     */
    export const CustomLabel =
        TemplateState.property('urn:reactodia:customLabel').of<string>();
    /**
     * Link state property to mark link as present only on the diagram but
     * missing from the data returned by a data provider.
     */
    export const LayoutOnly =
        TemplateState.property('urn:reactodia:layoutOnly').of<boolean>();
    /**
     * Element state property for selected page index when element is a group
     * of multiple items displayed with pagination.
     */
    export const GroupPageIndex =
        TemplateState.property('urn:reactodia:groupPageIndex').of<number>();
    /**
     * Element state property for selected page size when element is a group
     * of multiple items displayed with pagination.
     */
    export const GroupPageSize =
        TemplateState.property('urn:reactodia:groupPageSize').of<number>();
    /**
     * Element state property for the annotation content.
     *
     * @see {@link AnnotationContent}
     */
    export const AnnotationContent =
        TemplateState.property('urn:reactodia:annotationContent').of<AnnotationContent>();
    /**
     * Element or link state property to select a color variant for its style
     * from a predefined list.
     *
     * @see {@link ColorVariant}
     */
    export const ColorVariant =
        TemplateState.property('urn:reactodia:colorVariant').of<ColorVariant>();
}

/**
 * Shape for a value of the template state property
 * {@link TemplateProperties.PinnedProperties}.
 *
 * @see {@link TemplateProperties.PinnedProperties}
 */
export interface PinnedProperties {
    readonly [propertyId: string]: boolean;
}

/**
 * Annotation content for the template state property
 * {@link TemplateProperties.AnnotationContent}.
 *
 * @see {@link TemplateProperties.AnnotationContent}
 */
export interface AnnotationContent {
    /**
     * Content type: plain text with specified styles.
     */
    readonly type: 'plaintext';
    /**
     * Plain text content without any formatting.
     */
    readonly text: string;
    /**
     * Styles for the whole text content.
     */
    readonly style?: AnnotationTextStyle;
}

/**
 * Subset of supported styles for the {@link AnnotationContent annotation text content}.
 */
export type AnnotationTextStyle = Pick<
    React.CSSProperties,
    'fontStyle' | 'fontWeight' | 'textDecorationLine' | 'textAlign'
>;

/**
 * Color variant from a predefined list of theme colors.
 *
 * @see {@link TemplateProperties.ColorVariant}
 */
export type ColorVariant =
    'default' | 'primary' | 'success' | 'info' | 'warning' | 'danger';

export const DefaultColorVariants: readonly ColorVariant[] = [
    'default',
    'primary',
    'success',
    'info',
    'warning',
    'danger',
];
