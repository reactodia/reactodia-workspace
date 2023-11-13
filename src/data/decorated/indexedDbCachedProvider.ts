import * as Rdf from '../rdf/rdfModel';
import {
    ElementTypeGraph, LinkType, ElementTypeIri, ElementType, PropertyTypeIri,
    PropertyType, LinkTypeIri, ElementIri, ElementModel, LinkModel, LinkCount,
} from '../model';
import { DataProvider, LookupParams, LinkedElement } from '../provider';

export interface IndexedDbCachedProviderOptions {
    readonly baseProvider: DataProvider;
    readonly dbName: string;
    /**
     * @default false
     */
    readonly cacheTextLookups?: boolean;
}

const enum ObjectStore {
    knownElementTypes = 'knownElementTypes',
    knownLinkTypes = 'knownLinkTypes',
    elementTypes = 'elementTypes',
    linkTypes = 'linkTypes',
    propertyTypes = 'propertyTypes',
    elements = 'elements',
    connectedLinkStats = 'connectedLinkStats',
    lookup = 'lookup',
}

const KNOWN_ELEMENT_TYPES_KEY = 'knownElementTypes';
interface KnownElementTypesRecord {
    readonly id: typeof KNOWN_ELEMENT_TYPES_KEY;
    readonly value: ElementTypeGraph;
}

const KNOWN_LINK_TYPES_KEY = 'knownLinkTypes';
interface KnownLinkTypesRecord {
    readonly id: typeof KNOWN_LINK_TYPES_KEY;
    readonly value: LinkType[];
}

interface ConnectedLinkStatsRecord {
    readonly elementId: ElementIri;
    readonly stats: LinkCount[];
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
    readonly result: LinkedElement[];
}

export class IndexedDbCachedProvider implements DataProvider {
    static readonly DB_VERSION = 2;

    private readonly baseProvider: DataProvider;
    private readonly dbName: string;
    private readonly cacheTextLookups: boolean;

    private openedDb: Promise<IDBDatabase> | undefined;

    constructor(options: IndexedDbCachedProviderOptions) {
        this.baseProvider = options.baseProvider;
        this.dbName = options.dbName;
        this.cacheTextLookups = options.cacheTextLookups ?? false;
    }

    get factory(): Rdf.DataFactory {
        return this.baseProvider.factory;
    }

    private openDb(): Promise<IDBDatabase> {
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
                        db.createObjectStore(ObjectStore.elementTypes, {
                            keyPath: 'id',
                        });
                    }
                    if (!db.objectStoreNames.contains(ObjectStore.linkTypes)) {
                        db.createObjectStore(ObjectStore.linkTypes, {
                            keyPath: 'id',
                        });
                    }
                    if (!db.objectStoreNames.contains(ObjectStore.propertyTypes)) {
                        db.createObjectStore(ObjectStore.propertyTypes, {
                            keyPath: 'id',
                        });
                    }
                    if (!db.objectStoreNames.contains(ObjectStore.elements)) {
                        db.createObjectStore(ObjectStore.elements, {
                            keyPath: 'id',
                        });
                    }
                    if (!db.objectStoreNames.contains(ObjectStore.connectedLinkStats)) {
                        db.createObjectStore(ObjectStore.connectedLinkStats, {
                            keyPath: 'elementId',
                        });
                    }
                    if (!db.objectStoreNames.contains(ObjectStore.lookup)) {
                        db.createObjectStore(ObjectStore.lookup, {
                            keyPath: LOOKUP_KEY_PROPERTIES,
                        });
                    }
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

    async knownLinkTypes(params: { signal?: AbortSignal | undefined; }): Promise<LinkType[]> {
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
    }): Promise<Map<ElementTypeIri, ElementType>> {
        const {classIds, signal} = params;
        const db = await this.openDb();
        const result = await fetchManyWithDbCache(
            db,
            ObjectStore.elementTypes,
            classIds,
            async ids => await this.baseProvider.elementTypes({classIds: ids, signal}),
        );
        rehydrateLabels(result.values(), this.factory);
        return result;
    }

    async propertyTypes(params: {
        propertyIds: readonly PropertyTypeIri[];
        signal?: AbortSignal | undefined;
    }): Promise<Map<PropertyTypeIri, PropertyType>> {
        const {propertyIds, signal} = params;
        const db = await this.openDb();
        const result = await fetchManyWithDbCache(
            db,
            ObjectStore.propertyTypes,
            propertyIds,
            async ids => await this.baseProvider.propertyTypes({propertyIds: ids, signal}),
        );
        rehydrateLabels(result.values(), this.factory);
        return result;
    }

    async linkTypes(params: {
        linkTypeIds: readonly LinkTypeIri[];
        signal?: AbortSignal | undefined;
    }): Promise<Map<LinkTypeIri, LinkType>> {
        const {linkTypeIds, signal} = params;
        const db = await this.openDb();
        const result = await fetchManyWithDbCache(
            db,
            ObjectStore.linkTypes,
            linkTypeIds,
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
            async ids => await this.baseProvider.elements({elementIds: ids, signal}),
        );
        rehydrateLabels(result.values(), this.factory);
        rehydrateProperties(result.values(), this.factory);
        return result;
    }

    links(params: {
        elementIds: readonly ElementIri[];
        linkTypeIds?: readonly LinkTypeIri[] | undefined;
        signal?: AbortSignal | undefined;
    }): Promise<LinkModel[]> {
        // TODO: cache this result as well
        return this.baseProvider.links(params);
    }

    async connectedLinkStats(params: {
        elementId: ElementIri;
        signal?: AbortSignal | undefined;
    }): Promise<LinkCount[]> {
        const {elementId, signal} = params;
        const db = await this.openDb();
        const result = await fetchSingleWithDbCache(
            db,
            ObjectStore.connectedLinkStats,
            elementId,
            async (key): Promise<ConnectedLinkStatsRecord> => ({
                elementId: key,
                stats: await this.baseProvider.connectedLinkStats({elementId: key, signal}),
            })
        );
        return result.stats;
    }

    async lookup(params: LookupParams): Promise<LinkedElement[]> {
        if (!this.cacheTextLookups && params.text !== undefined) {
            return this.baseProvider.lookup(params);
        }
        const key: LookupKey = [
            params.elementTypeId ?? ('' as ElementTypeIri),
            params.refElementId ?? ('' as ElementIri),
            params.refElementLinkId ?? ('' as LinkTypeIri),
            params.linkDirection ?? ('' as LookupLinkDirectionKey),
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

async function fetchSingleWithDbCache<K extends string | string[], V>(
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

async function fetchManyWithDbCache<K extends string, V>(
    db: IDBDatabase,
    storeName: string,
    keys: ReadonlyArray<K>,
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
                    result.set(classId, model);
                } else {
                    missingKeys.push(classId);
                }
            }
        );
        readTx.commit();
    }

    if (missingKeys.length > 0) {
        const fetched = await fetchBase(missingKeys);
        const stored: V[] = [];
        for (const [key, model] of fetched) {
            const serialized = serializeForDb(model);
            result.set(key, serialized);
            stored.push(serialized);
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
    store: IDBObjectStore,
    keys: ReadonlyArray<K>,
    onGet: (value: unknown, key: K) => void
): Promise<void> {
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

function indexedDbPutMany(
    store: IDBObjectStore,
    values: ReadonlyArray<unknown>
): Promise<IDBValidKey[]> {
    return new Promise<IDBValidKey[]>((resolve, reject) => {
        const addedKeys: IDBValidKey[] = [];
        let rejected = false;
        for (const value of values) {
            const request = store.put(value);
            request.onsuccess = () => {
                if (rejected) {
                    return;
                }
                addedKeys.push(request.result);
                if (addedKeys.length === values.length) {
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

function serializeForDb<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
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
