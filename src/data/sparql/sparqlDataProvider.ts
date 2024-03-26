import * as N3 from 'n3';

import { getOrCreateArrayInMap } from '../../coreUtils/collections';
import * as Rdf from '../rdf/rdfModel';
import {
    ElementTypeModel, ElementTypeGraph, LinkTypeModel, ElementModel, LinkModel, LinkCount, PropertyTypeModel,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri, LinkedElement,
} from '../model';
import { DataProvider, LookupParams } from '../provider';
import {
    enrichElementsWithImages,
    getClassTree,
    getClassInfo,
    getPropertyInfo,
    getLinkTypes,
    getElementsInfo,
    getElementTypes,
    getLinksInfo,
    getConnectedLinkTypes,
    getFilteredData,
    getLinkStatistics,
    triplesToElementBinding,
    isDirectLink,
    isDirectProperty,
} from './responseHandler';
import {
    ClassBinding, ElementBinding, ElementTypeBinding, LinkBinding, PropertyBinding, FilterBinding,
    LinkCountBinding, LinkTypeBinding, ConnectedLinkTypeBinding, ElementImageBinding, SparqlResponse,
    mapSparqlResponseIntoRdfJs,
} from './sparqlModels';
import {
    SparqlDataProviderSettings, OwlStatsSettings, LinkConfiguration, PropertyConfiguration,
} from './sparqlDataProviderSettings';

export type SparqlQueryFunction = (params: {
    url: string;
    body?: string;
    headers: { [header: string]: string };
    method: string;
    signal?: AbortSignal;
}) => Promise<Response>;

/**
 * Runtime settings of SPARQL data provider
 */
export interface SparqlDataProviderOptions {
    /**
     * RDF/JS-compatible term factory to create RDF terms.
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
     * Element property type IRIs to use to get image URLs for elements.
     *
     * If needed, image URL extraction can be customized via `prepareImages`.
     */
    imagePropertyUris?: ReadonlyArray<string>;

    /**
     * Allows to extract/fetch image URLs externally instead of using `imagePropertyUris` option.
     */
    prepareImages?: (
        elementInfo: Iterable<ElementModel>,
        signal: AbortSignal | undefined
    ) => Promise<Map<ElementIri, string>>;

    /**
     * Allows to extract/fetch labels separately from SPARQL query as an alternative or
     * in addition to `label` output binding.
     */
    prepareLabels?: (
        resources: Set<string>,
        signal: AbortSignal | undefined
    ) => Promise<Map<string, Rdf.Literal[]>>;
}

export class SparqlDataProvider implements DataProvider {
    readonly factory: Rdf.DataFactory;
    private readonly options: SparqlDataProviderOptions;
    private readonly settings: SparqlDataProviderSettings;
    private readonly queryFunction: SparqlQueryFunction;
    private readonly acceptBlankNodes = false;

    private linkByPredicate = new Map<string, LinkConfiguration[]>();
    private linkById = new Map<LinkTypeIri, LinkConfiguration>();
    private openWorldLinks: boolean;

    private propertyByPredicate = new Map<string, PropertyConfiguration[]>();
    private openWorldProperties: boolean;

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

        for (const link of settings.linkConfigurations) {
            this.linkById.set(link.id as LinkTypeIri, link);
            const predicate = isDirectLink(link) ? link.path : link.id;
            getOrCreateArrayInMap(this.linkByPredicate, predicate).push(link);
        }
        this.openWorldLinks = settings.linkConfigurations.length === 0 ||
            Boolean(settings.openWorldLinks);

        for (const property of settings.propertyConfigurations) {
            const predicate = isDirectProperty(property) ? property.path : property.id;
            getOrCreateArrayInMap(this.propertyByPredicate, predicate).push(property);
        }
        this.openWorldProperties = settings.propertyConfigurations.length === 0 ||
            Boolean(settings.openWorldProperties);
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
        });
        const result = await this.executeSparqlSelect<ClassBinding>(query, {signal});
        const classTree = getClassTree(result);

        if (this.options.prepareLabels) {
            await attachLabels(classTree.elementTypes, this.options.prepareLabels, signal);
        }

        return classTree;
    }

    async propertyTypes(params: {
        propertyIds: ReadonlyArray<PropertyTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<PropertyTypeIri, PropertyTypeModel>> {
        const {propertyIds, signal} = params;
        const {defaultPrefix, schemaLabelProperty, propertyInfoQuery} = this.settings;

        let properties: Map<PropertyTypeIri, PropertyTypeModel>;
        if (propertyInfoQuery) {
            const ids = propertyIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
            const query = defaultPrefix + resolveTemplate(propertyInfoQuery, {
                ids,
                schemaLabelProperty,
            });
            const result = await this.executeSparqlSelect<PropertyBinding>(query, {signal});
            properties = getPropertyInfo(result);
        } else {
            properties = new Map<PropertyTypeIri, PropertyTypeModel>();
            for (const id of propertyIds) {
                properties.set(id, {id, label: []});
            }
        }

        if (this.options.prepareLabels) {
            await attachLabels(properties.values(), this.options.prepareLabels, signal);
        }

        return properties;
    }

    async elementTypes(params: {
        classIds: ReadonlyArray<ElementTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<ElementTypeIri, ElementTypeModel>> {
        const {classIds, signal} = params;
        const {defaultPrefix, schemaLabelProperty, classInfoQuery} = this.settings;

        let classes: Map<ElementTypeIri, ElementTypeModel>;
        if (classInfoQuery) {
            const ids = classIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
            const query = defaultPrefix + resolveTemplate(classInfoQuery, {
                ids,
                schemaLabelProperty,
            });
            const result = await this.executeSparqlSelect<ClassBinding>(query, {signal});
            classes = getClassInfo(result);
        } else {
            classes = new Map<ElementTypeIri, ElementTypeModel>();
            for (const classId of classIds) {
                classes.set(classId, {id: classId, label: []});
            }
        }

        if (this.options.prepareLabels) {
            await attachLabels(classes.values(), this.options.prepareLabels, signal);
        }

        return classes;
    }

    async linkTypes(params: {
        linkTypeIds: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<Map<LinkTypeIri, LinkTypeModel>> {
        const {linkTypeIds, signal} = params;
        const {defaultPrefix, schemaLabelProperty, linkTypesInfoQuery} = this.settings;

        let linkTypes: Map<LinkTypeIri, LinkTypeModel>;
        if (linkTypesInfoQuery) {
            const ids = linkTypeIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
            const query = defaultPrefix + resolveTemplate(linkTypesInfoQuery, {
                ids,
                schemaLabelProperty,
            });
            const result = await this.executeSparqlSelect<LinkTypeBinding>(query, {signal});
            linkTypes = getLinkTypes(result);
        } else {
            linkTypes = new Map<LinkTypeIri, LinkTypeModel>();
            for (const typeId of linkTypeIds) {
                linkTypes.set(typeId, {id: typeId, label: []});
            }
        }

        if (this.options.prepareLabels) {
            await attachLabels(linkTypes.values(), this.options.prepareLabels, signal);
        }

        return linkTypes;
    }

    async knownLinkTypes(params: {
        signal?: AbortSignal;
    }): Promise<LinkTypeModel[]> {
        const {signal} = params;
        const {defaultPrefix, schemaLabelProperty, linkTypesQuery, linkTypesPattern} = this.settings;
        if (!linkTypesQuery) {
            return [];
        }

        const query = defaultPrefix + resolveTemplate(linkTypesQuery, {
            linkTypesPattern,
            schemaLabelProperty,
        });
        const result = await this.executeSparqlSelect<LinkTypeBinding>(query, {signal});
        const linkTypes = getLinkTypes(result);

        if (this.options.prepareLabels) {
            await attachLabels(linkTypes.values(), this.options.prepareLabels, signal);
        }

        return Array.from(linkTypes.values());
    }

    async elements(params: {
        elementIds: ReadonlyArray<ElementIri>;
        signal?: AbortSignal;
    }): Promise<Map<ElementIri, ElementModel>> {
        const {elementIds, signal} = params;

        let triples: Rdf.Quad[];
        if (elementIds.length > 0) {
            const ids = elementIds.map(escapeIri).map(id => ` (${id})`).join(' ');
            const {defaultPrefix, dataLabelProperty, elementInfoQuery} = this.settings;
            const query = defaultPrefix + resolveTemplate(elementInfoQuery, {
                ids,
                dataLabelProperty,
                propertyConfigurations: this.formatPropertyInfo(),
            });
            triples = await this.executeSparqlConstruct(query);
        } else {
            triples = [];
        }

        const types = this.queryManyElementTypes(
            this.settings.propertyConfigurations.length > 0 ? elementIds : [],
            signal
        );

        const bindings = triplesToElementBinding(triples);
        const elementModels = getElementsInfo(
            bindings,
            await types,
            this.propertyByPredicate,
            this.openWorldProperties
        );

        if (this.options.prepareLabels) {
            await attachLabels(elementModels.values(), this.options.prepareLabels, signal);
        }

        if (this.options.prepareImages) {
            await prepareElementImages(elementModels, this.options.prepareImages, signal);
        } else if (this.options.imagePropertyUris && this.options.imagePropertyUris.length) {
            await this.attachImages(elementModels, this.options.imagePropertyUris, signal);
        }

        return elementModels;
    }

    private async attachImages(
        elements: Map<ElementIri, ElementModel>,
        types: ReadonlyArray<string>,
        signal: AbortSignal | undefined
    ): Promise<void> {
        const ids = Array.from(elements.keys(), id => ` ( ${escapeIri(id)} )`).join(' ');
        const typesString = types.map(escapeIri).map(id => ` ( ${id} )`).join(' ');

        const query = this.settings.defaultPrefix + `
            SELECT ?inst ?linkType ?image
            WHERE {{
                VALUES (?inst) {${ids}}
                VALUES (?linkType) {${typesString}}
                ${this.settings.imageQueryPattern}
            }}
        `;
        try {
            const bindings = await this.executeSparqlSelect<ElementImageBinding>(query, {signal});
            enrichElementsWithImages(bindings, elements);
        } catch (err) {
            console.error(err);
        }
    }

    async links(params: {
        elementIds: ReadonlyArray<ElementIri>;
        linkTypeIds?: ReadonlyArray<LinkTypeIri>;
        signal?: AbortSignal;
    }): Promise<LinkModel[]> {
        const {elementIds, linkTypeIds, signal} = params;
        const linkConfigurations = this.formatLinkLinks();

        let bindings: Promise<SparqlResponse<LinkBinding>>;
        if (elementIds.length > 0) {
            const ids = elementIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
            const linksInfoQuery =  this.settings.defaultPrefix + resolveTemplate(this.settings.linksInfoQuery, {
                ids,
                linkConfigurations,
            });
            bindings = this.executeSparqlSelect<LinkBinding>(linksInfoQuery, {signal});
        } else {
            bindings = Promise.resolve({
                head: {vars: []},
                results: {bindings: []},
            });
        }

        const types = this.queryManyElementTypes(
            // Optimization for common case without link configurations
            this.linkByPredicate.size === 0 ? [] : elementIds,
            signal
        );

        let linksInfo = getLinksInfo(
            await bindings,
            await types,
            this.linkByPredicate,
            this.openWorldLinks
        );
        if (linkTypeIds) {
            const allowedLinkTypes = new Set(linkTypeIds);
            linksInfo = linksInfo.filter(link => allowedLinkTypes.has(link.linkTypeId));
        }
        return linksInfo;
    }

    async connectedLinkStats(params: {
        elementId: ElementIri;
        inexactCount?: boolean;
        signal?: AbortSignal;
    }): Promise<LinkCount[]> {
        const {elementId, inexactCount, signal} = params;
        const {defaultPrefix, linkTypesOfQuery, linkTypesStatisticsQuery, filterTypePattern} = this.settings;

        const bindDirection = /\?direction\b/.test(linkTypesOfQuery);

        const elementIri = escapeIri(elementId);
        const forAll = this.formatLinkUnion(
            elementId, undefined, undefined, '?outObject', '?inObject', bindDirection
        );
        if (forAll.usePredicatePart) {
            forAll.unionParts.push(
                `{ ${elementIri} ?link ?outObject ${bindDirection ? 'BIND("out" AS ?direction)' : ''} }`
            );
            forAll.unionParts.push(
                `{ ?inObject ?link ${elementIri} ${bindDirection ? 'BIND("in" AS ?direction)' : ''} }`
            );
        }

        const query = defaultPrefix + resolveTemplate(linkTypesOfQuery, {
            elementIri,
            linkConfigurations: forAll.unionParts.join('\nUNION\n'),
        });

        const linkTypeBindings = await this.executeSparqlSelect<ConnectedLinkTypeBinding>(query, {signal});
        const hasConnectedDirection = linkTypeBindings.head.vars.includes('direction');
        const connectedLinkTypes = getConnectedLinkTypes(
            linkTypeBindings,
            this.linkByPredicate,
            this.openWorldLinks
        );

        const navigateElementFilterOut = this.acceptBlankNodes
            ? 'FILTER (IsIri(?outObject) || IsBlank(?outObject))'
            : 'FILTER IsIri(?outObject)';
        const navigateElementFilterIn = this.acceptBlankNodes
            ? 'FILTER (IsIri(?inObject) || IsBlank(?inObject))'
            : 'FILTER IsIri(?inObject)';

        const foundLinkStats: LinkCount[] = [];
        await Promise.all(connectedLinkTypes.map(async ({linkType, hasInLink, hasOutLink}) => {
            const linkConfig = this.linkById.get(linkType);
            let linkConfigurationOut: string;
            let linkConfigurationIn: string;

            if (!linkConfig || isDirectLink(linkConfig)) {
                const predicate = escapeIri(
                    linkConfig && isDirectLink(linkConfig) ? linkConfig.path : linkType
                );
                linkConfigurationOut = `${elementIri} ${predicate} ?outObject`;
                linkConfigurationIn = `?inObject ${predicate} ${elementIri}`;
            } else {
                linkConfigurationOut = this.formatLinkPath(linkConfig.path, elementIri, '?outObject');
                linkConfigurationIn = this.formatLinkPath(linkConfig.path, '?inObject', elementIri);
            }

            if (linkConfig && linkConfig.domain && linkConfig.domain.length > 0) {
                const commaSeparatedDomains = linkConfig.domain.map(escapeIri).join(', ');
                const restrictionOut = filterTypePattern.replace(/[?$]inst\b/g, elementIri);
                const restrictionIn = filterTypePattern.replace(/[?$]inst\b/g, '?inObject');
                linkConfigurationOut += ` { ${restrictionOut} FILTER(?class IN (${commaSeparatedDomains})) }`;
                linkConfigurationIn += ` { ${restrictionIn} FILTER(?class IN (${commaSeparatedDomains})) }`;
            }

            if (!linkTypesStatisticsQuery || (inexactCount && hasConnectedDirection)) {
                foundLinkStats.push({
                    id: linkType,
                    inCount: hasInLink ? 1 : 0,
                    outCount: hasOutLink ? 1 : 0,
                    inexact: true,
                });
            } else {
                const statsQuery = defaultPrefix + resolveTemplate(linkTypesStatisticsQuery, {
                    linkId: escapeIri(linkType),
                    elementIri,
                    linkConfigurationOut,
                    linkConfigurationIn,
                    navigateElementFilterOut,
                    navigateElementFilterIn,
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

    async lookup(baseParams: LookupParams): Promise<LinkedElement[]> {
        const {signal} = baseParams;
        const params: LookupParams = {
            ...baseParams,
            limit: baseParams.limit === undefined ? 100 : baseParams.limit,
        };

        // query types to match link configuration domains
        const types = this.querySingleElementTypes(
            params.refElementId && this.settings.linkConfigurations.length > 0
                ? params.refElementId : undefined,
            signal
        );

        const filterQuery = this.createFilterQuery(params);
        const bindings = await this.executeSparqlSelect<ElementBinding & FilterBinding>(filterQuery, {signal});

        const linkedElements = getFilteredData(
            bindings, await types, this.linkByPredicate, this.openWorldLinks
        );

        if (this.options.prepareLabels) {
            const models = linkedElements.map(linked => linked.element);
            await attachLabels(models, this.options.prepareLabels, signal);
        }

        return linkedElements;
    }

    private createFilterQuery(params: LookupParams): string {
        if (!params.refElementId && params.refElementLinkId) {
            throw new Error('Cannot execute refElementLink filter without refElement');
        }

        let outerProjection = '?inst ?class ?label ?blankType';
        let innerProjection = '?inst';

        let refQueryPart = '';
        let refQueryTypes = '';
        if (params.refElementId) {
            outerProjection += ' ?link ?direction';
            innerProjection += ' ?link ?direction';
            refQueryPart = this.createRefQueryPart({
                elementId: params.refElementId,
                linkId: params.refElementLinkId,
                direction: params.linkDirection,
            });

            if (this.settings.linkConfigurations.length > 0) {
                outerProjection += ' ?classAll';
                refQueryTypes = this.settings.filterTypePattern.replace(/[?$]class\b/g, '?classAll');
            }
        }

        let elementTypePart = '';
        if (params.elementTypeId) {
            const elementTypeIri = escapeIri(params.elementTypeId);
            elementTypePart = this.settings.filterTypePattern.replace(/[?$]class\b/g, elementTypeIri);
        }

        const {defaultPrefix, fullTextSearch, dataLabelProperty} = this.settings;

        let textSearchPart = '';
        if (params.text) {
            innerProjection += ' ?score';
            if (this.settings.fullTextSearch.extractLabel) {
                textSearchPart += sparqlExtractLabel('?inst', '?extractedLabel');
            }
            textSearchPart = resolveTemplate(fullTextSearch.queryPattern, {text: params.text, dataLabelProperty});
        }

        let limitPart = '';
        if (typeof params.limit === 'number') {
            limitPart = `LIMIT ${params.limit}`;
        }

        return `${defaultPrefix}
            ${fullTextSearch.prefix}

        SELECT ${outerProjection}
        WHERE {
            {
                SELECT DISTINCT ${innerProjection} WHERE {
                    ${elementTypePart}
                    ${refQueryPart}
                    ${textSearchPart}
                    ${this.settings.filterAdditionalRestriction}
                }
                ${textSearchPart ? 'ORDER BY DESC(?score)' : ''}
                ${limitPart}
            }
            ${refQueryTypes}
            ${resolveTemplate(this.settings.filterElementInfoPattern, {dataLabelProperty})}
        } ${textSearchPart ? 'ORDER BY DESC(?score)' : ''}
        `;
    }

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

    protected createRefQueryPart(params: { elementId: ElementIri; linkId?: LinkTypeIri; direction?: 'in' | 'out' }) {
        const {elementId, linkId, direction} = params;

        const {unionParts, usePredicatePart} = this.formatLinkUnion(
            elementId, linkId, direction, '?inst', '?inst', true
        );

        if (usePredicatePart) {
            const refElementIRI = escapeIri(params.elementId);
            let refLinkType: string | undefined;
            if (linkId) {
                const link = this.linkById.get(linkId);
                refLinkType = link && isDirectLink(link) ? escapeIri(link.path) : escapeIri(linkId);
            }

            const linkPattern = refLinkType || '?link';
            const bindType = refLinkType ? `BIND(${refLinkType} as ?link)` : '';
            // FILTER(IsIri()) is used to prevent blank nodes appearing in results
            const blankFilter = this.acceptBlankNodes
                ? 'FILTER(isIri(?inst) || isBlank(?inst))'
                : 'FILTER(isIri(?inst))';

            if (!direction || direction === 'out') {
                unionParts.push(`{ ${refElementIRI} ${linkPattern} ?inst BIND("out" as ?direction) ${bindType} ${blankFilter} }`);
            }
            if (!direction || direction === 'in') {
                unionParts.push(`{ ?inst ${linkPattern} ${refElementIRI} BIND("in" as ?direction) ${bindType} ${blankFilter} }`);
            }
        }

        let resultPattern = unionParts.length === 0 ? 'FILTER(false)' : unionParts.join('\nUNION\n');

        const useAllLinksPattern = !linkId && this.settings.filterRefElementLinkPattern.length > 0;
        if (useAllLinksPattern) {
            resultPattern += `\n${this.settings.filterRefElementLinkPattern}`;
        }

        return resultPattern;
    }

    private formatLinkUnion(
        refElementIri: ElementIri,
        linkIri: LinkTypeIri | undefined,
        direction: 'in' | 'out' | undefined,
        outElementVar: string,
        inElementVar: string,
        bindDirection: boolean
    ) {
        const {linkConfigurations} = this.settings;
        const fixedIri = escapeIri(refElementIri);

        const unionParts: string[] = [];
        let hasDirectLink = false;

        for (const link of linkConfigurations) {
            if (linkIri && link.id !== linkIri) { continue; }
            if (isDirectLink(link)) {
                hasDirectLink = true;
            } else {
                const linkType = escapeIri(link.id);
                if (!direction || direction === 'out') {
                    const path = this.formatLinkPath(link.path, fixedIri, outElementVar);
                    const boundedDirection = bindDirection ? 'BIND("out" as ?direction) ' : '';
                    unionParts.push(
                        `{ ${path} BIND(${linkType} as ?link) ${boundedDirection}}`
                    );
                }
                if (!direction || direction === 'in') {
                    const path = this.formatLinkPath(link.path, inElementVar, fixedIri);
                    const boundedDirection = bindDirection ? 'BIND("in" as ?direction) ' : '';
                    unionParts.push(
                        `{ ${path} BIND(${linkType} as ?link) ${boundedDirection}}`
                    );
                }
            }
        }

        const usePredicatePart = this.openWorldLinks || hasDirectLink;
        return {unionParts, usePredicatePart};
    }

    formatLinkLinks(): string {
        const unionParts: string[] = [];
        let hasDirectLink = false;
        for (const link of this.settings.linkConfigurations) {
            if (isDirectLink(link)) {
                hasDirectLink = true;
            } else {
                const linkType = escapeIri(link.id);
                unionParts.push(
                    `${this.formatLinkPath(link.path, '?source', '?target')} BIND(${linkType} as ?type)`
                );
            }
        }

        const usePredicatePart = this.openWorldLinks || hasDirectLink;
        if (usePredicatePart) {
            unionParts.push('?source ?type ?target');
        }

        return (
            unionParts.length === 0 ? '' :
            unionParts.length === 1 ? unionParts[0] :
            '{ ' + unionParts.join(' }\nUNION\n{ ') + ' }'
        );
    }

    formatLinkPath(path: string, source: string, target: string): string {
        return path.replace(/[?$]source\b/g, source).replace(/[?$]target\b/g, target);
    }

    formatPropertyInfo(): string {
        const unionParts: string[] = [];
        let hasDirectProperty = false;
        for (const property of this.settings.propertyConfigurations) {
            if (isDirectProperty(property)) {
                hasDirectProperty = true;
            } else {
                const propType = escapeIri(property.id);
                const formatted = this.formatPropertyPath(property.path, '?inst', '?propValue');
                unionParts.push(
                    `{ ${formatted} BIND(${propType} as ?propType) }`
                );
            }
        }

        const usePredicatePart = this.openWorldProperties || hasDirectProperty;
        if (usePredicatePart) {
            unionParts.push('{ ?inst ?propType ?propValue }');
        }

        return unionParts.join('\nUNION\n');
    }

    formatPropertyPath(path: string, subject: string, value: string): string {
        return path.replace(/[?$]inst\b/g, subject).replace(/[?$]value\b/g, value);
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
        const ids = elements.map(iri => `(${escapeIri(iri)})`).join(' ');

        const queryTemplate = 'SELECT ?inst ?class { VALUES(?inst) { ${ids} } ${filterTypePattern} }';
        const query = resolveTemplate(queryTemplate, {ids, filterTypePattern});
        const response = await this.executeSparqlSelect<ElementTypeBinding>(query, {signal});

        return getElementTypes(response);
    }
}

interface LabeledItem {
    id: string;
    label: ReadonlyArray<Rdf.Literal>;
}

async function attachLabels(
    items: Iterable<LabeledItem>,
    fetchLabels: NonNullable<SparqlDataProviderOptions['prepareLabels']>,
    signal: AbortSignal | undefined
): Promise<void> {
    const resources = new Set<string>();
    for (const item of items) {
        resources.add(item.id);
    }
    const labels = await fetchLabels(resources, signal);
    for (const item of items) {
        const itemLabels = labels.get(item.id);
        if (itemLabels) {
            item.label = itemLabels;
        }
    }
}

function prepareElementImages(
    elements: Map<ElementIri, ElementModel>,
    fetchImages: NonNullable<SparqlDataProviderOptions['prepareImages']>,
    signal: AbortSignal | undefined
): Promise<void> {
    return fetchImages(elements.values(), signal).then(images => {
        for (const [iri, image] of images) {
            const model = elements.get(iri) as { image: string | undefined };
            if (model) {
                model.image = image;
            }
        }
    });
}

function resolveTemplate(template: string, values: { [key: string]: string | undefined }) {
    let result = template;
    for (const replaceKey in values) {
        if (!Object.prototype.hasOwnProperty.call(values, replaceKey)) { continue; }
        const replaceValue = values[replaceKey];
        if (replaceValue) {
            result = result.replace(new RegExp('\\${' + replaceKey + '}', 'g'), replaceValue);
        }
    }
    return result;
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
        const sparqlResponse: SparqlResponse<Binding> = await response.json();
        return mapSparqlResponseIntoRdfJs(sparqlResponse, factory);
    } else {
        const error = new Error(response.statusText);
        (error as any).response = response;
        throw error;
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
        const error = new Error(response.statusText);
        (error as any).response = response;
        throw error;
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
    headers: any;
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

function sparqlExtractLabel(subject: string, label: string): string {
    return  `
        BIND ( str( ${subject} ) as ?uriStr)
        BIND ( strafter(?uriStr, "#") as ?label3)
        BIND ( strafter(strafter(?uriStr, "//"), "/") as ?label6)
        BIND ( strafter(?label6, "/") as ?label5)
        BIND ( strafter(?label5, "/") as ?label4)
        BIND (if (?label3 != "", ?label3,
            if (?label4 != "", ?label4,
            if (?label5 != "", ?label5, ?label6))) as ${label})
    `;
}

function escapeIri(iri: string) {
    if (typeof iri !== 'string') {
        throw new Error(`Cannot escape IRI of type "${typeof iri}"`);
    }
    return `<${iri}>`;
}
