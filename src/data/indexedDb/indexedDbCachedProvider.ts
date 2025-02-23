import { AsyncLock } from '../../coreUtils/async';
import { multimapAdd } from '../../coreUtils/collections';
import type * as Rdf from '../rdf/rdfModel';
import {
    ElementTypeGraph, LinkTypeModel, ElementTypeIri, ElementTypeModel, PropertyTypeIri,
    PropertyTypeModel, LinkTypeIri, ElementIri, ElementModel, LinkModel,
} from '../model';
import {
    DataProvider, DataProviderLinkCount, DataProviderLookupParams, DataProviderLookupItem,
} from '../provider';

import { AdjacencyRange, AdjacencyBlock, subtractAdjacencyBlocks, hashAdjacencyRange } from './adjacencyBlocks';
import { Sha256 } from './sha256';

/**
 * Options for {@link IndexedDbCachedProvider}.
 *
 * @see {@link IndexedDbCachedProvider}
 */
export interface IndexedDbCachedProviderOptions {
    /**
     * Base data provider to cache request results for.
     */
    readonly baseProvider: DataProvider;
    /**
     * `IndexedDB` database name to store cached data.
     */
    readonly dbName: string;
    /**
     * Whether to cache missing results from the following {@link DataProvider} methods:
     *  - {@link DataProvider.elements elements()}
     *  - {@link DataProvider.elementTypes elementTypes()}
     *  - {@link DataProvider.linkTypes linkTypes()}
     *  - {@link DataProvider.propertyTypes propertyTypes()}
     *
     * @default true
     */
    readonly cacheMissing?: boolean;
    /**
     * Whether to cache results from {@link DataProvider.links}.
     *
     * If enabled, stores and updates a partial "mirror" of a previously-requested
     * graph links from previous requests to partially or fully return cached ones.
     *
     * @default true
     */
    readonly cacheLinks?: boolean;
    /**
     * Whether to cache results from {@link DataProvider.lookup} with
     * {@link DataProviderLookupParams.text text} requests.
     *
     * @default false
     */
    readonly cacheTextLookups?: boolean;
    /**
     * Signal to close [IndexedDB database](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
     * and dispose the provider.
     */
    readonly closeSignal: AbortSignal;
}

const enum ObjectStore {
    knownElementTypes = 'knownElementTypes',
    knownLinkTypes = 'knownLinkTypes',
    elementTypes = 'elementTypes',
    linkTypes = 'linkTypes',
    propertyTypes = 'propertyTypes',
    elements = 'elements',
    links = 'links',
    linkBlocks = 'linkBlocks',
    linkRanges = 'linkRanges',
    connectedLinkStats = 'connectedLinkStats',
    lookup = 'lookup',
}

const enum ObjectStoreIndex {
    linkBySourceTarget = 'bySourceTarget',
    linkBlockByRangeKey = 'byRangeKey',
}

const MISSING_RECORD_KEY = '__missing';
interface MissingRecord<K extends string> {
    readonly id: K;
    readonly [MISSING_RECORD_KEY]: boolean;
}

const KNOWN_ELEMENT_TYPES_KEY = 'knownElementTypes';
interface KnownElementTypesRecord {
    readonly id: typeof KNOWN_ELEMENT_TYPES_KEY;
    readonly value: ElementTypeGraph;
}

const KNOWN_LINK_TYPES_KEY = 'knownLinkTypes';
interface KnownLinkTypesRecord {
    readonly id: typeof KNOWN_LINK_TYPES_KEY;
    readonly value: LinkTypeModel[];
}

type LinkRecordKey = [ElementIri, ElementIri];
interface LinkRecord extends LinkModel {
    __id: number;
}
type LinkRangeKey = string & { readonly linkRangeKeyBrand: void };
interface LinkBlockRecord {
    readonly endpoint: ElementIri;
    readonly connectedRange: LinkRangeKey;
}
type LinkBlock = AdjacencyBlock<ElementIri>;
interface LinkRanges {
    readonly endpoints: ReadonlySet<ElementIri>;
    readonly rangeByEndpoint: ReadonlyMap<ElementIri, LinkRangeKey>;
    readonly rangeByKey: ReadonlyMap<LinkRangeKey, AdjacencyRange<ElementIri>>;
}

type ConnectedLinkStatsKey = [elementId: ElementIri, inexactCount: 0 | 1];
interface ConnectedLinkStatsRecord {
    readonly elementId: ElementIri;
    readonly inexactCount: 0 | 1;
    readonly stats: DataProviderLinkCount[];
}

type LookupLinkDirectionKey = 'in' | 'out' | '';
type LookupKey = [ElementTypeIri, ElementIri, LinkTypeIri, LookupLinkDirectionKey, string, string];
const LOOKUP_KEY_PROPERTIES: Array<keyof LookupRecord> = [
    'elementType',
    'element',
    'link',
    'direction',
    'text',
    'limit',
];
interface LookupRecord {
    readonly elementType: ElementTypeIri;
    readonly element: ElementIri;
    readonly link: LinkTypeIri;
    readonly direction: LookupLinkDirectionKey;
    readonly text: string;
    readonly limit: string;
    readonly result: DataProviderLookupItem[];
}

/**
 * Caches graph data returned from another data provider using
 * [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) storage.
 *
 * @category Data
 */
export class IndexedDbCachedProvider implements DataProvider {
    static readonly DB_VERSION = 3;

    private readonly hasher = new Sha256();

    private readonly baseProvider: DataProvider;
    private readonly dbName: string;
    private readonly cacheMissing: boolean;
    private readonly cacheLinks: boolean;
    private readonly cacheTextLookups: boolean;
    private readonly linkLock = new AsyncLock();
    private readonly closeSignal: AbortSignal;

    private openedDb: Promise<IDBDatabase> | undefined;
    private deleteRequest: Promise<void> | undefined;

    constructor(options: IndexedDbCachedProviderOptions) {
        this.baseProvider = options.baseProvider;
        this.dbName = options.dbName;
        this.cacheMissing = options.cacheMissing ?? true;
        this.cacheLinks = options.cacheLinks ?? true;
        this.cacheTextLookups = options.cacheTextLookups ?? false;
        this.closeSignal = options.closeSignal;
        this.closeSignal.addEventListener('abort', this.onClose);
    }

    get factory(): Rdf.DataFactory {
        return this.baseProvider.factory;
    }

    clearCache(): Promise<void> {
        this.deleteRequest = this.deleteDatabase();
        return this.deleteRequest;
    }

    private async deleteDatabase(): Promise<void> {
        await this.closeDatabase();
        await indexedDbRequestAsPromise(indexedDB.deleteDatabase(this.dbName));
    }

    private async openDb(): Promise<IDBDatabase> {
        if (this.deleteRequest) {
            await this.deleteRequest.catch(() => {
                /* clear errors will be handled by the original caller */
            });
        }
        if (!this.openedDb) {
            this.openedDb = new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(this.dbName, IndexedDbCachedProvider.DB_VERSION);
                request.onupgradeneeded = e => {
                    const db = request.result;
                    if (e.newVersion !== e.oldVersion) {
                        for (const storeName of db.objectStoreNames) {
                            db.deleteObjectStore(storeName);
                        }
                    }

                    if (!db.objectStoreNames.contains(ObjectStore.knownElementTypes)) {
                        db.createObjectStore(ObjectStore.knownElementTypes, {
                            keyPath: 'id',
                        });
                    }
                    if (!db.objectStoreNames.contains(ObjectStore.knownLinkTypes)) {
                        db.createObjectStore(ObjectStore.knownLinkTypes, {
                            keyPath: 'id',
                        });
                    }
                    if (!db.objectStoreNames.contains(ObjectStore.elementTypes)) {
                        const keyPath: keyof ElementTypeModel = 'id';
                        db.createObjectStore(ObjectStore.elementTypes, {keyPath});
                    }
                    if (!db.objectStoreNames.contains(ObjectStore.linkTypes)) {
                        const keyPath: keyof LinkTypeModel = 'id';
                        db.createObjectStore(ObjectStore.linkTypes, {keyPath});
                    }
                    if (!db.objectStoreNames.contains(ObjectStore.propertyTypes)) {
                        const keyPath: keyof PropertyTypeModel = 'id';
                        db.createObjectStore(ObjectStore.propertyTypes, {keyPath});
                    }
                    if (!db.objectStoreNames.contains(ObjectStore.elements)) {
                        const keyPath: keyof ElementModel = 'id';
                        db.createObjectStore(ObjectStore.elements, {keyPath});
                    }
                    if (!db.objectStoreNames.contains(ObjectStore.links)) {
                        const keyPath: keyof LinkRecord = '__id';
                        const store = db.createObjectStore(ObjectStore.links, {
                            keyPath,
                            autoIncrement: true,
                        });
                        const bySourceTargetKeyPath: Array<keyof LinkRecord> = ['sourceId', 'targetId'];
                        store.createIndex(ObjectStoreIndex.linkBySourceTarget, bySourceTargetKeyPath);
                    }
                    if (!db.objectStoreNames.contains(ObjectStore.linkBlocks)) {
                        const keyPath: keyof LinkBlockRecord = 'endpoint';
                        const store = db.createObjectStore(ObjectStore.linkBlocks, {keyPath});
                        const byRangeKeyPath: keyof LinkBlockRecord = 'connectedRange';
                        store.createIndex(ObjectStoreIndex.linkBlockByRangeKey, byRangeKeyPath);
                    }
                    if (!db.objectStoreNames.contains(ObjectStore.linkRanges)) {
                        db.createObjectStore(ObjectStore.linkRanges);
                    }
                    if (!db.objectStoreNames.contains(ObjectStore.connectedLinkStats)) {
                        const keyPath: Array<keyof ConnectedLinkStatsRecord> = ['elementId', 'inexactCount'];
                        db.createObjectStore(ObjectStore.connectedLinkStats, {keyPath});
                    }
                    if (!db.objectStoreNames.contains(ObjectStore.lookup)) {
                        db.createObjectStore(ObjectStore.lookup, {
                            keyPath: LOOKUP_KEY_PROPERTIES,
                        });
                    }
                };
                request.onblocked = e => {
                    reject(new Error(
                        'IndexedDB is blocked from upgrade due to being opened at another browser tab'
                    ));
                };
                request.onsuccess = e => {
                    const db = request.result;
                    resolve(db);
                };
                request.onerror = e => {
                    reject(request.error);
                };
            });
        }
        return this.openedDb;
    }

    private onClose = async () => {
        this.closeSignal.removeEventListener('abort', this.onClose);
        this.closeDatabase();
    };

    private async closeDatabase(): Promise<void> {
        if (this.openedDb) {
            const db = await this.openedDb;
            db.close();
            this.openedDb = undefined;
        }
    }

    async knownElementTypes(params: { signal?: AbortSignal | undefined; }): Promise<ElementTypeGraph> {
        const db = await this.openDb();
        const result = await fetchSingleWithDbCache(
            db,
            ObjectStore.knownElementTypes,
            KNOWN_ELEMENT_TYPES_KEY,
            async (key): Promise<KnownElementTypesRecord> => ({
                id: key,
                value: await this.baseProvider.knownElementTypes(params),
            })
        );
        rehydrateLabels(result.value.elementTypes.values(), this.factory);
        return result.value;
    }

    async knownLinkTypes(params: { signal?: AbortSignal | undefined; }): Promise<LinkTypeModel[]> {
        const db = await this.openDb();
        const result = await fetchSingleWithDbCache(
            db,
            ObjectStore.knownLinkTypes,
            KNOWN_LINK_TYPES_KEY,
            async (key): Promise<KnownLinkTypesRecord> => ({
                id: key,
                value: await this.baseProvider.knownLinkTypes(params),
            })
        );
        rehydrateLabels(result.value.values(), this.factory);
        return result.value;
    }

    async elementTypes(params: {
        classIds: readonly ElementTypeIri[];
        signal?: AbortSignal | undefined;
    }): Promise<Map<ElementTypeIri, ElementTypeModel>> {
        const {classIds, signal} = params;
        const db = await this.openDb();
        const result = await fetchManyWithDbCache(
            db,
            ObjectStore.elementTypes,
            classIds,
            this.cacheMissing,
            async ids => await this.baseProvider.elementTypes({classIds: ids, signal}),
        );
        rehydrateLabels(result.values(), this.factory);
        return result;
    }

    async propertyTypes(params: {
        propertyIds: readonly PropertyTypeIri[];
        signal?: AbortSignal | undefined;
    }): Promise<Map<PropertyTypeIri, PropertyTypeModel>> {
        const {propertyIds, signal} = params;
        const db = await this.openDb();
        const result = await fetchManyWithDbCache(
            db,
            ObjectStore.propertyTypes,
            propertyIds,
            this.cacheMissing,
            async ids => await this.baseProvider.propertyTypes({propertyIds: ids, signal}),
        );
        rehydrateLabels(result.values(), this.factory);
        return result;
    }

    async linkTypes(params: {
        linkTypeIds: readonly LinkTypeIri[];
        signal?: AbortSignal | undefined;
    }): Promise<Map<LinkTypeIri, LinkTypeModel>> {
        const {linkTypeIds, signal} = params;
        const db = await this.openDb();
        const result = await fetchManyWithDbCache(
            db,
            ObjectStore.linkTypes,
            linkTypeIds,
            this.cacheMissing,
            async ids => await this.baseProvider.linkTypes({linkTypeIds: ids, signal}),
        );
        rehydrateLabels(result.values(), this.factory);
        return result;
    }

    async elements(params: {
        elementIds: readonly ElementIri[];
        signal?: AbortSignal | undefined;
    }): Promise<Map<ElementIri, ElementModel>> {
        const {elementIds, signal} = params;
        const db = await this.openDb();
        const result = await fetchManyWithDbCache(
            db,
            ObjectStore.elements,
            elementIds,
            this.cacheMissing,
            async ids => await this.baseProvider.elements({elementIds: ids, signal}),
        );
        rehydrateLabels(result.values(), this.factory);
        rehydrateProperties(result.values(), this.factory);
        return result;
    }

    async links(params: {
        primary: ReadonlyArray<ElementIri>;
        secondary: ReadonlyArray<ElementIri>;
        linkTypeIds?: readonly LinkTypeIri[] | undefined;
        signal?: AbortSignal | undefined;
    }): Promise<LinkModel[]> {
        if (!this.cacheLinks) {
            return this.baseProvider.links(params);
        }

        if (params.primary.length === 0 || params.secondary.length === 0) {
            return [];
        }

        const db = await this.openDb();

        const orderedPrimary = [...params.primary].sort();
        const orderedSecondary = [...params.secondary].sort();
        const request: LinkBlock = {
            sources: new Set(orderedPrimary),
            targets: new Set(orderedSecondary),
        };

        const lock = await this.linkLock.acquire();
        try {
            const ranges = await this.readLinkRanges(db, request);
            const blocks = await this.selectMissingLinkBlocks(request, ranges);
            if (blocks.length > 0) {
                await this.fetchAndCacheLinks(db, blocks, params.signal);
                await this.updateLinkRanges(db, ranges, request);
            }
        } finally {
            await lock.release();
        }

        const links: LinkModel[] = [];
        const onlyTypeIds = params.linkTypeIds ? new Set(params.linkTypeIds) : undefined;
        await this.readLinksFromCache(
            db, orderedPrimary, orderedSecondary,
            link => {
                if (!onlyTypeIds || onlyTypeIds.has(link.linkTypeId)) {
                    links.push(link);
                }
            }
        );

        const nonSelfPrimary = orderedPrimary.filter(element => !request.targets.has(element));
        await this.readLinksFromCache(
            db, orderedSecondary, nonSelfPrimary,
            link => {
                if ((!onlyTypeIds || onlyTypeIds.has(link.linkTypeId))) {
                    links.push(link);
                }
            }
        );

        rehydrateProperties(links, this.factory);
        return links;
    }

    private async readLinkRanges(
        db: IDBDatabase,
        request: LinkBlock
    ): Promise<LinkRanges> {
        const tx = db.transaction(
            [ObjectStore.linkBlocks, ObjectStore.linkRanges],
            'readonly'
        );

        try {
            const blockStore = tx.objectStore(ObjectStore.linkBlocks);
            const rangeStore = tx.objectStore(ObjectStore.linkRanges);

            const endpoints = new Set(request.sources);
            for (const target of request.targets) {
                endpoints.add(target);
            }

            const rangeByEndpoint = new Map<ElementIri, LinkRangeKey>();
            await indexedDbGetMany(blockStore, Array.from(endpoints), value => {
                const block = value as LinkBlockRecord | undefined;
                if (block) {
                    rangeByEndpoint.set(block.endpoint, block.connectedRange);
                }
            });

            const uniqueRangeKeys = new Set(rangeByEndpoint.values());
            const rangeByKey = new Map<LinkRangeKey, AdjacencyRange<ElementIri>>();
            await indexedDbGetMany(rangeStore, Array.from(uniqueRangeKeys), (value, key) => {
                const range = value as AdjacencyRange<ElementIri> | undefined;
                if (range) {
                    rangeByKey.set(key, range);
                }
            });

            tx.commit();

            return {endpoints, rangeByEndpoint, rangeByKey};
        } catch (err) {
            indexedDbSilentAbort(tx);
            throw new Error('Failed to read link ranges for an update', {cause: err});
        }
    }

    private selectMissingLinkBlocks(
        request: LinkBlock,
        ranges: LinkRanges
    ): LinkBlock[] {
        // Determine a set of intersected target ranges
        const rangeToSources = new Map<LinkRangeKey, Set<ElementIri>>();
        for (const source of request.sources) {
            const range = ranges.rangeByEndpoint.get(source);
            if (range) {
                multimapAdd(rangeToSources, range, source);
            }
        }

        // Fetch target ranges to form intersected blocks
        const intersectedRanges = Array.from(rangeToSources.keys()).sort();
        const blocks: LinkBlock[] = [];
        for (const rangeKey of intersectedRanges) {
            const sources = rangeToSources.get(rangeKey);
            const targets = ranges.rangeByKey.get(rangeKey);
            if (sources && targets) {
                blocks.push({sources, targets});
            }
        }

        // Compute missing parts for each block
        return subtractAdjacencyBlocks(request, blocks);
    }

    private async fetchAndCacheLinks(
        db: IDBDatabase,
        blocks: ReadonlyArray<LinkBlock>,
        signal: AbortSignal | undefined
    ): Promise<void> {
        const serializedLinks: LinkModel[] = [];
        await Promise.all(blocks.map(async block => {
            const links = await this.baseProvider.links({
                primary: Array.from(block.sources),
                secondary: Array.from(block.targets),
                signal: signal,
            });
            for (const link of links) {
                serializedLinks.push(serializeForDb(link));
            }
        }));

        signal?.throwIfAborted();

        const tx = db.transaction(ObjectStore.links, 'readwrite');
        try {
            const linkStore = tx.objectStore(ObjectStore.links);
            await indexedDbPutMany(linkStore, serializedLinks);
            tx.commit();
        } catch (err) {
            indexedDbSilentAbort(tx);
            throw new Error(
                'Failed to fetch and cache missing links from base provider',
                {cause: err}
            );
        }
    }

    private async updateLinkRanges(
        db: IDBDatabase,
        ranges: LinkRanges,
        update: AdjacencyBlock<ElementIri>
    ): Promise<void> {
        interface RangeHashRequest {
            readonly before?: AdjacencyRange<ElementIri> | undefined;
            readonly items: ReadonlySet<ElementIri>;
            computedHash?: LinkRangeKey;
        }

        const fullBothRequest: RangeHashRequest = {items: ranges.endpoints};
        const fullSourcesRequest: RangeHashRequest = {items: update.sources};
        const fullTargetsRequest: RangeHashRequest = {items: update.targets};

        const bothRequests = new Map<LinkRangeKey, RangeHashRequest>();
        const sourceRequests = new Map<LinkRangeKey, RangeHashRequest>();
        const targetRequests = new Map<LinkRangeKey, RangeHashRequest>();

        for (const [endpoint, rangeKey] of ranges.rangeByEndpoint) {
            if (update.sources.has(endpoint) && update.targets.has(endpoint)) {
                if (!bothRequests.has(rangeKey)) {
                    const before = ranges.rangeByKey.get(rangeKey);
                    const items = new Set(before);
                    for (const source of update.sources) {
                        items.add(source);
                    }
                    for (const target of update.targets) {
                        items.add(target);
                    }
                    bothRequests.set(rangeKey, {before, items});
                }
            } else if (update.sources.has(endpoint)) {
                if (!sourceRequests.has(rangeKey)) {
                    const before = ranges.rangeByKey.get(rangeKey);
                    const items = new Set(before);
                    for (const target of update.targets) {
                        items.add(target);
                    }
                    sourceRequests.set(rangeKey, {before, items});
                }
            } else if (update.targets.has(endpoint)) {
                if (!targetRequests.has(rangeKey)) {
                    const before = ranges.rangeByKey.get(rangeKey);
                    const items = new Set(before);
                    for (const source of update.sources) {
                        items.add(source);
                    }
                    targetRequests.set(rangeKey, {before, items});
                }
            }
        }

        const requests: RangeHashRequest[] = [fullBothRequest, fullSourcesRequest, fullTargetsRequest];
        for (const requestMap of [bothRequests, sourceRequests, targetRequests]) {
            for (const request of requestMap.values()) {
                if (request.items.size > (request.before?.size ?? 0)) {
                    requests.push(request);
                }
            }
        }

        for (const request of requests) {
            request.computedHash = hashAdjacencyRange(request.items, this.hasher) as LinkRangeKey;
        }

        const tx = db.transaction(
            [ObjectStore.linkBlocks, ObjectStore.linkRanges],
            'readwrite'
        );

        try {
            const blockStore = tx.objectStore(ObjectStore.linkBlocks);
            const rangeStore = tx.objectStore(ObjectStore.linkRanges);

            const updatedBlocks: LinkBlockRecord[] = [];
            const addedRanges = new Map<LinkRangeKey, RangeHashRequest>();

            for (const endpoint of ranges.endpoints) {
                const rangeKey = ranges.rangeByEndpoint.get(endpoint);

                let request: RangeHashRequest | undefined;
                if (update.sources.has(endpoint) && update.targets.has(endpoint)) {
                    request = rangeKey ? bothRequests.get(rangeKey) : fullBothRequest;
                } else if (update.sources.has(endpoint)) {
                    request = rangeKey ? sourceRequests.get(rangeKey) : fullTargetsRequest;
                } else if (update.targets.has(endpoint)) {
                    request = rangeKey ? targetRequests.get(rangeKey) : fullSourcesRequest;
                }

                if (request?.computedHash) {
                    updatedBlocks.push({
                        endpoint,
                        connectedRange: request.computedHash,
                    });
                    if (!ranges.rangeByKey.has(request.computedHash)) {
                        addedRanges.set(request.computedHash, request);
                    }
                }
            }

            // Store added ranges (OK to override due to being keyed by content hash)
            await indexedDbPutMany(
                rangeStore,
                Array.from(addedRanges.values()),
                request => [request.computedHash!, request.items]
            );

            // Update ranges for intersected blocks
            await indexedDbPutMany(blockStore, updatedBlocks);

            // Cleanup no longer used ranges
            const changedRangeSet = new Set<LinkRangeKey>();
            for (const block of updatedBlocks) {
                const beforeKey = ranges.rangeByEndpoint.get(block.endpoint);
                if (beforeKey) {
                    changedRangeSet.add(beforeKey);
                }
            }

            const blockByRange = blockStore.index(ObjectStoreIndex.linkBlockByRangeKey);
            const changedRanges = Array.from(changedRangeSet);
            const foundRanges = new Set<LinkRangeKey>();
            await indexedDbGetMany(blockByRange, changedRanges, (value, key) => {
                if (value) {
                    foundRanges.add(key);
                }
            });
            await indexedDbDeleteMany(
                rangeStore,
                changedRanges.filter(key => !foundRanges.has(key))
            );

            tx.commit();
        } catch (err) {
            indexedDbSilentAbort(tx);
            throw new Error('Failed to update cached link blocks', {cause: err});
        }
    }

    private async readLinksFromCache(
        db: IDBDatabase,
        orderedSources: ReadonlyArray<ElementIri>,
        orderedTargets: ReadonlyArray<ElementIri>,
        onLink: (link: LinkModel) => void
    ): Promise<void> {
        const tx = db.transaction(ObjectStore.links, 'readonly');
        try {
            const linkStore = tx.objectStore(ObjectStore.links);
            const linkBySourceTarget = linkStore.index(ObjectStoreIndex.linkBySourceTarget);

            // Process all links from a mirror store
            await indexedDbScanOrderedArea2D(
                linkBySourceTarget,
                orderedSources,
                orderedTargets,
                cursor => {
                    const {__id, ...link} = cursor.value as LinkRecord;
                    onLink(link);
                }
            );

            tx.commit();
        } catch (err) {
            indexedDbSilentAbort(tx);
            throw new Error('Failed to read links from cache', {cause: err});
        }
    }

    async connectedLinkStats(params: {
        elementId: ElementIri;
        inexactCount?: boolean;
        signal?: AbortSignal | undefined;
    }): Promise<DataProviderLinkCount[]> {
        const {signal} = params;
        const db = await this.openDb();
        const key: ConnectedLinkStatsKey = [
            params.elementId,
            params.inexactCount ? 1 : 0,
        ];
        const result = await fetchSingleWithDbCache(
            db,
            ObjectStore.connectedLinkStats,
            key,
            async ([elementId, inexactCount]): Promise<ConnectedLinkStatsRecord> => ({
                elementId,
                inexactCount,
                stats: await this.baseProvider.connectedLinkStats({
                    elementId,
                    inexactCount: Boolean(inexactCount),
                    signal
                }),
            })
        );
        return result.stats;
    }

    async lookup(params: DataProviderLookupParams): Promise<DataProviderLookupItem[]> {
        if (!this.cacheTextLookups && params.text !== undefined) {
            return this.baseProvider.lookup(params);
        }
        const key: LookupKey = [
            params.elementTypeId ?? '',
            params.refElementId ?? '',
            params.refElementLinkId ?? '',
            params.linkDirection ?? '',
            params.text ?? '',
            (
                params.limit === undefined ? '' :
                params.limit === null ? 'null' :
                String(params.limit)
            )
        ];
        const db = await this.openDb();
        const record = await fetchSingleWithDbCache(
            db,
            ObjectStore.lookup,
            key,
            async ([
                elementType,
                element,
                link,
                direction,
                text,
                limit,
            ]): Promise<LookupRecord> => ({
                elementType,
                element,
                link,
                direction,
                text,
                limit,
                result: await this.baseProvider.lookup(params),
            })
        );
        const elements = record.result.map(el => el.element);
        rehydrateLabels(elements, this.factory);
        rehydrateProperties(elements, this.factory);
        return record.result;
    }
}

async function fetchSingleWithDbCache<K extends IDBValidKey, V>(
    db: IDBDatabase,
    storeName: string,
    key: K,
    fetchBase: (key: K) => Promise<V>
): Promise<V> {
    {
        const readTx = db.transaction(storeName, 'readonly');
        const readStore = readTx.objectStore(storeName);
        const cached: V | undefined = await indexedDbRequestAsPromise(
            readStore.get(key)
        );
        readTx.commit();
        if (cached) {
            return cached;
        }
    }

    const fetched = serializeForDb(await fetchBase(key));
    const writeTx = db.transaction(storeName, 'readwrite');
    const writeStore = writeTx.objectStore(storeName);
    await indexedDbRequestAsPromise(writeStore.put(fetched));
    writeTx.commit();
    return fetched;
}

async function fetchManyWithDbCache<K extends string, V extends { readonly id: K }>(
    db: IDBDatabase,
    storeName: string,
    keys: ReadonlyArray<K>,
    cacheMissing: boolean,
    fetchBase: (keys: ReadonlyArray<K>) => Promise<Map<K, V>>
): Promise<Map<K, V>> {
    const result = new Map<K, V>();
    const missingKeys: K[] = [];

    if (keys.length > 0) {
        const readTx = db.transaction(storeName, 'readonly');
        const readStore = readTx.objectStore(storeName);
        await indexedDbGetMany(
            readStore,
            keys,
            (value, classId) => {
                const model = value as V | undefined;
                if (model) {
                    if (isMissingRecord(model)) {
                        if (!cacheMissing) {
                            missingKeys.push(classId);
                        }
                    } else {
                        result.set(classId, model);
                    }
                } else {
                    missingKeys.push(classId);
                }
            }
        );
        readTx.commit();
    }

    if (missingKeys.length > 0) {
        const fetched = await fetchBase(missingKeys);
        const stored: Array<V | MissingRecord<K>> = [];
        for (const key of missingKeys) {
            if (fetched.has(key)) {
                const value = fetched.get(key)!;
                const serialized = serializeForDb(value);
                result.set(key, serialized);
                stored.push(serialized);
            } else {
                stored.push({id: key, [MISSING_RECORD_KEY]: true});
            }
        }
        const writeTx = db.transaction(storeName, 'readwrite');
        const writeStore = writeTx.objectStore(storeName);
        await indexedDbPutMany(writeStore, stored);
        writeTx.commit();
    }

    return result;
}

function indexedDbRequestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function indexedDbGetMany<K extends IDBValidKey>(
    store: IDBObjectStore | IDBIndex,
    keys: ReadonlyArray<K>,
    onGet: (value: unknown, key: K) => void
): Promise<void> {
    if (keys.length === 0) {
        return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
        let resolvedCount = 0;
        let rejected = false;
        for (const key of keys) {
            const request = store.get(key);
            request.onsuccess = () => {
                if (rejected) {
                    return;
                }
                resolvedCount++;
                try {
                    onGet(request.result, key);
                } catch (err) {
                    rejected = true;
                    reject(err);
                }
                if (resolvedCount === keys.length) {
                    resolve();
                }
            };
            request.onerror = () => {
                rejected = true;
                reject(request.error);
            };
        }
    });
}

function indexedDbPutMany<T>(
    store: IDBObjectStore,
    items: ReadonlyArray<T>,
    asKeyValue?: (value: T) => readonly [IDBValidKey, unknown]
): Promise<IDBValidKey[]> {
    if (items.length === 0) {
        return Promise.resolve([]);
    }
    return new Promise<IDBValidKey[]>((resolve, reject) => {
        const addedKeys: IDBValidKey[] = [];
        let rejected = false;
        for (const item of items) {
            let request: IDBRequest<IDBValidKey>;
            if (asKeyValue) {
                const [key, value] = asKeyValue(item);
                request = store.put(value, key);
            } else {
                request = store.put(item);
            }
            request.onsuccess = () => {
                if (rejected) {
                    return;
                }
                addedKeys.push(request.result);
                if (addedKeys.length === items.length) {
                    resolve(addedKeys);
                }
            };
            request.onerror = () => {
                rejected = true;
                reject(request.error);
            };
        }
    });
}

function indexedDbDeleteMany<K extends IDBValidKey>(
    store: IDBObjectStore,
    keys: ReadonlyArray<K>
): Promise<void> {
    if (keys.length === 0) {
        return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
        let deletedCount = 0;
        let rejected = false;
        for (const key of keys) {
            const request = store.delete(key);
            request.onsuccess = () => {
                if (rejected) {
                    return;
                }
                deletedCount++;
                if (deletedCount === keys.length) {
                    resolve();
                }
            };
            request.onerror = () => {
                rejected = true;
                reject(request.error);
            };
        }
    });
}

// Inspired by "Indexed DB - N-Dimensional Selection"
// https://gist.github.com/inexorabletash/704e9688f99ac12dd336
function indexedDbScanOrderedArea2D<K extends string>(
    store: IDBObjectStore | IDBIndex,
    first: ReadonlyArray<K>,
    second: ReadonlyArray<K>,
    scanner: (cursor: IDBCursorWithValue) => void
): Promise<void> {
    if (first.length === 0 || second.length === 0) {
        return Promise.resolve();
    }

    const range = IDBKeyRange.bound(
        [first[0], second[0]],
        [first[first.length - 1], second[second.length - 1]]
    );
    let i = 0;
    let j = 0;

    return indexedDbScan(store, range, cursor => {
        const [firstKey, secondKey] = cursor.key as [K, K];

        nextLeft: while (true) {
            while (i < first.length && indexedDB.cmp(first[i], firstKey) < 0) {
                i++;
                j = 0;
            }
            if (i >= first.length) {
                return;
            }

            if (indexedDB.cmp(first[i], firstKey) > 0) {
                cursor.continue([first[i], second[0]]);
                return;
            }

            while (j < second.length && indexedDB.cmp(second[j], secondKey) < 0) {
                j++;
            }
            if (j >= second.length) {
                j = 0;
                i++;
                continue nextLeft;
            }

            if (indexedDB.cmp(second[j], secondKey) > 0) {
                cursor.continue([first[i], second[j]]);
                return;
            }

            // Found the the key [left[i], right[j]]
            scanner(cursor);
            cursor.continue();
            return;
        }
    });
}

function indexedDbScan(
    store: IDBObjectStore | IDBIndex,
    query: IDBKeyRange,
    scanner: (cursor: IDBCursorWithValue) => void
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const request = store.openCursor(query);
        request.onsuccess = e => {
            const cursor = request.result;
            if (!cursor) {
                resolve();
                return;
            }
            scanner(cursor);
        };
        request.onerror = () => {
            reject(request.error);
        };
    });
}

function indexedDbSilentAbort(tx: IDBTransaction): void {
    try {
        tx.abort();
    } catch (err) {
        /* ignore */
    }
}

function serializeForDb<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function isMissingRecord<K extends string>(value: { readonly id: K }): value is MissingRecord<K> {
    return (
        typeof value === 'object' && value &&
        Object.prototype.hasOwnProperty.call(value, MISSING_RECORD_KEY) &&
        Boolean((value as Partial<MissingRecord<K>>)[MISSING_RECORD_KEY])
    );
}

function rehydrateLabels(
    items: Iterable<{ label: ReadonlyArray<Rdf.Literal> }>,
    factory: Rdf.DataFactory
): void {
    for (const item of items) {
        item.label = item.label.map(t => rehydrateTerm(t, factory) as Rdf.Literal);
    }
}

type MutableProperties = { [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> };

function rehydrateProperties(
    items: Iterable<{ readonly properties: MutableProperties }>,
    factory: Rdf.DataFactory
): void {
    for (const item of items) {
        for (const propertyId in item.properties) {
            if (Object.prototype.hasOwnProperty.call(item.properties, propertyId)) {
                const terms = item.properties[propertyId];
                if (terms) {
                    item.properties[propertyId] = terms.map(t => rehydrateTerm(t, factory));
                }
            }
        }
    }
}

function rehydrateTerm(
    term: Rdf.NamedNode | Rdf.Literal,
    factory: Rdf.DataFactory
): Rdf.NamedNode | Rdf.Literal {
    switch (term.termType) {
        case 'NamedNode':
            return factory.namedNode(term.value);
        case 'Literal':
            return factory.literal(
                term.value,
                term.language ? term.language : factory.namedNode(term.datatype.value)
            );
        default:
            return term;
    }
}
