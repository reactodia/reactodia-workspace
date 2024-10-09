/**
 * Dataset-schema specific settings for `SparqlDataProvider`.
 *
 * @category Data
 */
export interface SparqlDataProviderSettings {
    /**
     * Default prefix to be used in every query.
     */
    defaultPrefix: string;

    /**
     * Property path for querying schema labels in schema (classes, link types, properties).
     */
    schemaLabelProperty: string;

    /**
     * Property path for querying instance data labels (elements, links).
     */
    dataLabelProperty: string;

    /**
     * Set of language tags to provide a FILTER for labels and other literal values.
     */
    filterOnlyLanguages?: ReadonlyArray<string>;

    /**
     * SELECT query to retrieve class tree.
     *
     * Parametrized variables:
     *   - `${schemaLabelProperty}` `schemaLabelProperty` property from the settings
     *
     * Expected output bindings:
     *   - `?class`
     *   - `?label` (optional)
     *   - `?parent` (optional)
     *   - `?instcount` (optional)
     */
    classTreeQuery?: string;

    /**
     * SELECT query to retrieve data for each class in a set.
     *
     * Parametrized variables:
     *   - `${ids}` VALUES clause content with class IRIs
     *   - `${schemaLabelProperty}` `schemaLabelProperty` property from the settings
     *   - `${labelLanguageFilter}` label filter based on `filterOnlyLanguages`
     *
     * Expected output bindings:
     *   - `?class`
     *   - `?label` (optional)
     *   - `?instcount` (optional)
     */
    classInfoQuery?: string;

    /**
     * SELECT query to retrieve initial link types.
     *
     * Parametrized variables:
     *   - `${linkTypesPattern}` `linkTypesPattern` property from the settings
     *   - `${schemaLabelProperty}` `schemaLabelProperty` property from the settings
     *   - `${labelLanguageFilter}` label filter based on `filterOnlyLanguages`
     *
     * Expected output bindings:
     *   - `?link`
     *   - `?label` (optional)
     *   - `?instcount` (optional)
     */
    linkTypesQuery?: string;

    /**
     * Overridable part of `linkTypesQuery` with same output bindings.
     *
     * Parametrized variables: none
     */
    linkTypesPattern?: string;

    /**
     * SELECT query to retrieve data for each link type in a set.
     *
     * Parametrized variables:
     *   - `${ids}` VALUES clause content with link type IRIs
     *   - `${schemaLabelProperty}` `schemaLabelProperty` property from the settings
     *   - `${labelLanguageFilter}` label filter based on `filterOnlyLanguages`
     *
     * Expected output bindings:
     *   - `?link`
     *   - `?label` (optional)
     *   - `?instcount` (optional)
     */
    linkTypesInfoQuery?: string;

    /**
     * SELECT query to retrieve data for each datatype property in a set.
     *
     * Parametrized variables:
     *   - `${ids}` VALUES clause content with datatype property IRIs
     *   - `${schemaLabelProperty}` `schemaLabelProperty` property from the settings
     *   - `${labelLanguageFilter}` label filter based on `filterOnlyLanguages`
     *
     * Expected output bindings:
     *   - `?property`
     *   - `?label` (optional)
     */
    propertyInfoQuery?: string;

    /**
     * CONSTRUCT query to retrieve data for each element (types, labels, properties).
     *
     * Parametrized variables:
     *   - `${ids}` VALUES clause content with element IRIs
     *   - `${dataLabelProperty}` `dataLabelProperty` property from the settings
     *   - `${labelLanguageFilter}` label filter based on `filterOnlyLanguages`
     *   - `${valueLanguageFilter}` property value filter based on `filterOnlyLanguages`
     *   - `${propertyConfigurations}`
     *
     * Expected output format for triples:
     *   - `?inst <urn:reactodia:sparql:type> ?class` element has type
     *   - `?inst <urn:reactodia:sparql:label> ?label` element has label
     *   - `?inst ?propType ?propValue` element has value for a datatype property
     */
    elementInfoQuery: string;

    /**
     * SELECT query to retrieve links between specified `sourceIris` and
     * `targetIris` sets of entities.
     *
     * For backwards compatibility, `${ids}` placeholder variable with
     * combined set of entities can be used; in that case incremental
     * link querying will be disabled.
     *
     * Parametrized variables:
     *   - `${sourceIris}` VALUES clause content with source entity IRIs
     *   - `${targetIris}` VALUES clause content with target entity IRIs
     *   - `${ids}` VALUES clause content with all entity IRIs (for compatibility)
     *   - `${propLanguageFilter}` property value filter based on `filterOnlyLanguages`
     *   - `${linkConfigurations}`
     *
     * Expected output bindings:
     *   - `?type` link type
     *   - `?source` link source
     *   - `?target` link target
     *   - `?propType` (optional) link property type
     *   - `?propValue` (optional) link property value
     */
    linksInfoQuery: string;

    /**
     * Query pattern to retrieve image URL for an element.
     *
     * Expected bindings:
     *   - `?inst` element IRI
     *   - `?linkType` image property IRI
     *   - `?image` result image URL
     */
    imageQueryPattern: string;

    /**
     * SELECT query to retrieve incoming/outgoing link types from specified element with statistics.
     *
     * If `?direction` binding is returned, it would be possible to avoid statistics query
     * when `inexactCount` mode is requested.
     *
     * Parametrized variables:
     *   - `${elementIri}`
     *   - `${linkConfigurations}`
     *
     * Expected bindings:
     *   - `?link`
     *   - `?direction` (optional) - expected values: `"in"`, `"out"`.
     */
    linkTypesOfQuery: string;

    /**
     * SELECT query to retrieve statistics of incoming/outgoing link types for specified element.
     *
     * Parametrized variables:
     *   - `${linkId}`
     *   - `${elementIri}`
     *   - `${linkConfigurationOut}`
     *   - `${linkConfigurationIn}`
     *   - `${navigateElementFilterOut}` (optional; for blank node support only)
     *   - `${navigateElementFilterIn}` (optional; for blank node support only)
     *
     * Expected bindings:
     *   - `?link` link type
     *   - `?inCount` incoming links count
     *   - `?outCount` outgoing links count
     */
    linkTypesStatisticsQuery: string;

    /**
     * SPARQL query pattern to restrict lookup results in case when `refElementLinkId`
     * is not specified.
     *
     * Available bindings:
     *   - `?link` link type
     *   - `?direction` link direction, either `"in"` or `"out"`
     */
    filterRefElementLinkPattern: string;

    /**
     * SPARQL query pattern to retrieve transitive type sets for elements.
     *
     * Expected output bindings:
     *   - `?inst` element IRI
     *   - `?class` element type (there may be multiple or transitive types for an element)
     */
    filterTypePattern: string;

    /**
     * SPARQL pattern which describes how to fetch elements info similar to `elementInfoQuery`
     * but within the lookup query.
     *
     * Parametrized variables:
     *   - `${dataLabelProperty}` `dataLabelProperty` property from the settings
     *   - `${labelLanguageFilter}` label filter based on `filterOnlyLanguages`
     */
    filterElementInfoPattern: string;

    /**
     * SPARQL query pattern for additional filtering on elements within the lookup query.
     */
    filterAdditionalRestriction: string;

    /**
     * Lookup by text settings.
     */
    fullTextSearch: FullTextSearchSettings;

    /**
     * "Virtual" links configurations to translate a SPARQL pattern as a link.
     */
    linkConfigurations: LinkConfiguration[];

    /**
     * Allows data provider to find links other than specified in `linkConfigurations`
     * when `linkConfigurations` has at least one value set.
     *
     * @default false
     */
    openWorldLinks?: boolean;

    /**
     * "Virtual" property configurations to translate a SPARQL pattern as an element property.
     */
    propertyConfigurations: PropertyConfiguration[];

    /**
     * Allows data provider to find element properties other than specified in
     * `propertyConfigurations` when `propertyConfigurations` has at least one value set.
     *
     * @default false
     */
    openWorldProperties?: boolean;
}

/**
 * Lookup text search settings.
 * 
 * It is possible to use anything from DB-specific search extensions to a regular expression match.
 */
export interface FullTextSearchSettings {
    /**
     * Prefixes to use in full text search queries.
     */
    prefix: string;

    /**
     * SPARQL query pattern to search/restrict results by text token.
     *
     * Parametrized variables:
     *   - `${text}` text token
     *   - `${dataLabelProperty}` `dataLabelProperty` property from the settings
     *
     * Expected bindings:
     *   - `?inst` link type
     *   - `?score` numerical score for ordering search results by relevance
     *   - `?extractedLabel` (optional; if `extractLabel` is enabled)
     */
    queryPattern: string;

    /**
     * When enabled, adds SPARQL patterns to try to extract label from IRI and
     * makes it available as `?extractedLabel` binding in `queryPattern`.
     */
    extractLabel?: boolean;
}

/**
 * Link abstraction configuration.
 */
export interface LinkConfiguration {
    /**
     * IRI of the "virtual" link
     */
    id: string;

    /**
     * Optional domain constraint for source element of the link.
     * If specified checks RDF type of source element to match one from this set.
     */
    domain?: ReadonlyArray<string>;

    /**
     * SPARQL predicate or pattern connecting source element to target element.
     *
     * Expected bindings (if it is a pattern):
     *   - `?source` source element
     *   - `?target` target element
     *
     * @example
     * Direct configuration: `ex:relatedToOther`
     *
     * Pattern configuration: `
     *   ?source ex:hasAddress ?addr .
     *   ?addr ex:hasCountry ?target .
     *   OPTIONAL {
     *     BIND(ex:addressType as ?propType)
     *     ?addr ex:addressType ?propValue
     *   }
     * `
     */
    path: string;

    /**
     * Additional SPARQL patterns can be used for getting properties of the link.
     *
     * Expected bindings
     *   - `?source` source element
     *   - `?target` target element
     *   - `?propType` link property type
     *   - `?propValue` link property value
     */
    properties?: string;
}

/**
 * Specifies property abstraction configuration
 */
export interface PropertyConfiguration {
    /**
     * IRI of the "virtual" link
     */
    id: string;

    /**
     * Optional domain constraint for source element of the property.
     * If specified checks RDF type of source element to match one from this set.
     */
    domain?: ReadonlyArray<string>;

    /**
     * SPARQL predicate or pattern connecting source element to property value.
     *
     * Expected bindings (if it is a pattern):
     *   - `?inst` source element
     *   - `?value` property value
     *
     * @example
     * Direct configuration: `ex:firstName`
     *
     * Pattern configuration: `
     *   ?inst ex:hasAddress ?addr .
     *   ?addr ex:hasApartmentNumber ?value
     * `
     */
    path: string;
}

/**
 * @category Constants
 */
export const RdfSettings: SparqlDataProviderSettings = {
    linkConfigurations: [],
    openWorldLinks: false,

    propertyConfigurations: [],
    openWorldProperties: false,

    linksInfoQuery: `SELECT ?source ?type ?target
            WHERE {
                \${linkConfigurations}
                VALUES (?source) {\${sourceIris}}
                VALUES (?target) {\${targetIris}}
            }`,

    defaultPrefix: '',

    schemaLabelProperty: 'rdfs:label',
    dataLabelProperty: 'rdfs:label',

    fullTextSearch: {
        prefix: '',
        queryPattern: '',
    },

    classTreeQuery: '',

    classInfoQuery:
`SELECT ?class ?label ?instcount WHERE {
    VALUES(?class) {\${ids}}
    OPTIONAL {
        ?class \${schemaLabelProperty} ?label
        \${labelLanguageFilter}
    }
    BIND("" as ?instcount)
}`,

    linkTypesQuery:
`SELECT DISTINCT ?link ?instcount ?label WHERE {
    \${linkTypesPattern}
    OPTIONAL {
        ?link \${schemaLabelProperty} ?label
        \${labelLanguageFilter}
    }
}`,

    linkTypesPattern: '',

    linkTypesInfoQuery:
`SELECT ?link ?label WHERE {
    VALUES(?link) {\${ids}}
    OPTIONAL {
        ?link \${schemaLabelProperty} ?label
        \${labelLanguageFilter}
    }
}`,

    propertyInfoQuery:
`SELECT ?property ?label WHERE {
    VALUES(?property) {\${ids}}
    OPTIONAL {
        ?property \${schemaLabelProperty} ?label
        \${labelLanguageFilter}
    }
}`,

    elementInfoQuery: '',
    imageQueryPattern: '',

    linkTypesOfQuery: '',
    linkTypesStatisticsQuery: '',
    filterRefElementLinkPattern: '',
    filterTypePattern: '',
    filterAdditionalRestriction: '',
    filterElementInfoPattern: '',
};

const WikidataSettingsOverride: Partial<SparqlDataProviderSettings> = {
    defaultPrefix:
        `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
 PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
 PREFIX wdt: <http://www.wikidata.org/prop/direct/>
 PREFIX wd: <http://www.wikidata.org/entity/>
 PREFIX owl:  <http://www.w3.org/2002/07/owl#>
`,

    schemaLabelProperty: 'rdfs:label',
    dataLabelProperty: 'rdfs:label',

    classTreeQuery: `
        SELECT distinct ?class ?label ?parent WHERE {
            ?class rdfs:label ?label.
            \${labelLanguageFilter}
            { ?class wdt:P279 wd:Q35120. }
            UNION
            { ?parent wdt:P279 wd:Q35120.
            ?class wdt:P279 ?parent. }
            UNION
            { ?parent wdt:P279/wdt:P279 wd:Q35120.
            ?class wdt:P279 ?parent. }
        }
    `,

    linkTypesQuery: '',
    linkTypesPattern: `
        ?link wdt:P279* wd:Q18616576.
        BIND(0 as ?instcount)
    `,

    linkTypesInfoQuery:
`SELECT ?link ?label WHERE {
    VALUES (?link) {\${ids}}
    OPTIONAL {
        ?claim <http://wikiba.se/ontology#directClaim> ?link .
        ?claim \${schemaLabelProperty} ?label
        \${labelLanguageFilter}
    }
}`,

    propertyInfoQuery:
`SELECT ?property ?label WHERE {
    VALUES (?property) {\${ids}}
    OPTIONAL {
        ?claim <http://wikiba.se/ontology#directClaim> ?property .
        ?claim \${schemaLabelProperty} ?label
        \${labelLanguageFilter}
    }
}`,

    elementInfoQuery: `
        CONSTRUCT {
            ?inst <urn:reactodia:sparql:type> ?class .
            ?inst <urn:reactodia:sparql:label> ?label .
            ?inst ?propType ?propValue.
        } WHERE {
            VALUES (?inst) {\${ids}}
            OPTIONAL {
                ?inst wdt:P31 ?class
            }
            OPTIONAL {
                ?inst rdfs:label ?label
                \${labelLanguageFilter}
            }
            OPTIONAL {
                \${propertyConfigurations}
                FILTER (isLiteral(?propValue))
                \${valueLanguageFilter}
            }
        }
    `,
    imageQueryPattern: ` { ?inst ?linkType ?fullImage } union { ?inst wdt:P163/wdt:P18 ?fullImage }
                BIND(CONCAT("https://commons.wikimedia.org/w/thumb.php?f=",
                    STRAFTER(STR(?fullImage), "Special:FilePath/"), "&w=200") AS ?image)`,
    linkTypesOfQuery: `
        SELECT DISTINCT ?link ?direction
        WHERE {
            \${linkConfigurations}
            ?claim <http://wikiba.se/ontology#directClaim> ?link .
        }
    `,
    linkTypesStatisticsQuery: `
        SELECT (\${linkId} as ?link) (COUNT(?outObject) AS ?outCount) (COUNT(?inObject) AS ?inCount)
        WHERE {
            {
                {
                    SELECT DISTINCT ?outObject WHERE {
                        \${linkConfigurationOut}
                        FILTER(ISIRI(?outObject))
                        ?outObject ?someprop ?someobj.
                    }
                    LIMIT 101
                }
            } UNION {
                {
                    SELECT DISTINCT ?inObject WHERE {
                        \${linkConfigurationIn}
                        FILTER(ISIRI(?inObject))
                        ?inObject ?someprop ?someobj.
                    }
                    LIMIT 101
                }
            }
        }
    `,
    filterRefElementLinkPattern: '?claim <http://wikiba.se/ontology#directClaim> ?link .',
    filterTypePattern: '?inst wdt:P31 ?instType. ?instType wdt:P279* ?class',
    filterAdditionalRestriction: `FILTER ISIRI(?inst)
                        BIND(STR(?inst) as ?strInst)
                        FILTER exists {?inst ?someprop ?someobj}
`,
    filterElementInfoPattern: `
        OPTIONAL {?inst wdt:P31 ?foundClass}
        BIND (coalesce(?foundClass, owl:Thing) as ?class)
        OPTIONAL {
            ?inst rdfs:label ?label
            \${labelLanguageFilter}
        }
    `,
    fullTextSearch: {
        prefix: 'PREFIX bds: <http://www.bigdata.com/rdf/search#>\n',
        queryPattern: `
            SERVICE wikibase:mwapi {
                bd:serviceParam wikibase:endpoint "www.wikidata.org";
                    wikibase:api "EntitySearch";
                    mwapi:search "\${text}";
                    mwapi:language "en".
                ?inst wikibase:apiOutputItem mwapi:item.
                ?num wikibase:apiOrdinal true.
            }
            BIND(IF(
                STRLEN(STR(?inst)) > 33,
                0-<http://www.w3.org/2001/XMLSchema#integer>(SUBSTR(STR(?inst), 33)),
                -10000
            ) as ?score)
        `,
    },
};

/**
 * @category Constants
 */
export const WikidataSettings: SparqlDataProviderSettings = {...RdfSettings, ...WikidataSettingsOverride};

const OwlRdfsSettingsOverride: Partial<SparqlDataProviderSettings> = {
    defaultPrefix:
        `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
 PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
 PREFIX owl:  <http://www.w3.org/2002/07/owl#>
`,
    schemaLabelProperty: 'rdfs:label',
    dataLabelProperty: 'rdfs:label',
    fullTextSearch: {
        prefix: '',
        queryPattern:
        ` OPTIONAL {?inst \${dataLabelProperty} ?search1}
        FILTER regex(COALESCE(str(?search1), str(?extractedLabel)), "\${text}", "i")
        BIND(0 as ?score)
`,
        extractLabel: true,
    },
    classTreeQuery: `
        SELECT ?class ?label ?parent
        WHERE {
            {
                ?class a rdfs:Class
            } UNION {
                ?class a owl:Class
            }
            FILTER ISIRI(?class)
            OPTIONAL {
                ?class rdfs:label ?label
                \${labelLanguageFilter}
            }
            OPTIONAL {?class rdfs:subClassOf ?parent. FILTER ISIRI(?parent)}
        }
    `,

    // todo: think more, maybe add a limit here?
    linkTypesPattern: `
        { ?link a rdf:Property }
        UNION
        { ?link a owl:ObjectProperty }
        BIND('' as ?instcount)
    `,
    elementInfoQuery: `
        CONSTRUCT {
            ?inst <urn:reactodia:sparql:type> ?class .
            ?inst <urn:reactodia:sparql:label> ?label .
            ?inst ?propType ?propValue.
        } WHERE {
            VALUES (?inst) {\${ids}}
            OPTIONAL { ?inst a ?class }
            OPTIONAL {
                ?inst \${dataLabelProperty} ?label
                \${labelLanguageFilter}
            }
            OPTIONAL {
                \${propertyConfigurations}
                FILTER (isLiteral(?propValue))
                \${valueLanguageFilter}
            }
        }
    `,
    imageQueryPattern: '{ ?inst ?linkType ?image } UNION { [] ?linkType ?inst. BIND(?inst as ?image) }',
    linkTypesOfQuery: `
        SELECT DISTINCT ?link ?direction
        WHERE {
            \${linkConfigurations}
        }
    `,
    linkTypesStatisticsQuery: `
        SELECT ?link ?outCount ?inCount
        WHERE {
            {
                SELECT (\${linkId} as ?link) (count(?outObject) as ?outCount) WHERE {
                    \${linkConfigurationOut}
                    \${navigateElementFilterOut}
                } LIMIT 101
            } {
                SELECT (\${linkId} as ?link) (count(?inObject) as ?inCount) WHERE {
                    \${linkConfigurationIn}
                    \${navigateElementFilterIn}
                } LIMIT 101
            }
        }
    `,
    filterRefElementLinkPattern: '',
    filterTypePattern: '?inst a ?instType. ?instType rdfs:subClassOf* ?class',
    filterElementInfoPattern: `
        OPTIONAL {?inst rdf:type ?foundClass}
        BIND (coalesce(?foundClass, owl:Thing) as ?class)
        OPTIONAL {
            ?inst \${dataLabelProperty} ?label
            \${labelLanguageFilter}
        }
    `,
    filterAdditionalRestriction: '',
};

/**
 * @category Constants
 */
export const OwlRdfsSettings: SparqlDataProviderSettings = {...RdfSettings, ...OwlRdfsSettingsOverride};

const OWLStatsOverride: Partial<SparqlDataProviderSettings> = {
    classTreeQuery: `
        SELECT ?class ?instcount ?label ?parent
        WHERE {
            {SELECT ?class (count(?inst) as ?instcount)
                WHERE {
                    ?inst rdf:type ?class.
                    FILTER ISIRI(?class)
                } GROUP BY ?class } UNION
            {
                ?class rdf:type rdfs:Class
            } UNION {
                ?class rdf:type owl:Class
            }
            OPTIONAL {
                ?class rdfs:label ?label
                \${labelLanguageFilter}
            }
            OPTIONAL {?class rdfs:subClassOf ?parent. FILTER ISIRI(?parent)}
        }
    `,
};

/**
 * @category Constants
 */
export const OwlStatsSettings: SparqlDataProviderSettings = {...OwlRdfsSettings, ...OWLStatsOverride};

const DBPediaOverride: Partial<SparqlDataProviderSettings> = {
    fullTextSearch: {
        prefix: 'PREFIX dbo: <http://dbpedia.org/ontology/>\n',
        queryPattern: `
              ?inst rdfs:label ?searchLabel.
              ?searchLabel bif:contains "\${text}".
              ?inst dbo:wikiPageID ?origScore .
              BIND(0-?origScore as ?score)
        `,
    },

    classTreeQuery: `
        SELECT distinct ?class ?label ?parent WHERE {
            ?class rdfs:label ?label.
            OPTIONAL {?class rdfs:subClassOf ?parent}
            ?root rdfs:subClassOf owl:Thing.
            ?class rdfs:subClassOf? | rdfs:subClassOf/rdfs:subClassOf ?root
        }
    `,

    elementInfoQuery: `
        CONSTRUCT {
            ?inst <urn:reactodia:sparql:type> ?class .
            ?inst <urn:reactodia:sparql:label> ?label .
            ?inst ?propType ?propValue.
        } WHERE {
            VALUES (?inst) {\${ids}}
            ?inst a ?class .
            ?inst rdfs:label ?label .
            FILTER (!contains(str(?class), 'http://dbpedia.org/class/yago'))
            OPTIONAL {
                \${propertyConfigurations}
                FILTER (isLiteral(?propValue))
            }
        }
    `,

    filterTypePattern: '?inst a ?instType. ?instType rdfs:subClassOf* ?class',
    filterElementInfoPattern: `
        OPTIONAL {?inst rdf:type ?foundClass. FILTER (!contains(str(?foundClass), 'http://dbpedia.org/class/yago'))}
        BIND (coalesce(?foundClass, owl:Thing) as ?class)
        OPTIONAL {?inst \${dataLabelProperty} ?label}`,

    imageQueryPattern: ` { ?inst ?linkType ?fullImage } UNION { [] ?linkType ?inst. BIND(?inst as ?fullImage) }
            BIND(CONCAT("https://commons.wikimedia.org/w/thumb.php?f=",
            STRAFTER(STR(?fullImage), "Special:FilePath/"), "&w=200") AS ?image)
    `,
};

/**
 * @category Constants
 */
export const DBPediaSettings: SparqlDataProviderSettings = {...OwlRdfsSettings, ...DBPediaOverride};
