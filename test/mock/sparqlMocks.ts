import { QueryEngine } from '@comunica/query-sparql-rdfjs-lite';
import * as N3 from 'n3';

import { IndexQuadBy, type MemoryDataset, indexedDataset } from '../../src/data/rdf/memoryDataset';
import * as Rdf from '../../src/data/rdf/rdfModel';
import { rdfs as rdfsBase } from '../../src/data/rdf/vocabulary';
import {
    SparqlDataProvider, type SparqlDataProviderOptions,
} from '../../src/data/sparql/sparqlDataProvider';
import {
    type SparqlDataProviderSettings,
} from '../../src/data/sparql/sparqlDataProviderSettings';
import { SparqlResponse } from '../../src/data/sparql/sparqlModels';

import TURTLE_DATA from '../../examples/resources/orgOntology.ttl?raw';

const NAMESPACE_ORG = 'http://www.w3.org/ns/org#';
export const org = {
    $namespace: NAMESPACE_ORG,
    FormalOrganization: `${NAMESPACE_ORG}FormalOrganization`,
    Organization: `${NAMESPACE_ORG}Organization`,
    OrganizationalUnit: `${NAMESPACE_ORG}OrganizationalUnit`,
    Role: `${NAMESPACE_ORG}Role`,
    identifier: `${NAMESPACE_ORG}identifier`,
    hasUnit: `${NAMESPACE_ORG}hasUnit`,
    location: `${NAMESPACE_ORG}location`,
    memberOf: `${NAMESPACE_ORG}memberOf`,
    subOrganizationOf: `${NAMESPACE_ORG}subOrganizationOf`,
} as const;

export const rdfs = {
    ...rdfsBase,
    comment: `${rdfsBase.$namespace}comment`,
    domain: `${rdfsBase.$namespace}domain`,
};

const NAMESPACE_TEST = 'urn:reactodia:test:';

export const test = {
    $namespace: NAMESPACE_TEST,
    label: `${NAMESPACE_TEST}label`,
    image: `${NAMESPACE_TEST}image`,
} as const;

class InMemorySparqlProvider extends SparqlDataProvider {
    constructor(
        options: SparqlDataProviderOptions,
        settings: SparqlDataProviderSettings | undefined,
        private readonly store: N3.Store,
        private readonly engine: QueryEngine,
    ) {
        super(options, settings);
    }

    async executeSparqlSelect<Binding>(
        query: string,
        options?: { signal?: AbortSignal; }
    ): Promise<SparqlResponse<Binding>> {
        const stream = await this.engine.queryBindings(query, { sources: [this.store] });
        const bindings: Binding[] = [];
        for await (const item of stream) {
            options?.signal?.throwIfAborted();
            const binding = Object.create(null) as Record<string, Rdf.Term>;
            for (const [variable, term] of item) {
                binding[variable.value] = term;
            }
            bindings.push(binding as Binding);
        }
        return {
            head: { vars: [], },
            results: { bindings },
        };
    }

    async executeSparqlConstruct(
        query: string,
        options?: { signal?: AbortSignal; }
    ): Promise<Rdf.Quad[]> {
        const stream = await this.engine.queryQuads(query, { sources: [this.store] });
        const quads: Rdf.Quad[] = [];
        for await (const item of stream) {
            options?.signal?.throwIfAborted();
            quads.push(item);
        }
        return quads;
    }
}

export async function makeSparqlDataProvider(
    options: Omit<SparqlDataProviderOptions, 'endpointUrl'>,
    settings?: SparqlDataProviderSettings
): Promise<SparqlDataProvider> {
    const store = new N3.Store(
        new N3.Parser().parse(TURTLE_DATA)
    );
    const engine = new QueryEngine();
    return new InMemorySparqlProvider(
        {
            ...options,
            endpointUrl: '',
            queryFunction: () => {
                throw new Error('Cannot query external SPARQL endpoint');
            },
        },
        settings,
        store,
        engine
    );
}

export function makeSparqlDataset(): MemoryDataset {
    const dataset = indexedDataset(IndexQuadBy.S | IndexQuadBy.SP);
    dataset.addAll(new N3.Parser().parse(TURTLE_DATA));
    return dataset;
}
