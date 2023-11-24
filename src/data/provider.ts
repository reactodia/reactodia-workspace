import type { DataFactory } from './rdf/rdfModel';
import {
    ElementType, ElementTypeGraph, LinkType, ElementModel, LinkModel, LinkCount, PropertyType,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri,
} from './model';

/**
 * Asynchronously provides data for diagram elements, links and other diagram entities.
 */
export interface DataProvider {
    readonly factory: DataFactory;

    /**
     * Returns the structure of the class tree.
     */
    knownElementTypes(params: {
        signal?: AbortSignal;
    }): Promise<ElementTypeGraph>;

    /**
     * Returns link types along with statistics.
     */
    knownLinkTypes(params: {
        signal?: AbortSignal;
    }): Promise<LinkType[]>;

    /**
     * Class information
     */
    elementTypes(params: {
        classIds: ReadonlyArray<ElementTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<ElementTypeIri, ElementType>>;

    /**
     * Data properties information
     */
    propertyTypes(params: {
        propertyIds: ReadonlyArray<PropertyTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<PropertyTypeIri, PropertyType>>;

    /**
     * Link type information.
     */
    linkTypes(params: {
        linkTypeIds: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<LinkTypeIri, LinkType>>;

    /**
     * Getting the elements from the data source on diagram initialization and on navigation events
     */
    elements(params: {
        elementIds: ReadonlyArray<ElementIri>;
        signal?: AbortSignal;
    }): Promise<Map<ElementIri, ElementModel>>;

    /**
     * Should return all links between elements.
     * linkTypeIds is ignored in current sparql providers and is subject to be removed
     */
    links(params: {
        elementIds: ReadonlyArray<ElementIri>;
        linkTypeIds?: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<LinkModel[]>;

    /**
     * Get link types of element to build navigation menu
     */
    connectedLinkStats(params: {
        elementId: ElementIri;
        signal?: AbortSignal;
    }): Promise<LinkCount[]>;

    /**
     * Looks up elements with different filters:
     *  - by type (),
     * by element and it's connection, by full-text search.
     * Implementation should implement all possible combinations.
     */
    lookup(params: LookupParams): Promise<LinkedElement[]>;
}

export interface LookupParams {
    /**
     * Filter by element type.
     */
    elementTypeId?: ElementTypeIri;
    
    /**
     * Filter by full-text search.
     */
    text?: string;

    /**
     * Filter by having a connected element with specified IRI.
     */
    refElementId?: ElementIri;

    /**
     * Filter by connection link type.
     *
     * Only applicable when `refElementId` is set.
     */
    refElementLinkId?: LinkTypeIri;

    /**
     * Reference element link type direction ('in' | 'out').
     * 
     * Only when `refElementLinkId` is set.
     */
    linkDirection?: 'in' | 'out';

    /**
     * Limit number of elements returned.
     *
     * Pass `null` to explicitly disable the limit.
     *
     * Default depends on the provider implementation.
     */
    limit?: number | null;

    /**
     * Abort signal to cancel the async operation.
     */
    signal?: AbortSignal;
}

export interface LinkedElement {
    readonly element: ElementModel;
    readonly inLinks: ReadonlySet<LinkTypeIri>;
    readonly outLinks: ReadonlySet<LinkTypeIri>;
}
