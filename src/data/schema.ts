import { ElementTypeIri, LinkTypeIri } from './model';
import { generate128BitID } from './utils';

/**
 * @category Constants
 */
export const DIAGRAM_CONTEXT_URL_V1 = 'https://ontodia.org/context/v1.json';

/**
 * @category Constants
 */
export const PLACEHOLDER_ELEMENT_TYPE = 'urn:reactodia:newElement' as ElementTypeIri;
/**
 * @category Constants
 */
export const PLACEHOLDER_LINK_TYPE = 'urn:reactodia:newLink' as LinkTypeIri;

/**
 * @category Constants
 */
export namespace GenerateID {
    export function forElement() { return `urn:reactodia:e:${generate128BitID()}`; }
    export function forLink() { return `urn:reactodia:l:${generate128BitID()}`; }
}

/**
 * @category Constants
 */
export namespace TemplateProperties {
    export const PinnedProperties = 'urn:reactodia:pinnedProperties';
    export const CustomLabel = 'urn:reactodia:customLabel';
    export const LayoutOnly = 'urn:reactodia:layoutOnly';
    export const GroupPageIndex = 'urn:reactodia:groupPageIndex';
    export const GroupPageSize = 'urn:reactodia:groupPageSize';
}

export interface PinnedProperties {
    readonly [propertyId: string]: boolean;
}
