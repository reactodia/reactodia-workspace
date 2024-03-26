import type { DataFactory } from './rdf/rdfModel';
import {
    ElementTypeModel, ElementTypeGraph, LinkTypeModel, ElementModel, LinkModel, LinkCount, PropertyTypeModel,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri, LinkedElement,
} from './model';

/**
 * Asynchronously provides data for the elements, links and other graph entities.
 */
export interface DataProvider {
    /**
     * Returns a factory to create RDF terms from a diagram model as necessary.
     */
    readonly factory: DataFactory;

    /**
     * Gets the structure and data for all known element types.
     */
    knownElementTypes(params: {
        signal?: AbortSignal;
    }): Promise<ElementTypeGraph>;

    /**
     * Gets the data and statistics for all known link types.
     */
    knownLinkTypes(params: {
        signal?: AbortSignal;
    }): Promise<LinkTypeModel[]>;

    /**
     * Gets the data for the specified element types.
     */
    elementTypes(params: {
        classIds: ReadonlyArray<ElementTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<ElementTypeIri, ElementTypeModel>>;

    /**
     * Gets the data for the specified property types.
     */
    propertyTypes(params: {
        propertyIds: ReadonlyArray<PropertyTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<PropertyTypeIri, PropertyTypeModel>>;

    /**
     * Gets the data for the specified link types.
     */
    linkTypes(params: {
        linkTypeIds: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<LinkTypeIri, LinkTypeModel>>;

    /**
     * Gets the data for the specified elements.
     */
    elements(params: {
        elementIds: ReadonlyArray<ElementIri>;
        signal?: AbortSignal;
    }): Promise<Map<ElementIri, ElementModel>>;

    /**
     * Get all links between specified elements.
     */
    links(params: {
        elementIds: ReadonlyArray<ElementIri>;
        linkTypeIds?: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<LinkModel[]>;

    /**
     * Gets connected link types of an element for exploration.
     */
    connectedLinkStats(params: {
        elementId: ElementIri;
        /**
         * Whether to allow to return inexact count of elements connected by
         * an each link type when result is non-zero.
         *
         * @default false
         */
        inexactCount?: boolean;
        signal?: AbortSignal;
    }): Promise<LinkCount[]>;

    /**
     * Looks up elements with different filters:
     *  - by an element type via `elementTypeId`;
     *  - by a connected element via `refElementId`, `refElementLinkId` and `linkDirection`;
     *  - by a text lookup via `text`;
     *
     * Filters can be combined to produce an intersection of the results.
     */
    lookup(params: LookupParams): Promise<LinkedElement[]>;
}

export interface LookupParams {
    /**
     * Filter by an element type.
     */
    elementTypeId?: ElementTypeIri;
    
    /**
     * Filter by a text lookup.
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
