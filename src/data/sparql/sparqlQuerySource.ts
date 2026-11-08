import * as N3 from 'n3';

import * as Rdf from '../rdf/rdfModel';

/**
 * Provides a source to get data from by a SPARQL query.
 *
 * @category Data
 */
export interface SparqlQuerySource {
    /**
     * Gets data by a [SPARQL SELECT](https://www.w3.org/TR/sparql11-query/#select) query.
     */
    sparqlSelect(params: {
        query: string;
        factory: Rdf.DataFactory;
        signal?: AbortSignal;
    }): Promise<Record<string, Rdf.Term>[]>;

    /**
     * Gets data by a [SPARQL CONSTRUCT](https://www.w3.org/TR/sparql11-query/#construct) query.
     */
    sparqlConstruct(params: {
        query: string;
        factory: Rdf.DataFactory;
        signal?: AbortSignal;
    }): Promise<Rdf.Quad[]>;
}

/**
 * Options for {@link HttpSparqlQuerySource}.
 */
export interface HttpSparqlQuerySourceOptions {
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
}

/**
 * Custom function to send SPARQL HTTP requests.
 *
 * @see {@link HttpSparqlQuerySourceOptions.queryFunction}
 */
export type SparqlQueryFunction = (params: {
    url: string;
    body?: string;
    headers: { [header: string]: string };
    method: string;
    signal?: AbortSignal;
}) => Promise<Response>;

/**
 * Provides a query source over a SPARQL HTTP endpoint.
 */
export class HttpSparqlQuerySource implements SparqlQuerySource {
    private readonly options: Required<HttpSparqlQuerySourceOptions>;

    constructor(options: HttpSparqlQuerySourceOptions) {
        this.options = {
            endpointUrl: options.endpointUrl,
            queryMethod: options.queryMethod ?? 'GET',
            queryFunction: options.queryFunction ?? queryInternal,
        };
    }

    async sparqlSelect(params: {
        query: string;
        factory: Rdf.DataFactory;
        signal?: AbortSignal;
    }): Promise<Record<string, Rdf.Term>[]> {
        const {query, factory, signal} = params;
        const {endpointUrl, queryMethod, queryFunction} = this.options;
        let internalQuery: Promise<Response>;
        if (queryMethod === 'GET') {
            internalQuery = queryFunction({
                url: appendQueryParams(endpointUrl, {query}),
                headers: {
                    'Accept': 'application/sparql-results+json',
                },
                method: 'GET',
                signal,
            });
        } else {
            internalQuery = queryFunction({
                url: endpointUrl,
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
            const sparqlResponse = await response.json() as SparqlHttpResponse;
            return sparqlResponse.results.bindings
                .map(binding => mapSparqlBinding(binding, factory));
        } else {
            throw await SparqlResponseError.fromResponse(response);
        }
    }

    async sparqlConstruct(params: {
        query: string;
        factory: Rdf.DataFactory;
        signal?: AbortSignal;
    }): Promise<Rdf.Quad[]> {
        const {query, factory, signal} = params;
        const {endpointUrl, queryMethod, queryFunction} = this.options;
        let internalQuery: Promise<Response>;
        if (queryMethod === 'GET') {
            internalQuery = queryFunction({
                url: appendQueryParams(endpointUrl, {query}),
                headers: {
                    'Accept': 'text/turtle',
                },
                method: 'GET',
                signal,
            });
        } else {
            internalQuery = queryFunction({
                url: endpointUrl,
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
}

/**
 * SPARQL error originated from an HTTP response.
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

type SparqlHttpTerm = SparqlIri | SparqlLiteral | SparqlBlank;

interface SparqlIri {
    type: 'uri';
    value: string;
}

interface SparqlBlank {
    type: 'bnode';
    value: string;
}

interface SparqlLiteral {
    type: 'literal' | 'typed-literal';
    value: string;
    datatype?: string;
    'xml:lang': string;
}

interface SparqlHttpResponse {
    head: {
        vars: string[];
    };
    results: {
        bindings: Record<string, SparqlHttpTerm>[];
    };
}

function mapSparqlBinding(
    binding: Record<string, SparqlHttpTerm>,
    factory: Rdf.DataFactory,
): Record<string, Rdf.Term> {
    const mapped: { [name: string]: Rdf.Term } = {};
    for (const key in binding) {
        if (Object.prototype.hasOwnProperty.call(binding, key)) {
            const term = binding[key];
            switch (term.type) {
                case 'uri': {
                    mapped[key] = factory.namedNode(term.value);
                    break;
                }
                case 'bnode': {
                    mapped[key] = factory.blankNode(term.value);
                    break;
                }
                case 'literal':
                case 'typed-literal': {
                    mapped[key] = factory.literal(
                        term.value,
                        term['xml:lang'] ? term['xml:lang'] :
                        term.datatype ? factory.namedNode(term.datatype) :
                        undefined
                    );
                    break;
                }
                default: {
                    throw new Error(
                        `Unexpected SPARQL term type: "${(term as SparqlHttpTerm).type}"`
                    );
                }
            }
        }
    }
    return mapped;
}
