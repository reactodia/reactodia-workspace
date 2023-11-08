import { raceAbortSignal } from '../../coreUtils/async';

import type * as Rdf from '../rdf/rdfModel';
import { DataProvider, FilterParams, LinkedElement } from '../provider';
import {
    Dictionary, ClassModel, ClassGraphModel, LinkType, ElementModel, LinkModel, LinkCount,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri, PropertyModel,
} from '../model';

export interface DecoratedDataProviderOptions {
    readonly baseProvider: DataProvider;
    readonly decorator: DataProviderDecorator;
}

export type DecoratedMethodName =
    | 'classTree'
    | 'classInfo'
    | 'propertyInfo'
    | 'linkTypes'
    | 'linkTypesInfo'
    | 'elementInfo'
    | 'linksInfo'
    | 'linkTypesOf'
    | 'filter';

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
        const body: Function = this[method];
        const bound = body.bind(this);
        const {decorator} = this;
        return decorator(method, params[0], bound) as ReturnType<DataProvider[T]>;
    }

    classTree(params: {
        signal?: AbortSignal;
    }): Promise<ClassGraphModel> {
        return this.decorate('classTree', [params]);
    }

    classInfo(params: {
        classIds: ReadonlyArray<ElementTypeIri>;
        signal?: AbortSignal;
    }): Promise<ClassModel[]> {
        return this.decorate('classInfo', [params]);
    }

    propertyInfo(params: {
        propertyIds: ReadonlyArray<PropertyTypeIri>;
        signal?: AbortSignal;
    }): Promise<Dictionary<PropertyModel>> {
        return this.decorate('propertyInfo', [params]);
    }

    linkTypes(params: {
        signal?: AbortSignal;
    }): Promise<LinkType[]> {
        return this.decorate('linkTypes', [params]);
    }

    linkTypesInfo(params: {
        linkTypeIds: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<LinkType[]> {
        return this.decorate('linkTypesInfo', [params]);
    }

    elementInfo(params: {
        elementIds: ReadonlyArray<ElementIri>;
        signal?: AbortSignal;
    }): Promise<Dictionary<ElementModel>> {
        return this.decorate('elementInfo', [params]);
    }

    linksInfo(params: {
        elementIds: ReadonlyArray<ElementIri>;
        linkTypeIds?: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<LinkModel[]> {
        return this.decorate('linksInfo', [params]);
    }

    linkTypesOf(params: {
        elementId: ElementIri;
        signal?: AbortSignal;
    }): Promise<LinkCount[]> {
        return this.decorate('linkTypesOf', [params]);
    }

    filter(params: FilterParams): Promise<LinkedElement[]> {
        return this.decorate('filter', [params]);
    }
}

export function randomDelayProviderDecorator<P extends { signal?: AbortSignal }, R>(
    method: DecoratedMethodName,
    params: P,
    body: (params: P) => Promise<R>
): Promise<R> {
    const MEAN_DELAY = 200;
    // simulate exponential distribution
    const delayMs = -Math.log(Math.random()) * MEAN_DELAY;
    return raceAbortSignal(delay(delayMs), params.signal)
        .then(() => body(params));
}

function delay(timeoutMs: number): Promise<void> {
    return new Promise<void>(resolve => {
        setTimeout(() => resolve(undefined), timeoutMs);
    });
}
