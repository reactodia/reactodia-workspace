import {
    ElementTypeGraph, LinkTypeModel, ElementTypeIri, ElementTypeModel, PropertyTypeIri, PropertyTypeModel,
    LinkTypeIri, ElementIri, ElementModel, LinkModel, LinkCount, LinkedElement,
} from '../model';
import { DataProvider, LookupParams } from '../provider';
import { DataFactory, DefaultDataFactory } from '../rdf/rdfModel';

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

    knownLinkTypes(params: {
        signal?: AbortSignal | undefined;
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
        elementIds: readonly ElementIri[];
        linkTypeIds?: readonly LinkTypeIri[] | undefined;
        signal?: AbortSignal | undefined;
    }): Promise<LinkModel[]> {
        return Promise.resolve([]);
    }

    connectedLinkStats(params: {
        elementId: ElementIri;
        inexactCount?: boolean | undefined;
        signal?: AbortSignal | undefined;
    }): Promise<LinkCount[]> {
        return Promise.resolve([]);
    }

    lookup(params: LookupParams): Promise<LinkedElement[]> {
        return Promise.resolve([]);
    }
}
