import * as React from 'react';

import { shallowArrayEqual } from '../coreUtils/collections';

import type { DataProvider } from '../data/dataProvider';
import type { ElementIri, ElementModel } from '../data/model';

import { EntityElement } from './dataElements';

/**
 * Result from {@link useProvidedEntities} hook.
 */
export interface UseProvidedEntitiesResult {
    /**
     * Loaded and in-progress (placeholder) entity data.
     */
    readonly data: ReadonlyMap<ElementIri, ElementModel>;
    /**
     * Load operation status.
     */
    readonly status: 'loading' | 'error' | 'completed';
    /**
     * Load operation error.
     */
    readonly error?: unknown;
}

const ENTITIES_CACHE = new WeakMap<DataProvider, CachedEntityLoader>();
const EMPTY_ENTITIES: ReadonlyMap<ElementIri, ElementModel> = new Map();

/**
 * Asynchronously loads entities data for a target set of IRIs.
 *
 * Reloads the result when either `provider` or `iris` changes.
 * When reloading on `iri` changes, previously loaded data is reused.
 *
 * @category Hooks
 */
export function useProvidedEntities(
    provider: DataProvider | undefined,
    iris: readonly ElementIri[]
): UseProvidedEntitiesResult {
    const [result, setResult] = React.useState<UseProvidedEntitiesResult>({
        data: EMPTY_ENTITIES,
        status: 'completed',
    });

    const stableIrisRef = React.useRef<readonly ElementIri[]>(iris);
    const stableIris = shallowArrayEqual(stableIrisRef.current, iris)
        ? stableIrisRef.current : iris;

    React.useEffect(() => {
        stableIrisRef.current = stableIris;

        if (!provider || stableIris.length === 0) {
            setResult({ data: EMPTY_ENTITIES, status: 'completed' });
            return;
        }

        let cache = ENTITIES_CACHE.get(provider);
        if (!cache) {
            cache = new CachedEntityLoader();
            ENTITIES_CACHE.set(provider, cache);
        }

        const entities = new Map<ElementIri, ElementModel>();
        const toRequest: ElementIri[] = [];
        for (const target of stableIris) {
            const data = cache.createEntityData(target);
            entities.set(target, data);
            if (EntityElement.isPlaceholderData(data)) {
                toRequest.push(target);
            }
        }

        const isLoading = toRequest.length > 0;
        setResult({ data: entities, status: isLoading ? 'loading' : 'completed' });

        if (isLoading) {
            const controller = new AbortController();
            cache.requestData(toRequest, { dataProvider: provider, signal: controller.signal })
                .then(
                    () => {
                        if (controller.signal.aborted) {
                            return;
                        }
                        const loadedEntities = new Map<ElementIri, ElementModel>();
                        for (const target of stableIris) {
                            loadedEntities.set(target, cache.createEntityData(target));
                        }
                        setResult({ data: loadedEntities, status: 'completed' });
                    },
                    (error) => {
                        if (controller.signal.aborted) {
                            return;
                        }
                        setResult(previous => ({ ...previous, isLoading: false, error }));
                    },
                );
            return () => controller.abort();
        }
    }, [provider, stableIris]);
    return result;
}

class CachedEntityLoader {
    private readonly cache = new Map<ElementIri, ElementModel>();

    createEntityData(target: ElementIri): ElementModel {
        let data = this.cache.get(target);
        if (!data) {
            data = EntityElement.placeholderData(target);
            this.cache.set(target, data);
        }
        return data;
    }

    async requestData(targets: readonly ElementIri[], options: {
        dataProvider: DataProvider;
        signal?: AbortSignal;
    }): Promise<void> {
        const { dataProvider, signal } = options;
        const result = await dataProvider.elements({ elementIds: targets, signal });
        for (const [target, data] of result) {
            this.cache.set(target, data);
        }
    }
}
