import type { ElementTypeIri, LinkTypeIri } from './model';

/**
 * [JSON-LD](https://json-ld.org/) context IRI (`@context` value) for the
 * serialized diagram state.
 *
 * @category Constants
 */
export const DIAGRAM_CONTEXT_URL_V1 = 'https://ontodia.org/context/v1.json';

/**
 * Element type for an newly created temporary entity in graph authoring mode.
 *
 * @category Constants
 */
export const PLACEHOLDER_ELEMENT_TYPE: ElementTypeIri = 'urn:reactodia:newElement';
/**
 * Link type for an newly created temporary relation in graph authoring mode.
 *
 * @category Constants
 */
export const PLACEHOLDER_LINK_TYPE: LinkTypeIri = 'urn:reactodia:newLink';

/**
 * Well-known properties for element state ({@link Element.elementState})
 * or link state ({@link Link.linkState}).
 *
 * @category Constants
 */
export enum TemplateProperties {
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
