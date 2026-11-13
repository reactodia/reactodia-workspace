import { HashSet } from '@reactodia/hashmap';

import { multimapArrayAdd } from '../../coreUtils/collections';

import * as Rdf from '../rdf/rdfModel';

import { LinkTypeIri, PropertyTypeIri } from '../model';
import {
    DataProviderLookupParams, LookupPattern, LookupPatternHasType, LookupPatternConnectedTo,
    LookupPatternHasProperty, LookupPatternWithText, lookupPatternOf,
} from '../dataProvider';

import {
    SparqlDataProviderSettings, FullTextSearchSettings, LinkConfiguration, PropertyConfiguration,
} from './sparqlDataProviderSettings';

interface SparqlGeneratorOptions {
    readonly acceptBlankNodes: boolean;
}

export class SparqlGenerator {
    private readonly acceptBlankNodes: boolean;

    readonly linkByPredicate = new Map<string, LinkConfiguration[]>();
    private linkById = new Map<LinkTypeIri, LinkConfiguration>();
    readonly openWorldLinks: boolean;

    readonly propertyByPredicate = new Map<string, PropertyConfiguration[]>();
    readonly openWorldProperties: boolean;

    constructor(
        private readonly factory: Rdf.DataFactory,
        private readonly settings: SparqlDataProviderSettings,
        options: SparqlGeneratorOptions
    ) {
        const {acceptBlankNodes} = options;
        this.acceptBlankNodes = acceptBlankNodes;

        for (const link of settings.linkConfigurations) {
            this.linkById.set(link.id, link);
            const predicate = isDirectLink(link) ? link.path : link.id;
            multimapArrayAdd(this.linkByPredicate, predicate, link);
        }
        this.openWorldLinks = settings.linkConfigurations.length === 0 ||
            Boolean(settings.openWorldLinks);

        for (const property of settings.propertyConfigurations) {
            const predicate = isDirectProperty(property) ? property.path : property.id;
            multimapArrayAdd(this.propertyByPredicate, predicate, property);
        }
        this.openWorldProperties = settings.propertyConfigurations.length === 0 ||
            Boolean(settings.openWorldProperties);
    }

    formatLanguageFilter(variable: string): string {
        return formatLanguageFilter(variable, this.settings.filterOnlyLanguages);
    }

    generateLookupSchemaQuery(params: {
        lookupQuery: string;
        textSearchSettings: FullTextSearchSettings;
        itemTerm: Rdf.Variable;
        text: string;
        limit?: number;
    }): string {
        const {lookupQuery, textSearchSettings, itemTerm, text, limit} = params;
        const {defaultPrefix, dataLabelProperty, schemaLabelProperty} = this.settings;

        let filterByText = '';
        if (textSearchSettings.extractLabel) {
            filterByText += sparqlExtractLabel(escapeTerm(itemTerm), '?extractedLabel');
        }
        filterByText += resolveTemplate(textSearchSettings.queryPattern, {
            text: text,
            dataLabelProperty,
            schemaLabelProperty,
        });
        const prefix = defaultPrefix + textSearchSettings.prefix;
        const query = prefix + resolveTemplate(lookupQuery, {
            schemaLabelProperty,
            labelLanguageFilter: this.formatLanguageFilter('?label'),
            filterByText: filterByText.replace(/[?$]inst\b/g, escapeTerm(itemTerm)),
            limit: formatLimit(limit),
        });
        return query;
    }

    generateLinkTypesOfQuery(params: {
        elementTerm: Rdf.NamedNode;
        targetIn: Rdf.Variable;
        targetOut: Rdf.Variable;
    }): { query: string; bindDirection: boolean } {
        const {elementTerm, targetIn, targetOut} = params;
        const {defaultPrefix, linkTypesOfQuery} = this.settings;
        
        const bindDirection = /\?direction\b/.test(linkTypesOfQuery);

        const forAll = this.formatLinkUnion({
            sourceTerm: elementTerm,
            targetIn: targetOut,
            targetOut: targetIn,
            withProjection: true,
        });
        if (forAll.usePredicatePart) {
            const bindOut = bindDirection ? 'BIND("out" AS ?direction)' : '';
            const bindIn = bindDirection ? 'BIND("in" AS ?direction)' : '';
            forAll.unionParts.push(
                `{ ${escapeTerm(elementTerm)} ?link ${escapeTerm(targetOut)} ${bindOut} }`
            );
            forAll.unionParts.push(
                `{ ${escapeTerm(targetIn)} ?link ${escapeTerm(elementTerm)} ${bindIn} }`
            );
        }

        const query = defaultPrefix + resolveTemplate(linkTypesOfQuery, {
            elementIri: escapeTerm(elementTerm),
            linkConfigurations: forAll.unionParts.join('\nUNION\n'),
        });
        return {query, bindDirection};
    }

    generateLinkStatsQuery(params: {
        elementTerm: Rdf.NamedNode;
        targetIn: Rdf.Variable;
        targetOut: Rdf.Variable;
        linkType: LinkTypeIri;
        navigateElementFilterOut: string;
        navigateElementFilterIn: string;
    }): string {
        const {
            elementTerm, targetIn, targetOut, linkType,
            navigateElementFilterOut, navigateElementFilterIn,
        } = params;
        const {defaultPrefix, filterTypePattern, linkTypesStatisticsQuery} = this.settings;

        const linkConfig = this.linkById.get(linkType);
        let linkConfigurationOut: string;
        let linkConfigurationIn: string;

        if (!linkConfig || isDirectLink(linkConfig)) {
            const predicate = escapeIri(
                linkConfig && isDirectLink(linkConfig) ? linkConfig.path : linkType
            );
            linkConfigurationOut = `${escapeTerm(elementTerm)} ${predicate} ${escapeTerm(targetOut)}`;
            linkConfigurationIn = `${escapeTerm(targetIn)} ${predicate} ${escapeTerm(elementTerm)}`;
        } else {
            linkConfigurationOut = this.formatLinkPath(linkConfig.path, elementTerm, targetOut);
            linkConfigurationIn = this.formatLinkPath(linkConfig.path, targetIn, elementTerm);
        }

        if (linkConfig && linkConfig.domain && linkConfig.domain.length > 0) {
            const commaSeparatedDomains = linkConfig.domain.map(escapeIri).join(', ');
            const restrictionOut = filterTypePattern.replace(/[?$]inst\b/g, escapeTerm(elementTerm));
            const restrictionIn = filterTypePattern.replace(/[?$]inst\b/g, escapeTerm(targetIn));
            linkConfigurationOut += ` { ${restrictionOut} FILTER(?class IN (${commaSeparatedDomains})) }`;
            linkConfigurationIn += ` { ${restrictionIn} FILTER(?class IN (${commaSeparatedDomains})) }`;
        }

        const query = defaultPrefix + resolveTemplate(linkTypesStatisticsQuery, {
            linkId: escapeIri(linkType),
            elementIri: escapeTerm(elementTerm),
            linkConfigurationOut,
            linkConfigurationIn,
            navigateElementFilterOut,
            navigateElementFilterIn,
        });
        return query;
    }

    formatLinkStatsNavigateFilters() {
        const navigateElementFilterOut = this.acceptBlankNodes
            ? 'FILTER (IsIri(?outObject) || IsBlank(?outObject))'
            : 'FILTER IsIri(?outObject)';
        // Specifically use isBlank() as opposed to isIri() for filtering to avoid 
        // a full scan on some endpoints (e.g. Virtuoso)
        const navigateElementFilterIn = this.acceptBlankNodes
            ? ''
            : 'FILTER(!isBlank(?inObject))';
        return {navigateElementFilterIn, navigateElementFilterOut};
    }

    supportsLookupPatterns(): boolean {
        const {lookupQuery} = this.settings;
        return /\${filterByPattern}/.test(lookupQuery);
    }

    generateLookupQuery(params: DataProviderLookupParams): string {
        const {
            defaultPrefix, dataLabelProperty, lookupQuery, filterAdditionalRestriction,
            filterOnlyLanguages, filterElementInfoPattern, fullTextSearch,
        } = this.settings;

        let outerProjection = '?inst ?class ?label';
        let innerProjection = '?inst';

        const entityTerm = this.factory.variable!('inst');
        const pattern = lookupPatternOf(params);

        const valueSets = new Map<string, HashSet<Rdf.NamedNode | Rdf.Literal>>();
        const projections = new Set<'link' | 'direction' | 'score'>();

        const generateParams = {
            entityTerm,
            path: '',
            valueSets,
            projections,
            withProjection: true,
        } as const;

        const generatedPattern = this.generatePattern(pattern, generateParams);
        const hasFilterByPattern = /\${filterByPattern}/.test(lookupQuery);

        let prependedValueSets = '';
        for (const [variableName, setTerms] of valueSets) {
            const valueSetContent = formatValueClauseContent(setTerms);
            prependedValueSets += `VALUES(?${variableName}) { ${valueSetContent} }\n`;
        }

        let queryTypes = '';
        if (projections.has('link')) {
            outerProjection += ' ?link';
            innerProjection += ' ?link';
            if (this.settings.linkConfigurations.length > 0) {
                outerProjection += ' ?classAll';
                queryTypes = this.settings.filterTypePattern.replace(/[?$]class\b/g, '?classAll');
            }
        }

        if (projections.has('direction')) {
            outerProjection += ' ?direction';
            innerProjection += ' ?direction';
        }

        let orderBy = '';
        if (projections.has('score')) {
            innerProjection += ' ?score';
            orderBy = 'ORDER BY DESC(?score)';
        }

        const queryElementInfo = resolveTemplate(filterElementInfoPattern, {
            dataLabelProperty,
            labelLanguageFilter: formatLanguageFilter('?label', filterOnlyLanguages),
        });

        const limitPart = formatLimit(params.limit);

        const filterByPattern = prependedValueSets + generatedPattern;

        const completePrefix = defaultPrefix + '\n' + fullTextSearch.prefix + '\n';
        return completePrefix + resolveTemplate(lookupQuery, {
            innerProjection,
            outerProjection,
            filterInnerPrelude: this.settings.filterInnerPrelude,
            filterByType: '',
            filterByRefElementLink: '',
            filterByText: '',
            filterByPattern,
            filterAdditionalRestriction: hasFilterByPattern
                ? filterAdditionalRestriction
                : `${filterByPattern}\n${filterAdditionalRestriction}`,
            orderBy,
            limit: limitPart,
            queryTypes,
            queryElementInfo,
        });
    }

    private generatePattern(
        pattern: LookupPattern,
        params: {
            path: string;
            entityTerm: Rdf.Variable;
            valueSets: Map<string, HashSet<Rdf.NamedNode | Rdf.Literal>>;
            projections: Set<'link' | 'direction' | 'score'>;
            withProjection?: boolean;
        }
    ): string {
        const {path, entityTerm, valueSets, projections, withProjection} = params;
        switch (pattern.type) {
            case 'allOf':
            case 'anyOf': {
                if (pattern.patterns.length === 0) {
                    return pattern.type === 'allOf' ? 'FILTER(false)' : '';
                }
                const allValues = new Map<string, HashSet<Rdf.NamedNode | Rdf.Literal>>();
                const parts = pattern.patterns.map((branch, index) => {
                    const branchValues = new Map<string, HashSet<Rdf.NamedNode | Rdf.Literal>>();
                    const generatedBranch = this.generatePattern(branch, {
                        path: `${path}_${index}`,
                        entityTerm,
                        valueSets: branchValues,
                        projections,
                        withProjection,
                    });
                    for (const [setName, setValues] of branchValues) {
                        const existing = allValues.get(setName);
                        if (existing) {
                            if (pattern.type === 'allOf') {
                                keepOnlyIntersection(existing, setValues);
                                
                            } else {
                                // Union with existing
                                for (const item of setValues) {
                                    existing.add(item);
                                }
                            }
                        } else {
                            allValues.set(setName, setValues);
                        }
                    }
                    return generatedBranch;
                });

                for (const [setName, setValues] of allValues) {
                    if (valueSets.has(setName)) {
                        throw new Error('Reactodia: nested patterns cannot shadow value sets');
                    }
                    valueSets.set(setName, setValues);
                }

                return '{\n' + parts.join(pattern.type === 'allOf' ? '\n' : '}\nUNION\n{') + '\n}';
            }
            case 'hasType': {
                const part = replaceVariables(this.settings.filterTypePattern, varName => {
                    if (varName === 'inst') {
                        return entityTerm;
                    } else if (varName === 'class') {
                        return this.factory.namedNode(pattern.elementType);
                    } else {
                        return this.factory.variable!(`${varName}${path}`);
                    }
                });
                return part;
            }
            case 'connectedTo': {
                const parts: string[] = [];
                const targetTerm =
                    pattern.target?.type === 'fromValues' && pattern.target.values.length === 1
                        ? this.factory.namedNode(pattern.target.values[0])
                        : this.factory.variable!(`connectedTo_target${path}`);
                parts.push(
                    this.generateConnectedToPattern(pattern, {
                        sourceTerm: entityTerm,
                        targetTerm,
                        predicateTerm: withProjection
                            ? this.factory.variable!('link')
                            : this.factory.variable!(`connectedTo_link${path}`),
                        withProjection,
                    })
                );
                if (withProjection) {
                    projections.add('link');
                    projections.add('direction');
                }
                if (pattern.target && targetTerm.termType === 'Variable') {
                    parts.push(
                        this.generatePattern(pattern.target, {
                            path: `${path}_target`,
                            entityTerm: targetTerm,
                            valueSets,
                            projections,
                        })
                    );
                }
                return parts.join('\n');
            }
            case 'fromValues': {
                const valueSet = new HashSet(
                    Rdf.hashTerm,
                    Rdf.equalTerms,
                    pattern.values.map(v => this.factory.namedNode(v))
                );
                valueSets.set(entityTerm.value, valueSet);
                return '';
            }
            case 'hasProperty': {
                const parts: string[] = [];
                const valueTerm = this.factory.variable!(`hasProperty_value${path}`);
                parts.push(
                    this.generateHasPropertyPattern(pattern, {
                        entityTerm,
                        valueTerm,
                        predicateTerm: this.factory.variable!(`connectedTo_propType${path}`),
                    })
                );
                if (pattern.values && pattern.values.length > 0) {
                    const valueSet = new HashSet(Rdf.hashTerm, Rdf.equalTerms, pattern.values);
                    valueSets.set(entityTerm.value, valueSet);
                }
                return parts.join('\n');
            }
            case 'withText': {
                const scoreTerm = withProjection
                    ? this.factory.variable!('score')
                    : this.factory.variable!(`withText_score${path}`);
                if (withProjection) {
                    projections.add('score');
                }
                return this.generateWithTextPattern(pattern, {
                    entityTerm,
                    labelTerm: this.factory.variable!(`withText_label${path}`),
                    scoreTerm,
                });
            }
            default: {
                throw new Error(
                    `Reactodia: unknown lookup pattern type "${(pattern as LookupPattern).type}"`
                );
            }
        }
    }

    private generateConnectedToPattern(
        pattern: LookupPatternConnectedTo,
        params: {
            sourceTerm: Rdf.Variable;
            targetTerm: Rdf.Variable | Rdf.NamedNode;
            predicateTerm: Rdf.Variable;
            withProjection?: boolean;
        }
    ): string {
        const {sourceTerm, targetTerm, predicateTerm, withProjection} = params;

        const {linkType, linkDirection} = pattern;
        const {unionParts, usePredicatePart} = this.formatLinkUnion({
            sourceTerm: targetTerm,
            targetIn: sourceTerm,
            targetOut: sourceTerm,
            linkType,
            linkDirection,
            withProjection
        });

        if (usePredicatePart) {
            const source = escapeTerm(sourceTerm);
            const target = escapeTerm(targetTerm);
            let refLinkType: string | undefined;
            if (linkType) {
                const link = this.linkById.get(linkType);
                refLinkType = link && isDirectLink(link)
                    ? escapeIri(link.path)
                    : escapeIri(linkType);
            }

            const linkPattern = refLinkType || escapeTerm(predicateTerm);
            const bindType = refLinkType ? `BIND(${refLinkType} as ${escapeTerm(predicateTerm)})` : '';
            // Specifically use isBlank() as opposed to isIri() when possible for filtering
            // to avoid a full scan on some endpoints (e.g. Virtuoso)
            const outFilter = this.acceptBlankNodes
                ? `FILTER(isIri(${source}) || isBlank(${source}))`
                : `FILTER(isIri(${source}))`;
            const inFilter = this.acceptBlankNodes
                ? ''
                : `FILTER(!isBlank(${source}))`;

            if (!linkDirection || linkDirection === 'out') {
                const binds = withProjection ? `BIND("out" as ?direction) ${bindType}` : '';
                unionParts.push(`{ ${target} ${linkPattern} ${source} ${binds} ${outFilter} }`);
            }
            if (!linkDirection || linkDirection === 'in') {
                const binds = withProjection ? `BIND("in" as ?direction) ${bindType}` : '';
                unionParts.push(`{ ${source} ${linkPattern} ${target} ${binds} ${inFilter} }`);
            }
        }

        let resultPattern = unionParts.length === 0 ? 'FILTER(false)' : unionParts.join('\nUNION\n');

        const useAllLinksPattern = !linkType && this.settings.filterRefElementLinkPattern.length > 0;
        if (useAllLinksPattern) {
            resultPattern += `\n${this.settings.filterRefElementLinkPattern}`;
        }

        return resultPattern;
    }

    private formatLinkUnion(params: {
        sourceTerm: Rdf.Variable | Rdf.NamedNode;
        targetIn: Rdf.Variable;
        targetOut: Rdf.Variable;
        linkType?: LinkTypeIri;
        linkDirection?: 'in' | 'out';
        withProjection?: boolean;
    }) {
        const {sourceTerm, targetIn, targetOut, linkType, linkDirection, withProjection} = params;
        const {linkConfigurations} = this.settings;

        const unionParts: string[] = [];
        let hasDirectLink = false;

        for (const link of linkConfigurations) {
            if (linkType && link.id !== linkType) {
                continue;
            }

            if (isDirectLink(link)) {
                hasDirectLink = true;
            } else {
                const linkType = escapeIri(link.id);
                if (!linkDirection || linkDirection === 'out') {
                    const path = this.formatLinkPath(link.path, sourceTerm, targetOut);
                    const binds = withProjection
                        ? `BIND(${linkType} as ?link) BIND("out" as ?direction)` : '';
                    unionParts.push(`{ ${path} ${binds} }`);
                }
                if (!linkDirection || linkDirection === 'in') {
                    const path = this.formatLinkPath(link.path, targetIn, sourceTerm);
                    const binds = withProjection
                        ? `BIND(${linkType} as ?link) BIND("in" as ?direction)` : '';
                    unionParts.push(`{ ${path} ${binds} }`);
                }
            }
        }

        const usePredicatePart = this.openWorldLinks || hasDirectLink;
        return {unionParts, usePredicatePart};
    }

    formatLinkLinks(): string {
        const sourceTerm = this.factory.variable!('source');
        const targetTerm = this.factory.variable!('target');

        const unionParts: string[] = [];
        let hasDirectLink = false;
        for (const link of this.settings.linkConfigurations) {
            if (isDirectLink(link)) {
                hasDirectLink = true;
            } else {
                const linkType = escapeIri(link.id);
                unionParts.push(
                    `${this.formatLinkPath(link.path, sourceTerm, targetTerm)} BIND(${linkType} as ?type)`
                );
            }
        }

        const usePredicatePart = this.openWorldLinks || hasDirectLink;
        if (usePredicatePart) {
            unionParts.push(`${escapeTerm(sourceTerm)} ?type ${escapeTerm(targetTerm)}`);
        }

        return (
            unionParts.length === 0 ? '' :
            unionParts.length === 1 ? unionParts[0] :
            '{ ' + unionParts.join(' }\nUNION\n{ ') + ' }'
        );
    }

    private formatLinkPath(
        path: string,
        source: Rdf.Variable | Rdf.NamedNode,
        target: Rdf.Variable | Rdf.NamedNode
    ): string {
        return replaceVariables(path, varName => {
            if (varName === 'source') {
                return source;
            } else if (varName === 'target') {
                return target;
            }
            return undefined;
        });
    }

    private generateHasPropertyPattern(
        pattern: LookupPatternHasProperty,
        params: {
            entityTerm: Rdf.Variable;
            valueTerm: Rdf.Variable;
            predicateTerm: Rdf.Variable;
            withProjection?: boolean;
        }
    ): string {
        const {entityTerm, valueTerm, predicateTerm, withProjection} = params;
        return this.formatPropertyUnion({
            entityTerm,
            valueTerm,
            predicateTerm,
            propertyType: pattern.propertyType,
            filterByValueType: true,
            withProjection,
        });
    }

    formatPropertyUnion(params: {
        entityTerm: Rdf.Variable;
        valueTerm: Rdf.Variable;
        predicateTerm: Rdf.Variable;
        propertyType?: PropertyTypeIri;
        filterByValueType?: boolean;
        withProjection?: boolean;
    }): string {
        const {
            entityTerm, valueTerm, predicateTerm, propertyType, filterByValueType, withProjection,
        } = params;

        const unionParts: string[] = [];
        let hasDirectProperty = false;
        for (const property of this.settings.propertyConfigurations) {
            if (propertyType && property.id !== propertyType) {
                continue;
            }

            if (isDirectProperty(property)) {
                hasDirectProperty = true;
            } else {
                const propType = escapeIri(property.id);
                const formatted = this.formatPropertyPath(property.path, entityTerm, valueTerm);
                const binds = withProjection
                    ? `BIND(${propType} as ${escapeTerm(predicateTerm)})`
                    : '';
                unionParts.push(`{ ${formatted} ${binds} }`);
            }
        }

        const usePredicatePart = this.openWorldProperties || hasDirectProperty;
        if (usePredicatePart) {
            const entity = escapeTerm(entityTerm);
            const predicate = escapeTerm(predicateTerm);
            const value = escapeTerm(valueTerm);

            if (propertyType) {
                const binds = withProjection
                    ? `BIND(${escapeIri(propertyType)} as ${predicate})`
                    : '';
                unionParts.push(`{ ${entity} ${escapeIri(propertyType)} ${value} ${binds} }`);
            } else {
                let filter = '';
                if (filterByValueType) {
                    const directPredicates = new Set<PropertyTypeIri>();
                    for (const property of this.settings.propertyConfigurations) {
                        if (isDirectProperty(property)) {
                            directPredicates.add(property.path);
                        }
                    }
                    const commaSeparatedPredicates = Array.from(directPredicates, escapeIri).join(', ');
                    filter = commaSeparatedPredicates
                        ? `FILTER(isLiteral(${value}) || ${predicate} IN (${commaSeparatedPredicates}))`
                        : `FILTER(isLiteral(${value}))`;
                }
                unionParts.push(`{ ${entity} ${predicate} ${value} ${filter} }`);
            }
        }

        return unionParts.join('\nUNION\n');
    }

    private formatPropertyPath(path: string, subject: Rdf.Variable, value: Rdf.Variable): string {
        return replaceVariables(path, varName => {
            if (varName === 'inst') {
                return subject;
            } else if (varName === 'value') {
                return value;
            }
            return undefined;
        });
    }

    private generateWithTextPattern(
        pattern: LookupPatternWithText,
        params: {
            entityTerm: Rdf.Variable;
            labelTerm: Rdf.Variable;
            scoreTerm: Rdf.Variable;
        }
    ) {
        const {entityTerm, labelTerm, scoreTerm} = params;
        const parts: string[] = [];
        if (this.settings.fullTextSearch.extractLabel) {
            parts.push(sparqlExtractLabel(escapeTerm(entityTerm), escapeTerm(labelTerm)));
        }
        
        const template = replaceVariables(this.settings.fullTextSearch.queryPattern, varName => {
            if (varName === 'extractedLabel') {
                return labelTerm;
            } else if (varName === 'score') {
                return scoreTerm;
            }
            return undefined;
        });
        parts.push(
            resolveTemplate(template, {
                text: pattern.text,
                dataLabelProperty: this.settings.dataLabelProperty,
                schemaLabelProperty: this.settings.schemaLabelProperty,
            })
        );
        return parts.join('\n');
    }
}

export function isDirectLink(link: LinkConfiguration) {
    // link configuration is path-based if includes any variables
    const pathBased = /[?$][a-zA-Z]+\b/.test(link.path);
    return !pathBased;
}

export function isDirectProperty(property: PropertyConfiguration) {
    // property configuration is path-based if includes any variables
    const pathBased = /[?$][a-zA-Z]+\b/.test(property.path);
    return !pathBased;
}

export function resolveTemplate(template: string, values: { [key: string]: string | undefined }) {
    let result = template;
    for (const replaceKey in values) {
        if (!Object.prototype.hasOwnProperty.call(values, replaceKey)) { continue; }
        const replaceValue = values[replaceKey] || '';
        result = result.replace(new RegExp('\\${' + replaceKey + '}', 'g'), replaceValue);
    }
    return result;
}

export function replaceVariables(
    pattern: string,
    replacer: (varName: string) => Rdf.Variable | Rdf.NamedNode | undefined
): string {
    return pattern.replace(/[?$](.+?)\b/g, (original: string, varName: string) => {
        const replaceWith = replacer(varName);
        return replaceWith ? escapeTerm(replaceWith) : original;
    });
}

function formatLanguageFilter(
    variable: string,
    languages: ReadonlyArray<string> | undefined
): string {
    if (!languages) {
        return '';
    }
    const parts = [`FILTER(!isLiteral(${variable}) || lang(${variable}) = ""`];
    for (const language of languages) {
        parts.push(` || lang(${variable}) = "${language}"`);
    }
    parts.push(')');
    return parts.join('');
}

function sparqlExtractLabel(subject: string, label: string): string {
    return `
        BIND(str(${subject}) as ?uriStr)
        BIND(strafter(?uriStr, "#") as ?label3)
        BIND(strafter(strafter(?uriStr, "//"), "/") as ?label6)
        BIND(strafter(?label6, "/") as ?label5)
        BIND(strafter(?label5, "/") as ?label4)
        BIND(if (?label3 != "", ?label3,
            if (?label4 != "", ?label4,
            if (?label5 != "", ?label5, ?label6))) as ${label})
    `;
}

export function formatValueClauseContent(
    terms: Iterable<string | Rdf.NamedNode | Rdf.Literal>
): string {
    return Array.from(terms, term => {
        const escaped = typeof term === 'string' ? escapeIri(term) : escapeTerm(term);
        return `(${escaped})`;
    }).join(' ');
}

function formatLimit(limit: number | null | undefined): string {
    return typeof limit === 'number' ? `LIMIT ${limit}` : '';
}

export function escapeTerm(term: Rdf.Term) {
    return Rdf.termToString(term);
}

export function escapeIri(iri: string) {
    if (typeof iri !== 'string') {
        throw new Error(`Cannot escape IRI of type "${typeof iri}"`);
    }
    return escapeTerm(Rdf.DefaultDataFactory.namedNode(iri));
}

function findPattern<T extends LookupPattern>(
    root: LookupPattern,
    matches: (p: LookupPattern) => p is T
): T | undefined {
    if (matches(root)) {
        return root;
    } else if (root.type === 'allOf') {
        for (const pattern of root.patterns) {
            const found = findPattern(pattern, matches);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
}

interface BasicSet<T> extends Iterable<T> {
    has(item: T): boolean;
    add(item: T): this;
    delete(item: T): boolean;
}

function keepOnlyIntersection<T>(baseSet: BasicSet<T>, otherSet: BasicSet<T>): void {
    const toRemove: T[] = [];
    for (const item of baseSet) {
        if (!otherSet.has(item)) {
            toRemove.push(item);
        }
    }
    for (const removed of toRemove) {
        baseSet.delete(removed);
    }
}
