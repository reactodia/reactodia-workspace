import type { DataFactory } from './rdf/rdfModel';
import {
    ElementTypeGraph, ElementTypeModel, LinkTypeModel, ElementModel, LinkModel, PropertyTypeModel,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri,
} from './model';

/**
 * Asynchronously provides data for the elements, links and other graph entities.
 *
 * @category Data
 */
export interface DataProvider {
    /**
     * Returns an [RDF term factory](https://rdf.js.org/data-model-spec/#datafactory-interface)
     * to create RDF terms for identifiers and property values.
     */
    readonly factory: DataFactory;

    /**
     * Gets the structure and data for all known element types.
     */
    knownElementTypes(params: {
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<ElementTypeGraph>;

    /**
     * Gets the data and statistics for all known link types.
     */
    knownLinkTypes(params: {
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<LinkTypeModel[]>;

    /**
     * Gets the data for the specified element types.
     */
    elementTypes(params: {
        /**
         * Target element types to query data for.
         */
        classIds: ReadonlyArray<ElementTypeIri>;
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<Map<ElementTypeIri, ElementTypeModel>>;

    /**
     * Gets the data for the specified property types.
     */
    propertyTypes(params: {
        /**
         * Target property types to query data for.
         */
        propertyIds: ReadonlyArray<PropertyTypeIri>;
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<Map<PropertyTypeIri, PropertyTypeModel>>;

    /**
     * Gets the data for the specified link types.
     */
    linkTypes(params: {
        /**
         * Target link types to query data for.
         */
        linkTypeIds: ReadonlyArray<LinkTypeIri>;
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<Map<LinkTypeIri, LinkTypeModel>>;

    /**
     * Gets the data for the specified elements.
     */
    elements(params: {
        /**
         * Target elements to query data for.
         */
        elementIds: ReadonlyArray<ElementIri>;
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<Map<ElementIri, ElementModel>>;

    /**
     * Get all links between two specified sets of entities (bipartite graph links).
     *
     * To get all links between all entities in the set, it is possible to
     * pass the same set to both `primary` and `secondary` sets of elements.
     */
    links(params: {
        /**
         * First set of entities to get links between them and `secondary` elements.
         */
        primary: ReadonlyArray<ElementIri>;
        /**
         * Second set of entities to get links between them and `primary` elements.
         */
        secondary: ReadonlyArray<ElementIri>;
        /**
         * Return only links with specified types.
         */
        linkTypeIds?: ReadonlyArray<LinkTypeIri>;
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<LinkModel[]>;

    /**
     * Gets connected link types of an element for exploration.
     */
    connectedLinkStats(params: {
        /**
         * Target element to count linked elements from/to.
         */
        elementId: ElementIri;
        /**
         * Whether to allow to return inexact count of elements connected by
         * an each link type when result is non-zero.
         *
         * @default false
         */
        inexactCount?: boolean;
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<DataProviderLinkCount[]>;

    /**
     * Looks up elements with different filters:
     *  - by an element type via `elementTypeId`;
     *  - by a connected element via `refElementId`, `refElementLinkId` and `linkDirection`;
     *  - by a text lookup via `text`;
     *
     * Filters can be combined to produce an intersection of the results.
     */
    lookup(params: DataProviderLookupParams): Promise<DataProviderLookupItem[]>;
}

/**
 * Describes how many unique elements are connected to some other element
 * via some link type (`id`) in each direction.
 *
 * @category Data
 * @see {@link DataProvider.connectedLinkStats}
 */
export interface DataProviderLinkCount {
    /**
     * Link type from/to target element.
     */
    readonly id: LinkTypeIri;
    /**
     * How many elements linked to target element via the link type.
     */
    readonly inCount: number;
    /**
     * How many elements linked from target element via the link type.
     */
    readonly outCount: number;
    /**
     * If `true`, then `inCount` and `outCount` values might be not exact
     * in case when the values are non-zero.
     */
    readonly inexact?: boolean;
}

/**
 * Parameters for {@link DataProvider.lookup} operation.
 *
 * @category Data
 * @see {@link DataProvider.lookup}
 */
export interface DataProviderLookupParams {
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

/**
 * Describes an element with information on which link types and directions
 * are used to connect it to other elements.
 *
 * @category Data
 * @see {@link DataProvider.lookup}
 */
export interface DataProviderLookupItem {
    /**
     * Result looked up element data.
     */
    readonly element: ElementModel;
    /**
     * Link types by which result `element` is linked from the lookup target
     * ({@link DataProviderLookupParams.refElementId refElementId}).
     *
     * Only applicable if {@link DataProviderLookupParams.refElementId refElementId}
     * is specified in {@link DataProvider.lookup}.
     */
    readonly inLinks: ReadonlySet<LinkTypeIri>;
    /**
     * Link types by which result `element` is linked to the lookup target
     * ({@link DataProviderLookupParams.refElementId refElementId}).
     *
     * Only applicable if {@link DataProviderLookupParams.refElementId refElementId}
     * is specified in {@link DataProvider.lookup}.
     */
    readonly outLinks: ReadonlySet<LinkTypeIri>;
}
