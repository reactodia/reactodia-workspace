import * as Rdf from '../rdf/rdfModel';
import {
    DataProvider, DataProviderLinkCount, DataProviderLookupParams, DataProviderLookupItem,
    DataProviderPatternSupport, LookupPattern,
} from '../dataProvider';
import {
    ElementTypeModel, ElementTypeGraph, LinkTypeModel, ElementModel, LinkModel, PropertyTypeModel,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri,
} from '../model';
import {
    CompositeResponse,
    mergeConnectedLinkStats,
    mergeElementInfo,
    mergeElementTypes,
    mergeIndexedElementTypes,
    mergeIndexedLinkTypes,
    mergeIndexedPropertyTypes,
    mergeKnownElementTypes,
    mergeLinksInfo,
    mergeLinkTypes,
    mergeLookup,
    mergePropertyTypes,
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
    /**
     * Property to append {@link DataProviderDefinition.origin} to entities and relations
     * originated from a nested data provider.
     * 
     * @default "urn:reactodia:sourceProvider"
     * @see {@link DataProviderDefinition.origin}
     */
    originProperty?: PropertyTypeIri;
}

/**
 * Combined data provider definition.
 *
 * @see {@link CompositeDataProvider}
 */
export interface DataProviderDefinition {
    /**
     * Provider name to assist in debugging.
     *
     * @deprecated Use {@link DataProviderDefinition.origin} instead.
     */
    readonly name?: string;
    /**
     * Data provider to combine data from.
     */
    readonly provider: DataProvider;
    /**
     * Value to append to entities and relations originated from this provider
     * on {@link CompositeDataProviderOptions.originProperty originProperty} property.
     *
     * If not specified, uses {@link DataProviderDefinition.name} literal unless
     * explicitly disabled by using `null`.
     */
    readonly origin?: Rdf.NamedNode | Rdf.Literal | null;
}

const DEFAULT_ORIGIN_PROPERTY = 'urn:reactodia:sourceProvider';

/**
 * Provides graph data by combining results from multiple other data providers.
 *
 * @category Data
 */
export class CompositeDataProvider implements DataProvider {
    readonly providers: ReadonlyArray<DataProviderDefinition>;

    private readonly originProperty: PropertyTypeIri;

    constructor(options: CompositeDataProviderOptions) {
        const {providers, originProperty} = options;
        this.providers = providers;
        this.originProperty = originProperty ?? DEFAULT_ORIGIN_PROPERTY;
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

    lookupElementTypes(params: {
        text: string;
        limit?: number;
        signal?: AbortSignal;
    }): Promise<ElementTypeModel[]> {
        return this.requestWithMerge(p => p.lookupElementTypes(params), mergeElementTypes);
    }

    lookupPropertyTypes(params: {
        text: string;
        limit?: number;
        signal?: AbortSignal;
    }): Promise<PropertyTypeModel[]> {
        return this.requestWithMerge(p => p.lookupPropertyTypes(params), mergePropertyTypes);
    }

    lookupLinkTypes(params: {
        text: string;
        limit?: number;
        signal?: AbortSignal;
    }): Promise<LinkTypeModel[]> {
        return this.requestWithMerge(p => p.lookupLinkTypes(params), mergeLinkTypes);
    }

    elementTypes(params: {
        classIds: ReadonlyArray<ElementTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<ElementTypeIri, ElementTypeModel>> {
        return this.requestWithMerge(p => p.elementTypes(params), mergeIndexedElementTypes);
    }

    propertyTypes(params: {
        propertyIds: ReadonlyArray<PropertyTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<PropertyTypeIri, PropertyTypeModel>> {
        return this.requestWithMerge(p => p.propertyTypes(params), mergeIndexedPropertyTypes);
    }

    linkTypes(params: {
        linkTypeIds: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<LinkTypeIri, LinkTypeModel>> {
        return this.requestWithMerge(p => p.linkTypes(params), mergeIndexedLinkTypes);
    }

    elements(params: {
        elementIds: ReadonlyArray<ElementIri>;
        signal?: AbortSignal;
    }): Promise<Map<ElementIri, ElementModel>> {
        return this.requestWithMerge(
            p => p.elements(params),
            results => mergeElementInfo(results, this.originProperty)
        );
    }

    links(params: {
        primary: ReadonlyArray<ElementIri>;
        secondary: ReadonlyArray<ElementIri>;
        linkTypeIds?: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<LinkModel[]> {
        return this.requestWithMerge(
            p => p.links(params),
            results => mergeLinksInfo(results, this.originProperty)
        );
    }

    connectedLinkStats(params: {
        elementId: ElementIri;
        inexactCount?: boolean;
        signal?: AbortSignal;
    }): Promise<DataProviderLinkCount[]> {
        return this.requestWithMerge(p => p.connectedLinkStats(params), mergeConnectedLinkStats);
    }

    supportsPattern(pattern: LookupPattern): DataProviderPatternSupport {
        if (this.providers.length === 0) {
            return {ok: true, errors: []};
        }
        const errors: string[] = [];
        for (const {provider} of this.providers) {
            const result = provider.supportsPattern(pattern);
            if (result.ok) {
                return {ok: true, errors: []};
            }
            for (const error of result.errors) {
                errors.push(error);
            }
        }
        return {ok: false, errors};
    }

    lookup(params: DataProviderLookupParams): Promise<DataProviderLookupItem[]> {
        return this.requestWithMerge(
            p => p.lookup(params),
            results => mergeLookup(results, this.originProperty)
        );
    }
}
