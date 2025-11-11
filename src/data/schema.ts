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
 * Well-known properties for element state ({@link Element.elementState})
 * or link state ({@link Link.linkState}).
 *
 * @category Constants
 */
export enum TemplateProperties {
    /**
     * Element state property to display the element as expanded
     * (if element template supports expanded state).
     *
     * @see {@link Element.isExpanded}
     */
    Expanded = 'urn:reactodia:expanded',
    /**
     * Element state property for user-modifiable template size
     * (if element template supports changing its size).
     */
    ElementSize = 'urn:reactodia:elementSize',
    /**
     * Element state property to mark some element data properties as "pinned",
     * i.e. displayed even if element is collapsed.
     *
     * @see {@link PinnedProperties}
     */
    PinnedProperties = 'urn:reactodia:pinnedProperties',
    /**
     * Link state property to change to name of a specific link only on the diagram
     * (instead of displaying link type label).
     */
    CustomLabel = 'urn:reactodia:customLabel',
    /**
     * Link state property to mark link as present only on the diagram but
     * missing from the data returned by a data provider.
     */
    LayoutOnly = 'urn:reactodia:layoutOnly',
    /**
     * Element state property for selected page index when element is a group
     * of multiple items displayed with pagination.
     */
    GroupPageIndex = 'urn:reactodia:groupPageIndex',
    /**
     * Element state property for selected page size when element is a group
     * of multiple items displayed with pagination.
     */
    GroupPageSize = 'urn:reactodia:groupPageSize',
    /**
     * Element state property for the annotation content.
     *
     * @see {@link AnnotationContent}
     */
    AnnotationContent = 'urn:reactodia:annotationContent',
    /**
     * Element or link state property to select a color variant for its style
     * from a predefined list.
     *
     * @see {@link ColorVariant}
     */
    ColorVariant = 'urn:reactodia:colorVariant',
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

/**
 * Utility function to set optional {@link TemplateProperties template property} value.
 *
 * If the `value` is `undefined`, the property will be removed from the `state`,
 * otherwise the new value will be set.
 */
export function setTemplateProperty<T>(
    state: { readonly [propertyId: string]: unknown } | undefined,
    propertyId: string,
    value: T | undefined
): { readonly [propertyId: string]: unknown } | undefined {
    if (value !== undefined) {
        return state?.[propertyId] === value
            ? state : {...state, [propertyId]: value};
    } else if (state?.[propertyId] !== undefined) {
        const {[propertyId]: _, ...withoutProperty} = state;
        return withoutProperty;
    }
    return state;
}
