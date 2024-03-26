import * as Rdf from '../rdf/rdfModel';
import { DataProvider, LookupParams } from '../provider';
import {
    ElementTypeModel, ElementTypeGraph, LinkTypeModel, ElementModel, LinkModel, LinkCount, PropertyTypeModel,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri, LinkedElement,
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

export interface CompositeDataProviderOptions {
    providers: ReadonlyArray<DataProviderDefinition>;
}

export interface DataProviderDefinition {
    readonly name: string;
    readonly provider: DataProvider;
}

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
        elementIds: ReadonlyArray<ElementIri>;
        linkTypeIds?: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<LinkModel[]> {
        return this.requestWithMerge(p => p.links(params), mergeLinksInfo);
    }

    connectedLinkStats(params: {
        elementId: ElementIri;
        inexactCount?: boolean;
        signal?: AbortSignal;
    }): Promise<LinkCount[]> {
        return this.requestWithMerge(p => p.connectedLinkStats(params), mergeConnectedLinkStats);
    }

    lookup(params: LookupParams): Promise<LinkedElement[]> {
        return this.requestWithMerge(p => p.lookup(params), mergeLookup);
    }
}
