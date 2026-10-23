import {
    ElementTypeGraph, LinkTypeModel, ElementTypeIri, ElementTypeModel, PropertyTypeIri, PropertyTypeModel,
    LinkTypeIri, ElementIri, ElementModel, LinkModel,
} from '../model';
import {
    DataProvider, DataProviderLinkCount, DataProviderPatternSupport,
    DataProviderLookupParams, DataProviderLookupItem, LookupPattern,
} from '../dataProvider';
import { DataFactory, DefaultDataFactory } from '../rdf/rdfModel';

/**
 * Empty graph data provider, which always return nothing.
 *
 * @category Data
 */
export class EmptyDataProvider implements DataProvider {
    get factory(): DataFactory {
        return DefaultDataFactory;
    }

    knownElementTypes(params: {
        signal?: AbortSignal | undefined;
    }): Promise<ElementTypeGraph> {
        return Promise.resolve({
            elementTypes: [],
            subtypeOf: [],
        });
    }

    lookupElementTypes(params: {
        text: string;
        limit?: number;
        signal?: AbortSignal;
    }): Promise<ElementTypeModel[]> {
        return Promise.resolve([]);
    }

    lookupPropertyTypes(params: {
        text: string;
        limit?: number;
        signal?: AbortSignal;
    }): Promise<PropertyTypeModel[]> {
        return Promise.resolve([]);
    }

    lookupLinkTypes(params: {
        text: string;
        limit?: number;
        signal?: AbortSignal;
    }): Promise<LinkTypeModel[]> {
        return Promise.resolve([]);
    }

    elementTypes(params: {
        classIds: readonly ElementTypeIri[];
        signal?: AbortSignal | undefined;
    }): Promise<Map<ElementTypeIri, ElementTypeModel>> {
        return Promise.resolve(new Map<ElementTypeIri, ElementTypeModel>());
    }

    propertyTypes(params: {
        propertyIds: readonly PropertyTypeIri[];
        signal?: AbortSignal | undefined;
    }): Promise<Map<PropertyTypeIri, PropertyTypeModel>> {
        return Promise.resolve(new Map<PropertyTypeIri, PropertyTypeModel>());
    }

    linkTypes(params: {
        linkTypeIds: readonly LinkTypeIri[];
        signal?: AbortSignal | undefined;
    }): Promise<Map<LinkTypeIri, LinkTypeModel>> {
        return Promise.resolve(new Map<LinkTypeIri, LinkTypeModel>());
    }

    elements(params: {
        elementIds: readonly ElementIri[];
        signal?: AbortSignal | undefined;
    }): Promise<Map<ElementIri, ElementModel>> {
        return Promise.resolve(new Map<ElementIri, ElementModel>());
    }

    links(params: {
        primary: ReadonlyArray<ElementIri>;
        secondary: ReadonlyArray<ElementIri>;
        linkTypeIds?: readonly LinkTypeIri[] | undefined;
        signal?: AbortSignal | undefined;
    }): Promise<LinkModel[]> {
        return Promise.resolve([]);
    }

    connectedLinkStats(params: {
        elementId: ElementIri;
        inexactCount?: boolean | undefined;
        signal?: AbortSignal | undefined;
    }): Promise<DataProviderLinkCount[]> {
        return Promise.resolve([]);
    }

    supportsPattern(pattern: LookupPattern): DataProviderPatternSupport {
        return {ok: false, errors: []};
    }

    lookup(params: DataProviderLookupParams): Promise<DataProviderLookupItem[]> {
        return Promise.resolve([]);
    }
}
