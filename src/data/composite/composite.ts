import * as Rdf from '../rdf/rdfModel';
import { DataProvider, FilterParams, LinkedElement } from '../provider';
import {
    Dictionary, ClassModel, ClassGraphModel, LinkType, ElementModel, LinkModel, LinkCount, PropertyModel,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri,
} from '../model';
import {
    CompositeResponse,
    mergeClassTree,
    mergePropertyInfo,
    mergeClassInfo,
    mergeLinkTypesInfo,
    mergeLinkTypes,
    mergeElementInfo,
    mergeLinksInfo,
    mergeLinkTypesOf,
    mergeFilter,
} from './mergeUtils';

export interface CompositeDataProviderOptions {
    providers: ReadonlyArray<DataProviderDefinition>;
}

export interface DataProviderDefinition {
    readonly name: string;
    readonly provider: DataProvider;
}

export class CompositeDataProvider implements DataProvider {
    public providers: ReadonlyArray<DataProviderDefinition>;

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

    async classTree(params: {
        signal?: AbortSignal;
    }): Promise<ClassGraphModel> {
        return this.requestWithMerge(p => p.classTree(params), mergeClassTree);
    }

    async propertyInfo(params: {
        propertyIds: ReadonlyArray<PropertyTypeIri>;
        signal?: AbortSignal;
    }): Promise<Dictionary<PropertyModel>> {
        return this.requestWithMerge(p => p.propertyInfo(params), mergePropertyInfo);
    }

    classInfo(params: {
        classIds: ReadonlyArray<ElementTypeIri>;
        signal?: AbortSignal;
    }): Promise<ClassModel[]> {
        return this.requestWithMerge(p => p.classInfo(params), mergeClassInfo);
    }

    linkTypesInfo(params: {
        linkTypeIds: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<LinkType[]> {
        return this.requestWithMerge(p => p.linkTypesInfo(params), mergeLinkTypesInfo);
    }

    linkTypes(params: {
        signal?: AbortSignal;
    }): Promise<LinkType[]> {
        return this.requestWithMerge(p => p.linkTypes(params), mergeLinkTypes);
    }

    elementInfo(params: {
        elementIds: ReadonlyArray<ElementIri>;
        signal?: AbortSignal;
    }): Promise<Dictionary<ElementModel>> {
        return this.requestWithMerge(p => p.elementInfo(params), mergeElementInfo);
    }

    linksInfo(params: {
        elementIds: ReadonlyArray<ElementIri>;
        linkTypeIds?: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<LinkModel[]> {
        return this.requestWithMerge(p => p.linksInfo(params), mergeLinksInfo);
    }

    linkTypesOf(params: {
        elementId: ElementIri;
        signal?: AbortSignal;
    }): Promise<LinkCount[]> {
        return this.requestWithMerge(p => p.linkTypesOf(params), mergeLinkTypesOf);
    }

    filter(params: FilterParams): Promise<LinkedElement[]> {
        return this.requestWithMerge(p => p.filter(params), mergeFilter);
    }
}
