import { ElementTypeIri, LinkTypeIri } from './model';
import { generate128BitID } from './utils';

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
export const PLACEHOLDER_ELEMENT_TYPE = 'urn:reactodia:newElement' as ElementTypeIri;
/**
 * Link type for an newly created temporary relation in graph authoring mode.
 *
 * @category Constants
 */
export const PLACEHOLDER_LINK_TYPE = 'urn:reactodia:newLink' as LinkTypeIri;

/**
 * Well-known properties for element state (`Element.elementState`)
 * or link state (`Link.linkState`).
 *
 * @category Constants
 */
export namespace TemplateProperties {
    /**
     * Element state property to mark some element data properties as "pinned",
     * i.e. displayed even if element is collapsed.
     *
     * @see PinnedProperties
     */
    export const PinnedProperties = 'urn:reactodia:pinnedProperties';
    /**
     * Link state property to change to name of a specific link only on the diagram
     * (instead of displaying link type label).
     */
    export const CustomLabel = 'urn:reactodia:customLabel';
    /**
     * Link state property to mark link as present only on the diagram but
     * missing from the data returned by a data provider.
     */
    export const LayoutOnly = 'urn:reactodia:layoutOnly';
    /**
     * Element state property for selected page index when element is a group
     * of multiple items displayed with pagination.
     */
    export const GroupPageIndex = 'urn:reactodia:groupPageIndex';
    /**
     * Element state property for selected page size when element is a group
     * of multiple items displayed with pagination.
     */
    export const GroupPageSize = 'urn:reactodia:groupPageSize';
}

/**
 * Shape for a value of the template state property `PinnedProperties`.
 *
 * @see TemplateProperties.PinnedProperties
 */
export interface PinnedProperties {
    readonly [propertyId: string]: boolean;
}
