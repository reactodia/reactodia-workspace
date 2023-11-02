import type { DataFactory } from './rdf/rdfModel';
import {
    Dictionary, ClassModel, ClassGraphModel, LinkType, ElementModel, LinkModel, LinkCount, PropertyModel,
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
    classTree(params: {
        signal?: AbortSignal;
    }): Promise<ClassGraphModel>;

    /**
     * Returns link types along with statistics.
     */
    linkTypes(params: {
        signal?: AbortSignal;
    }): Promise<LinkType[]>;

    /**
     * Class information
     */
    classInfo(params: {
        classIds: ReadonlyArray<ElementTypeIri>;
        signal?: AbortSignal;
    }): Promise<ClassModel[]>;

    /**
     * Data properties information
     */
    propertyInfo(params: {
        propertyIds: ReadonlyArray<PropertyTypeIri>;
        signal?: AbortSignal;
    }): Promise<Dictionary<PropertyModel>>;

    /**
     * Link type information.
     */
    linkTypesInfo(params: {
        linkTypeIds: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<LinkType[]>;

    /**
     * Getting the elements from the data source on diagram initialization and on navigation events
     */
    elementInfo(params: {
        elementIds: ReadonlyArray<ElementIri>;
        signal?: AbortSignal;
    }): Promise<Dictionary<ElementModel>>;

    /**
     * Should return all links between elements.
     * linkTypeIds is ignored in current sparql providers and is subject to be removed
     */
    linksInfo(params: {
        elementIds: ReadonlyArray<ElementIri>;
        linkTypeIds?: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<LinkModel[]>;

    /**
     * Get link types of element to build navigation menu
     */
    linkTypesOf(params: {
        elementId: ElementIri;
        signal?: AbortSignal;
    }): Promise<LinkCount[]>;

    /**
     * Supports filter functionality with different filters - by type,
     * by element and it's connection, by full-text search.
     * Implementation should implement all possible combinations.
     */
    filter(params: FilterParams): Promise<LinkedElement[]>;
}

export interface FilterParams {
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
