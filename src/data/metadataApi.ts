import { ElementModel, ElementTypeIri, LinkTypeIri, PropertyTypeIri, LinkModel, ElementIri } from './model';
import { LinkDirection } from '../diagram/elements';

export interface MetadataApi {
    /**
     * Can user create element and link from this element?
     */
    canDropOnCanvas(source: ElementModel, signal?: AbortSignal): Promise<boolean>;

    /**
     * Can we create link between two elements?
     */
    canDropOnElement(source: ElementModel, target: ElementModel, signal?: AbortSignal): Promise<boolean>;

    /**
     * Links of which types can we create between elements?
     */
    possibleLinkTypes(source: ElementModel, target: ElementModel, signal?: AbortSignal): Promise<DirectedLinkType[]>;

    /**
     * If new element is created by dragging link from existing element, this should return available element types.
     */
    typesOfElementsDraggedFrom(source: ElementModel, signal?: AbortSignal): Promise<ElementTypeIri[]>;

    /**
     * List properties for type meant to be edited in-place.
     */
    propertiesForType(type: ElementTypeIri, signal?: AbortSignal): Promise<PropertyTypeIri[]>;

    filterConstructibleTypes(
        types: ReadonlySet<ElementTypeIri>,
        signal?: AbortSignal
    ): Promise<ReadonlySet<ElementTypeIri>>;

    canDeleteElement(element: ElementModel, signal?: AbortSignal): Promise<boolean>;

    canEditElement(element: ElementModel, signal?: AbortSignal): Promise<boolean>;

    canLinkElement(element: ElementModel, signal?: AbortSignal): Promise<boolean>;

    canDeleteLink(link: LinkModel, source: ElementModel, target: ElementModel, signal?: AbortSignal): Promise<boolean>;

    canEditLink(link: LinkModel, source: ElementModel, target: ElementModel, signal?: AbortSignal): Promise<boolean>;

    generateNewElement(types: ReadonlyArray<ElementTypeIri>, signal?: AbortSignal): Promise<ElementModel>;
}

export interface DirectedLinkType {
    readonly linkTypeIri: LinkTypeIri;
    readonly direction: LinkDirection;
}
