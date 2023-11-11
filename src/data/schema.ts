import { ElementTypeIri, LinkTypeIri } from './model';
import { generate128BitID } from './utils';

export const DIAGRAM_CONTEXT_URL_V1 = 'https://ontodia.org/context/v1.json';

export const PLACEHOLDER_ELEMENT_TYPE = 'urn:reactodia:newElement' as ElementTypeIri;
export const PLACEHOLDER_LINK_TYPE = 'urn:reactodia:newLink' as LinkTypeIri;

export namespace GenerateID {
    export function forElement() { return `urn:reactodia:e:${generate128BitID()}`; }
    export function forLink() { return `urn:reactodia:l:${generate128BitID()}`; }
}

export namespace TemplateProperties {
    export const PinnedProperties = 'urn:reactodia:pinnedProperties';
    export const CustomLabel = 'urn:reactodia:customLabel';
}
