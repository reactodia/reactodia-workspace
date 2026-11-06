import * as N3 from 'n3';

import * as Rdf from '../rdf/rdfModel';
import { rdfs, schema } from '../rdf/vocabulary';
import {
    ElementTypeModel, ElementTypeGraph, LinkTypeModel, ElementModel, LinkModel, PropertyTypeModel,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri,
} from '../model';
import {
    DataProvider, DataProviderLinkCount, DataProviderLookupParams, DataProviderLookupItem,
    DataProviderPatternSupport, LookupPattern,
} from '../dataProvider';

import { chunkArray, chunkUndirectedCrossProduct } from './requestChunking';
import {
    MutableClassModel,
    MutableLinkType,
    MutablePropertyType,
    appendProperty,
    collectClassInfo,
    collectElementTypes,
    collectLinkTypes,
    collectPropertyTypes,
    enrichElementsWithImages,
    getClassTree,
    getConnectedLinkTypes,
    getElementsInfo,
    getFilteredData,
    getLinksInfo,
    getLinkTypes,
    getLinkStatistics,
    getPropertyTypes,
    triplesToElementBinding,
} from './responseHandler';
import {
    ClassBinding, ElementBinding, ElementTypeBinding, LinkBinding, PropertyBinding, FilterBinding,
    LinkCountBinding, LinkTypeBinding, ConnectedLinkTypeBinding, ElementImageBinding, SparqlResponse,
    mapSparqlResponseIntoRdfJs,
} from './sparqlModels';
import {
    SparqlDataProviderSettings, OwlStatsSettings, FullTextSearchSettings,
} from './sparqlDataProviderSettings';
import {
    SparqlGenerator, escapeIri, formatValueClauseContent, resolveTemplate,
} from './sparqlGenerator';

/**
 * Options for {@link SparqlDataProvider}.
 *
 * @see {@link SparqlDataProvider}
 */
export interface SparqlDataProviderOptions {
    /**
     * [RDF/JS-compatible term factory](https://rdf.js.org/data-model-spec/#datafactory-interface)
     * to create RDF terms.
     */
    factory?: Rdf.DataFactory;

    /**
     * SPARQL endpoint URL to send queries to.
     */
    endpointUrl: string;

    /**
     * Query method for SPARQL queries to use:
     *  - `GET` - more compatible, may have issues with large request URLs;
     *  - `POST` - less compatible, better on large data sets.
     *
     * @default "GET"
     */
    queryMethod?: 'GET' | 'POST';

    /**
     * Custom function to send SPARQL requests.
     *
     * By default, a global [fetch()](https://developer.mozilla.org/en-US/docs/Web/API/fetch)
     * is used with the following options:
     * ```js
     * {
     *     ...params,
     *     credentials: 'same-origin',
     *     mode: 'cors',
     *     cache: 'default',
     * }
     * ```
     */
    queryFunction?: SparqlQueryFunction;

    /**
     * Chunk size to split each SPARQL request with multiple input IRIs into.
     *
     * To disable batch splitting pass `null`.
     *
     * **Default** is `{maxSize: 2500, unit: 'totalLength'}` when `queryMethod` is `GET`,
     * otherwise `null`.
     */
    chunk?: SparqlProviderChunkOptions | null;

    /**
     * Element property type IRIs to use to get image URLs for elements.
     *
     * If needed, image URL extraction can be customized via
     * {@link SparqlDataProviderOptions.prepareImages prepareImages}.
     */
    imagePropertyUris?: ReadonlyArray<string>;

    /**
     * Allows to extract/fetch image URLs externally instead of using
     * {@link SparqlDataProviderOptions.imagePropertyUris imagePropertyUris} option.
     */
    prepareImages?: (
        elementInfo: Iterable<ElementModel>,
        signal: AbortSignal | undefined
    ) => Promise<Map<ElementIri, string>>;

    /**
     * Property IRI to store prepared image URL for an entity.
     *
     * @default "http://schema.org/thumbnailUrl"
     */
    prepareImagePredicate?: PropertyTypeIri;

    /**
     * Allows to extract/fetch labels separately from SPARQL query as an alternative or
     * in addition to `label` output binding.
     */
    prepareLabels?: (
        resources: Set<string>,
        signal: AbortSignal | undefined
    ) => Promise<Map<string, Rdf.Literal[]>>;

    /**
     * Property IRI to store prepared labels for an entity.
     *
     * @default "http://www.w3.org/2000/01/rdf-schema#label"
     */
    prepareLabelPredicate?: PropertyTypeIri;
}

/**
 * Custom function to send SPARQL HTTP requests.
 */
export type SparqlQueryFunction = (params: {
    url: string;
    body?: string;
    headers: { [header: string]: string };
    method: string;
    signal?: AbortSignal;
}) => Promise<Response>;

/**
 * Options for request chunking in {@link SparqlDataProvider}.
 *
 * @see {@link SparqlDataProviderOptions.chunk}
 */
export interface SparqlProviderChunkOptions {
    /**
     * Maximum allowed chunk size.
     *
     * This value must be a non-negative integer.
     *
     * Note that the provider may form the chunk which is larger than
     * specified if it cannot be split into smaller sub-chunks. 
     */
    readonly maxSize: number;
    /**
     * Unit of measure for {@link SparqlProviderChunkOptions.maxSize maxSize}:
     *   - `itemCount` - count of IRIs in the chunk;
     *   - `totalLength` - total length of IRIs with separators in the chunk.
     */
    readonly unit: 'itemCount' | 'totalLength';
}

/**
 * Provides graph data by requesting it from a SPARQL endpoint.
 *
 * @category Data
 */
export class SparqlDataProvider implements DataProvider {
    readonly factory: Rdf.DataFactory;
    private readonly options: SparqlDataProviderOptions;
    private readonly settings: SparqlDataProviderSettings;
    private readonly queryFunction: SparqlQueryFunction;
    private readonly acceptBlankNodes = false;
    private readonly chunkMeasure: ChunkMeasure;

    private readonly generator: SparqlGenerator;
    private readonly labelPredicate: PropertyTypeIri;
    private readonly imagePredicate: PropertyTypeIri;

    constructor(
        options: SparqlDataProviderOptions,
        settings: SparqlDataProviderSettings = OwlStatsSettings,
    ) {
        const {
            factory = Rdf.DefaultDataFactory,
            queryFunction = queryInternal,
        } = options;
        this.factory = factory;
        this.options = options;
        this.settings = settings;
        this.queryFunction = queryFunction;

        const {
            chunk,
            queryMethod = 'GET',
            prepareLabelPredicate,
            prepareImagePredicate,
        } = this.options;

        if (chunk) {
            if (!Number.isSafeInteger(chunk.maxSize)) {
                throw new Error(
                    'SparqlDataProviderOptions.chunk.maxSize should be a non-negative number'
                );
            }
        }

        if (chunk) {
            this.chunkMeasure = {
                maxSize: chunk.maxSize,
                measure: makeChunkMeasure(chunk.unit),
            };
        } else if (chunk === undefined && queryMethod === 'GET') {
            this.chunkMeasure = {
                maxSize: 2500,
                measure: makeChunkMeasure('totalLength'),
            };
        } else {
            this.chunkMeasure = {
                maxSize: Infinity,
                measure: makeChunkMeasure('itemCount'),
            };
        }

        this.generator = new SparqlGenerator(factory, settings, {
            acceptBlankNodes: this.acceptBlankNodes,
        });
        this.labelPredicate = prepareLabelPredicate ?? rdfs.label;
        this.imagePredicate = prepareImagePredicate ?? schema.thumbnailUrl;
    }

    private async queryChunked<T extends string>(
        items: readonly T[],
        callback: (batch: readonly T[]) => Promise<void>
    ): Promise<void> {
        const {maxSize, measure} = this.chunkMeasure;
        const tasks: Promise<void>[] = [];
        for (const chunk of chunkArray(items, measure, maxSize)) {
            tasks.push(callback(chunk));
        }
        await Promise.all(tasks);
    }

    async knownElementTypes(params: {
        signal?: AbortSignal;
    }): Promise<ElementTypeGraph> {
        const {signal} = params;
        const {defaultPrefix, schemaLabelProperty, classTreeQuery} = this.settings;
        if (!classTreeQuery) {
            return {elementTypes: [], subtypeOf: []};
        }

        const query = defaultPrefix + resolveTemplate(classTreeQuery, {
            schemaLabelProperty,
            labelLanguageFilter: this.generator.formatLanguageFilter('?label'),
        });
        const result = await this.executeSparqlSelect<ClassBinding>(query, {signal});
        const classTree = getClassTree(result);

        if (this.options.prepareLabels) {
            await attachLabels(classTree.elementTypes, this.options.prepareLabels, signal);
        }

        return classTree;
    }

    async lookupElementTypes(params: {
        text: string;
        limit?: number;
        signal?: AbortSignal;
    }): Promise<ElementTypeModel[]> {
        const {classLookupQuery, classLookupSettings} = this.settings;
        return this.lookupSchemaItems(
            classLookupQuery,
            classLookupSettings,
            this.factory.variable!('class'),
            (response: SparqlResponse<ClassBinding>) => getClassTree(response).elementTypes,
            params
        );
    }

    async lookupPropertyTypes(params: {
        text: string;
        limit?: number;
        signal?: AbortSignal;
    }): Promise<PropertyTypeModel[]> {
        const {propertyTypesLookupQuery, propertyTypesLookupSettings} = this.settings;
        return this.lookupSchemaItems(
            propertyTypesLookupQuery,
            propertyTypesLookupSettings,
            this.factory.variable!('property'),
            (response: SparqlResponse<PropertyBinding>) => Array.from(
                getPropertyTypes(response).values()
            ),
            params
        );
    }

    async lookupLinkTypes(params: {
        text: string;
        limit?: number;
        signal?: AbortSignal;
    }): Promise<LinkTypeModel[]> {
        const {linkTypesLookupQuery, linkTypesLookupSettings} = this.settings;
        return this.lookupSchemaItems(
            linkTypesLookupQuery,
            linkTypesLookupSettings,
            this.factory.variable!('link'),
            (response: SparqlResponse<LinkTypeBinding>) => Array.from(
                getLinkTypes(response).values()
            ),
            params
        );
    }

    private async lookupSchemaItems<Binding, Item extends LabeledItem>(
        lookupQuery: string | undefined,
        lookupSettings: FullTextSearchSettings | undefined,
        itemTerm: Rdf.Variable,
        itemsFromResponse: (response: SparqlResponse<Binding>) => Item[],
        params: {
            text: string;
            limit?: number;
            signal?: AbortSignal;
        }
    ): Promise<Item[]> {
        const {text, limit, signal} = params;
        const {schemaTextSearch} = this.settings;

        const textSearchSettings = lookupSettings ?? schemaTextSearch;
        if (!(lookupQuery && textSearchSettings)) {
            return [];
        }

        const query = this.generator.generateLookupSchemaQuery({
            lookupQuery,
            textSearchSettings,
            itemTerm,
            text,
            limit,
        });
        const result = await this.executeSparqlSelect<Binding>(query, {signal});
        const items = Array.from(itemsFromResponse(result).values());

        if (this.options.prepareLabels) {
            await attachLabels(items, this.options.prepareLabels, signal);
        }

        return items;
    }

    async propertyTypes(params: {
        propertyIds: ReadonlyArray<PropertyTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<PropertyTypeIri, PropertyTypeModel>> {
        const {propertyIds, signal} = params;
        const {defaultPrefix, schemaLabelProperty, propertyInfoQuery} = this.settings;

        const properties = new Map<PropertyTypeIri, MutablePropertyType>();
        if (propertyInfoQuery) {
            await this.queryChunked(propertyIds, async batch => {
                const query = defaultPrefix + resolveTemplate(propertyInfoQuery, {
                    ids: formatValueClauseContent(batch),
                    schemaLabelProperty,
                    labelLanguageFilter: this.generator.formatLanguageFilter('?label'),
                });
                const response = await this.executeSparqlSelect<PropertyBinding>(query, {signal});
                collectPropertyTypes(response, properties);
            });
        } else {
            for (const id of propertyIds) {
                properties.set(id, {id, label: []});
            }
        }

        if (this.options.prepareLabels) {
            await attachLabels(Array.from(properties.values()), this.options.prepareLabels, signal);
        }

        return properties;
    }

    async elementTypes(params: {
        classIds: ReadonlyArray<ElementTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<ElementTypeIri, ElementTypeModel>> {
        const {classIds, signal} = params;
        const {defaultPrefix, schemaLabelProperty, classInfoQuery} = this.settings;

        const classes = new Map<ElementTypeIri, MutableClassModel>();
        if (classInfoQuery) {
            await this.queryChunked(classIds, async batch => {
                const query = defaultPrefix + resolveTemplate(classInfoQuery, {
                    ids: formatValueClauseContent(batch),
                    schemaLabelProperty,
                    labelLanguageFilter: this.generator.formatLanguageFilter('?label'),
                });
                const response = await this.executeSparqlSelect<ClassBinding>(query, {signal});
                collectClassInfo(response, classes);
            });
        } else {
            for (const classId of classIds) {
                classes.set(classId, {id: classId, label: []});
            }
        }

        if (this.options.prepareLabels) {
            await attachLabels(Array.from(classes.values()), this.options.prepareLabels, signal);
        }

        return classes;
    }

    async linkTypes(params: {
        linkTypeIds: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<LinkTypeIri, LinkTypeModel>> {
        const {linkTypeIds, signal} = params;
        const {defaultPrefix, schemaLabelProperty, linkTypesInfoQuery} = this.settings;

        const linkTypes = new Map<LinkTypeIri, MutableLinkType>();
        if (linkTypesInfoQuery) {
            await this.queryChunked(linkTypeIds, async batch => {
                const ids = batch.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
                const query = defaultPrefix + resolveTemplate(linkTypesInfoQuery, {
                    ids,
                    schemaLabelProperty,
                    labelLanguageFilter: this.generator.formatLanguageFilter('?label'),
                });
                const response = await this.executeSparqlSelect<LinkTypeBinding>(query, {signal});
                collectLinkTypes(response, linkTypes);
            });
        } else {
            for (const typeId of linkTypeIds) {
                linkTypes.set(typeId, {id: typeId, label: []});
            }
        }

        if (this.options.prepareLabels) {
            await attachLabels(Array.from(linkTypes.values()), this.options.prepareLabels, signal);
        }

        return linkTypes;
    }

    async elements(params: {
        elementIds: ReadonlyArray<ElementIri>;
        signal?: AbortSignal;
    }): Promise<Map<ElementIri, ElementModel>> {
        const {elementIds, signal} = params;

        const triples: Rdf.Quad[] = [];
        if (elementIds.length > 0) {
            await this.queryChunked(elementIds, async batch => {
                const ids = batch.map(escapeIri).map(id => ` (${id})`).join(' ');
                const {defaultPrefix, dataLabelProperty, filterOnlyLanguages, elementInfoQuery} = this.settings;
                const query = defaultPrefix + resolveTemplate(elementInfoQuery, {
                    ids,
                    dataLabelProperty,
                    labelLanguageFilter: this.generator.formatLanguageFilter('?label'),
                    valueLanguageFilter: this.generator.formatLanguageFilter('?propValue'),
                    propertyConfigurations: this.generator.formatPropertyUnion({
                        entityTerm: this.factory.variable!('inst'),
                        valueTerm: this.factory.variable!('propValue'),
                        predicateTerm: this.factory.variable!('propType'),
                        withProjection: true,
                    }),
                });
                const response = await this.executeSparqlConstruct(query);
                for (const triple of response) {
                    triples.push(triple);
                }
            });
        }

        const types = this.queryManyElementTypes(
            this.settings.propertyConfigurations.length > 0 ? elementIds : [],
            signal
        );

        const bindings = triplesToElementBinding(triples);
        const elementModels = getElementsInfo(
            bindings,
            await types,
            this.generator.propertyByPredicate,
            this.labelPredicate,
            this.generator.openWorldProperties
        );

        if (this.options.prepareLabels) {
            await attachProperties(
                Array.from(elementModels.values()),
                this.options.prepareLabels,
                this.labelPredicate,
                signal
            );
        }

        if (this.options.prepareImages) {
            await prepareElementImages(
                elementModels,
                this.options.prepareImages,
                this.imagePredicate,
                this.factory,
                signal
            );
        } else if (this.options.imagePropertyUris && this.options.imagePropertyUris.length) {
            await this.attachImages(elementModels, this.options.imagePropertyUris, signal);
        }

        return elementModels;
    }

    private async attachImages(
        elements: Map<ElementIri, ElementModel>,
        imagePropertyIris: ReadonlyArray<string>,
        signal: AbortSignal | undefined
    ): Promise<void> {
        const imageProperties = imagePropertyIris.map(escapeIri).map(id => ` ( ${id} )`).join(' ');

        await this.queryChunked(Array.from(elements.keys()), async batch => {
            const ids = batch.map(id => ` ( ${escapeIri(id)} )`).join(' ');
            const query = this.settings.defaultPrefix + `
                SELECT ?inst ?linkType ?image
                WHERE {
                    VALUES (?inst) {${ids}}
                    VALUES (?linkType) {${imageProperties}}
                    ${this.settings.imageQueryPattern}
                }
            `;
            try {
                const bindings = await this.executeSparqlSelect<ElementImageBinding>(query, {signal});
                enrichElementsWithImages(bindings, elements, this.imagePredicate);
            } catch (err) {
                console.warn('Failed to load entity image URLs', err);
            }
        });
    }

    async links(params: {
        primary: ReadonlyArray<ElementIri>;
        secondary: ReadonlyArray<ElementIri>;
        linkTypeIds?: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<LinkModel[]> {
        const {primary, secondary, linkTypeIds, signal} = params;
        const {linksInfoQuery} = this.settings;

        const propLanguageFilter = this.generator.formatLanguageFilter('?propValue');
        const linkConfigurations = this.generator.formatLinkLinks();

        let bindings: Promise<ReadonlyArray<LinkBinding>>;
        if (primary.length > 0 && secondary.length > 0) {
            if (linksInfoQuery.includes('${ids}')) {
                bindings = this.queryUndirectedLinks(
                    primary,
                    secondary,
                    {propLanguageFilter, linkConfigurations},
                    signal,
                );
            } else {
                bindings = this.queryDirectedLinks(
                    primary,
                    secondary,
                    {propLanguageFilter, linkConfigurations},
                    signal,
                );
            }
        } else {
            bindings = Promise.resolve<LinkBinding[]>([]);
        }

        let elementsForTypes: Set<ElementIri> | undefined;
        if (this.generator.linkByPredicate.size > 0) {
            // Optimization for common case without link configurations
            elementsForTypes = new Set(primary);
            for (const iri of secondary) {
                elementsForTypes.add(iri);
            }
        }

        const types = this.queryManyElementTypes(
            elementsForTypes ? Array.from(elementsForTypes) : [],
            signal
        );

        let linksInfo = getLinksInfo(
            await bindings,
            await types,
            this.generator.linkByPredicate,
            this.generator.openWorldLinks
        );
        if (linkTypeIds) {
            const allowedLinkTypes = new Set(linkTypeIds);
            linksInfo = linksInfo.filter(link => allowedLinkTypes.has(link.linkTypeId));
        }
        return linksInfo;
    }

    private async queryUndirectedLinks(
        primary: ReadonlyArray<ElementIri>,
        secondary: ReadonlyArray<ElementIri>,
        queryVariables: {
            propLanguageFilter: string;
            linkConfigurations: string;
        },
        signal: AbortSignal | undefined
    ): Promise<LinkBinding[]> {
        const {propLanguageFilter, linkConfigurations} = queryVariables;
        const {defaultPrefix, linksInfoQuery} = this.settings;

        const allElementIris = new Set<ElementIri>(primary);
        for (const iri of secondary) {
            allElementIris.add(iri);
        }
        const query = defaultPrefix + resolveTemplate(linksInfoQuery, {
            ids: formatValueClauseContent(allElementIris),
            propLanguageFilter,
            linkConfigurations,
        });
        const response = await this.executeSparqlSelect<LinkBinding>(query, {signal});
        return response.results.bindings;
    }

    private async queryDirectedLinks(
        primary: ReadonlyArray<ElementIri>,
        secondary: ReadonlyArray<ElementIri>,
        queryVariables: {
            propLanguageFilter: string;
            linkConfigurations: string;
        },
        signal: AbortSignal | undefined
    ): Promise<LinkBinding[]> {
        const {propLanguageFilter, linkConfigurations} = queryVariables;
        const {defaultPrefix, linksInfoQuery} = this.settings;
        const {maxSize, measure} = this.chunkMeasure;

        const bindings: LinkBinding[] = [];
        const tasks = Array.from(
            chunkUndirectedCrossProduct(
                primary,
                secondary,
                measure,
                maxSize
            ),
            async chunk => {
                const query = defaultPrefix + resolveTemplate(linksInfoQuery, {
                    sourceIris: formatValueClauseContent(chunk.sources),
                    targetIris: formatValueClauseContent(chunk.targets),
                    propLanguageFilter,
                    linkConfigurations,
                });
                const result = await this.executeSparqlSelect<LinkBinding>(query, {signal});
                for (const binding of result.results.bindings) {
                    bindings.push(binding);
                }
            }
        );

        await Promise.all(tasks);
        return bindings;
    }

    async connectedLinkStats(params: {
        elementId: ElementIri;
        inexactCount?: boolean;
        signal?: AbortSignal;
    }): Promise<DataProviderLinkCount[]> {
        const {elementId, inexactCount, signal} = params;
        
        const elementTerm = this.factory.namedNode(elementId);
        const targetOut = this.factory.variable!('outObject');
        const targetIn = this.factory.variable!('inObject');
        const query = this.generator.generateLinkTypesOfQuery({
            elementTerm,
            targetIn,
            targetOut,
        });

        const linkTypeBindings = await this.executeSparqlSelect<ConnectedLinkTypeBinding>(query, {signal});
        const hasConnectedDirection = linkTypeBindings.head.vars.includes('direction');
        const connectedLinkTypes = getConnectedLinkTypes(
            linkTypeBindings,
            this.generator.linkByPredicate,
            this.generator.openWorldLinks
        );

        const {
            navigateElementFilterIn,
            navigateElementFilterOut,
        } = this.generator.formatLinkStatsNavigateFilters();

        const foundLinkStats: DataProviderLinkCount[] = [];
        await Promise.all(connectedLinkTypes.map(async ({linkType, hasInLink, hasOutLink}) => {
            if (!this.settings.linkTypesStatisticsQuery || (inexactCount && hasConnectedDirection)) {
                foundLinkStats.push({
                    id: linkType,
                    inCount: hasInLink ? 1 : 0,
                    outCount: hasOutLink ? 1 : 0,
                    inexact: true,
                });
            } else {
                const statsQuery = this.generator.generateLinkStatsQuery({
                    elementTerm,
                    targetIn,
                    targetOut,
                    linkType,
                    navigateElementFilterIn,
                    navigateElementFilterOut,
                });
                const bindings = await this.executeSparqlSelect<LinkCountBinding>(statsQuery, {signal});
                const linkStats = getLinkStatistics(bindings);
                if (linkStats) {
                    foundLinkStats.push(linkStats);
                }
            }
        }));
        return foundLinkStats;
    }

    supportsPattern(pattern: LookupPattern): DataProviderPatternSupport {
        return {ok: false, errors: []};
    }

    async lookup(baseParams: DataProviderLookupParams): Promise<DataProviderLookupItem[]> {
        const {signal} = baseParams;
        const params: DataProviderLookupParams = {
            ...baseParams,
            limit: baseParams.limit === undefined ? 100 : baseParams.limit,
        };

        // query types to match link configuration domains
        const types = this.querySingleElementTypes(
            params.refElementId && this.settings.linkConfigurations.length > 0
                ? params.refElementId : undefined,
            signal
        );

        const filterQuery = this.generator.generateFilterQuery(params);
        const bindings = await this.executeSparqlSelect<ElementBinding & FilterBinding>(
            filterQuery,
            {signal}
        );

        const linkedElements = getFilteredData(
            bindings,
            await types,
            this.generator.linkByPredicate,
            this.labelPredicate,
            this.generator.openWorldLinks
        );

        if (this.options.prepareLabels) {
            const models = linkedElements.map(linked => linked.element);
            await attachProperties(
                models,
                this.options.prepareLabels,
                this.labelPredicate,
                signal
            );
        }

        return linkedElements;
    }

    /**
     * Executes arbitrary SPARQL SELECT query and returns the result tuples.
     */
    executeSparqlSelect<Binding>(
        query: string,
        options?: { signal?: AbortSignal }
    ): Promise<SparqlResponse<Binding>> {
        const method = this.options.queryMethod ?? 'GET';
        const {signal} = options ?? {};
        return executeSparqlQuery<Binding>(
            this.options.endpointUrl,
            query,
            method,
            this.queryFunction,
            this.factory,
            signal
        );
    }

    /**
     * Executes arbitrary SPARQL CONSTRUCT query and returns the result RDF graph.
     */
    executeSparqlConstruct(
        query: string,
        options?: { signal?: AbortSignal }
    ): Promise<Rdf.Quad[]> {
        const method = this.options.queryMethod ?? 'GET';
        const {signal} = options ?? {};
        return executeSparqlConstruct(
            this.options.endpointUrl,
            query,
            method,
            this.queryFunction,
            signal,
        );
    }

    private async querySingleElementTypes(
        element: ElementIri | undefined,
        signal: AbortSignal | undefined
    ): Promise<Set<ElementTypeIri> | undefined> {
        if (!element) {
            return undefined;
        }
        const types = await this.queryManyElementTypes([element], signal);
        return types.get(element);
    }

    private async queryManyElementTypes(
        elements: ReadonlyArray<ElementIri>,
        signal: AbortSignal | undefined
    ): Promise<Map<ElementIri, Set<ElementTypeIri>>> {
        if (elements.length === 0) {
            return new Map();
        }
        const {filterTypePattern} = this.settings;
        const elementTypes = new Map<ElementIri, Set<ElementTypeIri>>();
        await this.queryChunked(elements, async batch => {
            const ids = batch.map(iri => `(${escapeIri(iri)})`).join(' ');
            const queryTemplate = 'SELECT ?inst ?class { VALUES(?inst) { ${ids} } ${filterTypePattern} }';
            const query = resolveTemplate(queryTemplate, {ids, filterTypePattern});
            const response = await this.executeSparqlSelect<ElementTypeBinding>(query, {signal});
            collectElementTypes(response, elementTypes);
        });
        return elementTypes;
    }
}

interface ChunkMeasure {
    readonly measure: (item: string) => number;
    readonly maxSize: number;
}

function makeChunkMeasure(unit: SparqlProviderChunkOptions['unit']): ChunkMeasure['measure'] {
    switch (unit) {
        case 'totalLength': {
            // IRI is formatted as (IRI) and joined with a space,
            // which gives 5 additional characters per IRI
            return item => escapeIri(item).length + 3;
        }
        default: {
            return () => 1;
        }
    }
}

interface LabeledItem {
    id: string;
    label: ReadonlyArray<Rdf.Literal>;
}

async function attachLabels(
    items: readonly LabeledItem[],
    fetchLabels: NonNullable<SparqlDataProviderOptions['prepareLabels']>,
    signal: AbortSignal | undefined
): Promise<void> {
    const resources = new Set(items.map(item => item.id));
    const labels = await fetchLabels(resources, signal);
    for (const item of items) {
        const itemLabels = labels.get(item.id);
        if (itemLabels) {
            item.label = itemLabels;
        }
    }
}

type MutableProperties = Record<PropertyTypeIri, Array<Rdf.NamedNode | Rdf.Literal>>;

async function attachProperties(
    items: readonly ElementModel[],
    fetchProperties: NonNullable<SparqlDataProviderOptions['prepareLabels']>,
    propertyIri: PropertyTypeIri,
    signal: AbortSignal | undefined
) {
    const resources = new Set(items.map(item => item.id));
    const properties = await fetchProperties(resources, signal);
    for (const item of items) {
        const itemValues = properties.get(item.id);
        if (itemValues) {
            (item.properties as MutableProperties)[propertyIri] = itemValues;
        }
    }
}

function prepareElementImages(
    elements: Map<ElementIri, ElementModel>,
    fetchImages: NonNullable<SparqlDataProviderOptions['prepareImages']>,
    imagePropertyIri: PropertyTypeIri,
    factory: Rdf.DataFactory,
    signal: AbortSignal | undefined
): Promise<void> {
    return fetchImages(elements.values(), signal).then(images => {
        for (const [iri, image] of images) {
            const entity = elements.get(iri);
            if (entity) {
                appendProperty(
                    entity.properties as MutableProperties,
                    imagePropertyIri,
                    factory.namedNode(image)
                );
            }
        }
    });
}

async function executeSparqlQuery<Binding>(
    endpoint: string,
    query: string,
    method: 'GET' | 'POST',
    queryFunction: SparqlQueryFunction,
    factory: Rdf.DataFactory,
    signal: AbortSignal | undefined
): Promise<SparqlResponse<Binding>> {
    let internalQuery: Promise<Response>;
    if (method === 'GET') {
        internalQuery = queryFunction({
            url: appendQueryParams(endpoint, {query}),
            headers: {
                'Accept': 'application/sparql-results+json',
            },
            method: 'GET',
            signal,
        });
    } else {
        internalQuery = queryFunction({
            url: endpoint,
            body: query,
            headers: {
                'Accept': 'application/sparql-results+json',
                'Content-Type': 'application/sparql-query; charset=UTF-8',
            },
            method: 'POST',
            signal,
        });
    }
    const response = await internalQuery;
    if (response.ok) {
        const sparqlResponse = await response.json() as SparqlResponse<Binding>;
        return mapSparqlResponseIntoRdfJs(sparqlResponse, factory);
    } else {
        throw await SparqlResponseError.fromResponse(response);
    }
}

async function executeSparqlConstruct(
    endpoint: string,
    query: string,
    method: 'GET' | 'POST',
    queryFunction: SparqlQueryFunction,
    signal: AbortSignal | undefined
): Promise<Rdf.Quad[]> {
    let internalQuery: Promise<Response>;
    if (method === 'GET') {
        internalQuery = queryFunction({
            url: appendQueryParams(endpoint, {query}),
            headers: {
                'Accept': 'text/turtle',
            },
            method: 'GET',
            signal,
        });
    } else {
        internalQuery = queryFunction({
            url: endpoint,
            body: query,
            headers: {
                'Accept': 'text/turtle',
                'Content-Type': 'application/sparql-query; charset=UTF-8',
            },
            method: 'POST',
            signal,
        });
    }
    const response = await internalQuery;
    if (response.ok) {
        const turtleText = await response.text();
        const parser = new N3.Parser();
        return parser.parse(turtleText);
    } else {
        throw await SparqlResponseError.fromResponse(response);
    }
}

/**
 * SPARQL response error originated from an endpoint.
 */
export class SparqlResponseError extends Error {
    /**
     * SPARQL endpoint response with an error result.
     */
    readonly response: Response;

    constructor(
        message: string,
        response: Response,
        options?: ErrorOptions
    ) {
        super(message, options);
        this.response = response;
    }

    /**
     * Makes an error for a non-OK response with the HTTP status and the beginning
     * of the response body in the message, as an endpoint usually explains
     * a rejected query there (e.g. a syntax or a query cost estimation error).
     */
    static async fromResponse(response: Response): Promise<SparqlResponseError> {
        let details = '';
        try {
            const body = (await response.text()).trim();
            const maxLength = 500;
            details = body.length > maxLength ? body.substring(0, maxLength) + '…' : body;
        } catch (e) {
            /* ignore */
        }
        const status = `HTTP ${response.status} ${response.statusText}`.trim();
        return new SparqlResponseError(
            details ? `${status}: ${details}` : status,
            response
        );
    }
}

function appendQueryParams(endpoint: string, queryParams: { [key: string]: string } = {}) {
    const initialSeparator = endpoint.indexOf('?') < 0 ? '?' : '&';
    const additionalParams = initialSeparator + Object.keys(queryParams)
        .map(key => `${key}=${encodeURIComponent(queryParams[key])}`)
        .join('&');
    return endpoint + additionalParams;
}

function queryInternal(params: {
    url: string;
    body?: string;
    headers: { [header: string]: string };
    method: string;
    signal?: AbortSignal;
}) {
    return fetch(params.url, {
        method: params.method,
        body: params.body,
        credentials: 'same-origin',
        mode: 'cors',
        cache: 'default',
        headers: params.headers,
        signal: params.signal,
    });
}
