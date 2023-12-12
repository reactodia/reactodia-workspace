import { raceAbortSignal } from '../../coreUtils/async';

import type * as Rdf from '../rdf/rdfModel';
import { DataProvider, LookupParams, LinkedElement } from '../provider';
import {
    ElementType, ElementTypeGraph, LinkType, ElementModel, LinkModel, LinkCount,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri, PropertyType,
} from '../model';

export interface DecoratedDataProviderOptions {
    readonly baseProvider: DataProvider;
    readonly decorator: DataProviderDecorator;
}

export type DecoratedMethodName =
    | 'knownElementTypes'
    | 'knownLinkTypes'
    | 'elementTypes'
    | 'propertyTypes'
    | 'linkTypes'
    | 'elements'
    | 'links'
    | 'connectedLinkStats'
    | 'lookup';

export type DataProviderDecorator = <P extends { signal?: AbortSignal }, R>(
    method: DecoratedMethodName,
    params: P,
    body: (params: P) => Promise<R>,
) => Promise<R>;

export class DecoratedDataProvider implements DataProvider {
    private readonly baseProvider: DataProvider;
    private readonly decorator: DataProviderDecorator;

    constructor(options: DecoratedDataProviderOptions) {
        this.baseProvider = options.baseProvider;
        this.decorator = options.decorator;
    }

    get factory(): Rdf.DataFactory {
        return this.baseProvider.factory;
    }

    private decorate<T extends DecoratedMethodName>(
        method: T,
        params: Parameters<DataProvider[T]>
    ): ReturnType<DataProvider[T]> {
        const body: (...args: any[]) => any = this.baseProvider[method];
        const bound = body.bind(this.baseProvider);
        const {decorator} = this;
        return decorator(method, params[0], bound) as ReturnType<DataProvider[T]>;
    }

    knownElementTypes(params: {
        signal?: AbortSignal;
    }): Promise<ElementTypeGraph> {
        return this.decorate('knownElementTypes', [params]);
    }

    knownLinkTypes(params: {
        signal?: AbortSignal;
    }): Promise<LinkType[]> {
        return this.decorate('knownLinkTypes', [params]);
    }

    elementTypes(params: {
        classIds: ReadonlyArray<ElementTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<ElementTypeIri, ElementType>> {
        return this.decorate('elementTypes', [params]);
    }

    propertyTypes(params: {
        propertyIds: ReadonlyArray<PropertyTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<PropertyTypeIri, PropertyType>> {
        return this.decorate('propertyTypes', [params]);
    }

    linkTypes(params: {
        linkTypeIds: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<LinkTypeIri, LinkType>> {
        return this.decorate('linkTypes', [params]);
    }

    elements(params: {
        elementIds: ReadonlyArray<ElementIri>;
        signal?: AbortSignal;
    }): Promise<Map<ElementIri, ElementModel>> {
        return this.decorate('elements', [params]);
    }

    links(params: {
        elementIds: ReadonlyArray<ElementIri>;
        linkTypeIds?: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<LinkModel[]> {
        return this.decorate('links', [params]);
    }

    connectedLinkStats(params: {
        elementId: ElementIri;
        inexactCount?: boolean;
        signal?: AbortSignal;
    }): Promise<LinkCount[]> {
        return this.decorate('connectedLinkStats', [params]);
    }

    lookup(params: LookupParams): Promise<LinkedElement[]> {
        return this.decorate('lookup', [params]);
    }
}

export function makeDelayProviderDecorator(
    meanDelay: number,
    distribution: 'constant' | 'linear' | 'exponential'
) {
    return <P extends { signal?: AbortSignal }, R>(
        method: DecoratedMethodName,
        params: P,
        body: (params: P) => Promise<R>
    ): Promise<R> => {
        const delayMs = (
            distribution === 'linear' ? Math.random() * meanDelay * 2 :
            distribution === 'exponential' ?  -Math.log(Math.random()) * meanDelay :
            meanDelay
        );
        return raceAbortSignal(delay(delayMs), params.signal)
            .then(() => body(params));
    };
}

function delay(timeoutMs: number): Promise<void> {
    return new Promise<void>(resolve => {
        setTimeout(() => resolve(undefined), timeoutMs);
    });
}
