import * as Rdf from '../rdf/rdfModel';
import {
    DataProvider, DataProviderLinkCount, DataProviderLookupParams, DataProviderLookupItem,
} from '../provider';
import {
    ElementTypeModel, ElementTypeGraph, LinkTypeModel, ElementModel, LinkModel, PropertyTypeModel,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri,
} from '../model';
import {
    CompositeResponse,
    mergeKnownElementTypes,
    mergeKnownLinkTypes,
    mergeElementTypes,
    mergePropertyTypes,
    mergeLinkTypes,
    mergeElementInfo,
    mergeLinksInfo,
    mergeConnectedLinkStats,
    mergeLookup,
} from './mergeUtils';

/**
 * Options for {@link CompositeDataProvider}.
 *
 * @see {@link CompositeDataProvider}
 */
export interface CompositeDataProviderOptions {
    /**
     * Base data providers to combine result data from.
     */
    providers: ReadonlyArray<DataProviderDefinition>;
}

/**
 * Combined data provider definition.
 *
 * @see {@link CompositeDataProvider}
 */
export interface DataProviderDefinition {
    /**
     * Provider name to assist in debugging.
     */
    readonly name: string;
    /**
     * Data provider to combine data from.
     */
    readonly provider: DataProvider;
}

/**
 * Provides graph data by combining results from multiple other data providers.
 *
 * @category Data
 */
export class CompositeDataProvider implements DataProvider {
    readonly providers: ReadonlyArray<DataProviderDefinition>;

    constructor(options: CompositeDataProviderOptions) {
        const {providers} = options;
        this.providers = providers;
    }

    get factory(): Rdf.DataFactory {
        if (this.providers.length > 0) {
            return this.providers[0].provider.factory;
        } else {
            return Rdf.DefaultDataFactory;
        }
    }

    async requestWithMerge<R>(
        method: (provider: DataProvider) => Promise<R>,
        merge: (results: Array<CompositeResponse<R>>) => R
    ): Promise<R> {
        const results = await Promise.all(this.providers.map(p =>
            method(p.provider).then(r => [r, p] as const)
        ));
        const merged = merge(results);
        return merged;
    }

    knownElementTypes(params: {
        signal?: AbortSignal;
    }): Promise<ElementTypeGraph> {
        return this.requestWithMerge(p => p.knownElementTypes(params), mergeKnownElementTypes);
    }

    knownLinkTypes(params: {
        signal?: AbortSignal;
    }): Promise<LinkTypeModel[]> {
        return this.requestWithMerge(p => p.knownLinkTypes(params), mergeKnownLinkTypes);
    }

    elementTypes(params: {
        classIds: ReadonlyArray<ElementTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<ElementTypeIri, ElementTypeModel>> {
        return this.requestWithMerge(p => p.elementTypes(params), mergeElementTypes);
    }

    propertyTypes(params: {
        propertyIds: ReadonlyArray<PropertyTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<PropertyTypeIri, PropertyTypeModel>> {
        return this.requestWithMerge(p => p.propertyTypes(params), mergePropertyTypes);
    }

    linkTypes(params: {
        linkTypeIds: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<LinkTypeIri, LinkTypeModel>> {
        return this.requestWithMerge(p => p.linkTypes(params), mergeLinkTypes);
    }

    elements(params: {
        elementIds: ReadonlyArray<ElementIri>;
        signal?: AbortSignal;
    }): Promise<Map<ElementIri, ElementModel>> {
        return this.requestWithMerge(p => p.elements(params), mergeElementInfo);
    }

    links(params: {
        primary: ReadonlyArray<ElementIri>;
        secondary: ReadonlyArray<ElementIri>;
        linkTypeIds?: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<LinkModel[]> {
        return this.requestWithMerge(p => p.links(params), mergeLinksInfo);
    }

    connectedLinkStats(params: {
        elementId: ElementIri;
        inexactCount?: boolean;
        signal?: AbortSignal;
    }): Promise<DataProviderLinkCount[]> {
        return this.requestWithMerge(p => p.connectedLinkStats(params), mergeConnectedLinkStats);
    }

    lookup(params: DataProviderLookupParams): Promise<DataProviderLookupItem[]> {
        return this.requestWithMerge(p => p.lookup(params), mergeLookup);
    }
}
