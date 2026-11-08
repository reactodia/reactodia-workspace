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
import {
    SparqlQuerySource,
} from '../../src/data/sparql/sparqlQuerySource';

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

class CommunicaQuerySource implements SparqlQuerySource {
    constructor(
        private readonly store: N3.Store,
        private readonly engine: QueryEngine,
    ) {}

    async sparqlSelect(params: {
        query: string;
        factory: Rdf.DataFactory;
        signal?: AbortSignal;
    }): Promise<Record<string, Rdf.Term>[]> {
        const {query, signal} = params;
        const stream = await this.engine.queryBindings(query, { sources: [this.store] });
        const bindings: Record<string, Rdf.Term>[] = [];
        for await (const item of stream) {
            signal?.throwIfAborted();
            const binding = Object.create(null) as Record<string, Rdf.Term>;
            for (const [variable, term] of item) {
                binding[variable.value] = term;
            }
            bindings.push(binding);
        }
        return bindings;
    }

    async sparqlConstruct(params: {
        query: string;
        factory: Rdf.DataFactory;
        signal?: AbortSignal;
    }): Promise<Rdf.Quad[]> {
        const {query, signal} = params;
        const stream = await this.engine.queryQuads(query, { sources: [this.store] });
        const quads: Rdf.Quad[] = [];
        for await (const item of stream) {
            signal?.throwIfAborted();
            quads.push(item);
        }
        return quads;
    }
}

export async function makeSparqlDataProvider(
    options: Omit<SparqlDataProviderOptions, 'source'>,
    settings?: SparqlDataProviderSettings
): Promise<SparqlDataProvider> {
    const store = new N3.Store(
        new N3.Parser().parse(TURTLE_DATA)
    );
    const engine = new QueryEngine();
    return new SparqlDataProvider(
        {
            ...options,
            source: new CommunicaQuerySource(store, engine),
        },
        settings
    );
}

export function makeSparqlDataset(): MemoryDataset {
    const dataset = indexedDataset(IndexQuadBy.S | IndexQuadBy.SP);
    dataset.addAll(new N3.Parser().parse(TURTLE_DATA));
    return dataset;
}
