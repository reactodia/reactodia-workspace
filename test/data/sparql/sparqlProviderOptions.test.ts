import { describe, expect, it } from 'vitest';

import type { DataProviderLookupItem } from '../../../src/data/dataProvider';
import type {
    ElementIri, ElementModel, ElementTypeIri, ElementTypeModel, LinkTypeIri, LinkTypeModel,
    LinkModel, PropertyTypeIri, PropertyTypeModel,
} from '../../../src/data/model';
import { type MemoryDataset } from '../../../src/data/rdf/memoryDataset';
import * as Rdf from '../../../src/data/rdf/rdfModel';
import { rdf, owl } from '../../../src/data/rdf/vocabulary';
import type { SparqlDataProviderOptions } from '../../../src/data/sparql/sparqlDataProvider';
import {
    OwlStatsSettings,
} from '../../../src/data/sparql/sparqlDataProviderSettings';

import { makeSparqlDataProvider, makeSparqlDataset, org, rdfs, test } from '../../mock/sparqlMocks';
import { compareLinks } from '../../utilities/dataCompare';

describe('SparqlDataProvider', () => {
    it('provides knownElementTypes() with options', async () => {
        const provider = await makeSparqlDataProvider(
            makeSparqlProviderOptions(),
            {...OwlStatsSettings, filterOnlyLanguages: ['en']},
        );
        const {elementTypes, subtypeOf} = await provider.knownElementTypes({});
        expect(elementTypes.find(t => t.id === org.FormalOrganization)).toEqual({
            id: org.FormalOrganization,
            label: [provider.factory.literal('FormalOrganization', 'test')],
            count: undefined,
        } satisfies ElementTypeModel);
        expect(
            subtypeOf.some(edge => edge[0] === org.FormalOrganization && edge[1] === org.Organization)
        ).toBeTruthy();
    });

    it('provides knownLinkTypes() with options', async () => {
        const provider = await makeSparqlDataProvider(
            makeSparqlProviderOptions(),
            {...OwlStatsSettings, filterOnlyLanguages: ['en']},
        );
        const linkTypes = await provider.knownLinkTypes({});
        expect(linkTypes.find(t => t.id === org.subOrganizationOf)).toEqual({
            id: org.subOrganizationOf,
            label: [provider.factory.literal('subOrganizationOf', 'test')],
            count: 0,
        } satisfies LinkTypeModel);
    });

    it('provides elementTypes() with options', async () => {
        const provider = await makeSparqlDataProvider(
            makeSparqlProviderOptions(),
            {...OwlStatsSettings, filterOnlyLanguages: ['en']},
        );
        const classIds: readonly ElementTypeIri[] = [org.FormalOrganization, org.Role];
        const elementTypes = await provider.elementTypes({classIds});
        const result = classIds.map(id => elementTypes.get(id));
        expect(result).toEqual(
            [
                {
                    id: org.FormalOrganization,
                    label: [provider.factory.literal('FormalOrganization', 'test')],
                    count: 0,
                },
                {
                    id: org.Role,
                    label: [provider.factory.literal('Role', 'test')],
                    count: 0,
                },
            ] satisfies ElementTypeModel[]
        );
    });

    it('provides linkTypes() with options', async () => {
        const provider = await makeSparqlDataProvider(
            makeSparqlProviderOptions(),
            {...OwlStatsSettings, filterOnlyLanguages: ['en']},
        );
        const linkTypeIds: readonly LinkTypeIri[] = [org.subOrganizationOf, org.memberOf];
        const linkTypes = await provider.linkTypes({linkTypeIds});
        const result = linkTypeIds.map(id => linkTypes.get(id));
        expect(result).toEqual(
            [
                {
                    id: org.subOrganizationOf,
                    label: [provider.factory.literal('subOrganizationOf', 'test')],
                    count: undefined,
                },
                {
                    id: org.memberOf,
                    label: [provider.factory.literal('memberOf', 'test')],
                    count: undefined,
                },
            ] satisfies LinkTypeModel[]
        );
    });

    it('provides propertyTypes() with options', async () => {
        const provider = await makeSparqlDataProvider(
            makeSparqlProviderOptions(),
            {...OwlStatsSettings, filterOnlyLanguages: ['en']},
        );
        const propertyIds: readonly PropertyTypeIri[] = [org.identifier, org.location];
        const propertyTypes = await provider.propertyTypes({propertyIds});
        const result = propertyIds.map(id => propertyTypes.get(id));
        expect(result).toEqual(
            [
                {
                    id: org.identifier,
                    label: [provider.factory.literal('identifier', 'test')],
                },
                {
                    id: org.location,
                    label: [provider.factory.literal('location', 'test')],
                },
            ] satisfies PropertyTypeModel[]
        );
    });

    it('provides elements() with options', async () => {
        const provider = await makeSparqlDataProvider(
            makeSparqlProviderOptions(),
            {...OwlStatsSettings, filterOnlyLanguages: ['en']},
        );
        const dataset = makeSparqlDataset();
        const elementIds: readonly ElementIri[] = [
            org.FormalOrganization, org.memberOf, org.location
        ];
        const elements = await provider.elements({elementIds});
        const result = elementIds.map(id => elements.get(id));
        expect(result).toEqual(
            [
                {
                    id: org.FormalOrganization,
                    types: [rdfs.Class, owl.Class],
                    properties: {
                        [test.image]: [provider.factory.namedNode(org.FormalOrganization)],
                        [test.label]: [provider.factory.literal('FormalOrganization', 'test')],
                        [rdfs.label]: [provider.factory.literal('Formal Organization', 'en')],
                        [rdfs.comment]: readPropertyValues(
                            dataset, org.FormalOrganization, rdfs.comment
                        ),
                    }
                },
                {
                    id: org.memberOf,
                    types: [rdf.Property, owl.ObjectProperty],
                    properties: {
                        [test.image]: [provider.factory.namedNode(org.memberOf)],
                        [test.label]: [provider.factory.literal('memberOf', 'test')],
                        [rdfs.label]: [provider.factory.literal('member of', 'en')],
                        [rdfs.comment]: readPropertyValues(
                            dataset, org.memberOf, rdfs.comment
                        ),
                    }
                },
                {
                    id: org.location,
                    types: [rdf.Property, owl.DatatypeProperty],
                    properties: {
                        [test.image]: [provider.factory.namedNode(org.location)],
                        [test.label]: [provider.factory.literal('location', 'test')],
                        [rdfs.label]: [provider.factory.literal('location', 'en')],
                        [rdfs.comment]: readPropertyValues(
                            dataset, org.location, rdfs.comment
                        ),
                    }
                },
            ] satisfies ElementModel[]
        );
    });

    it('provides links() with options', async () => {
        const provider = await makeSparqlDataProvider(
            makeSparqlProviderOptions(),
            {...OwlStatsSettings, filterOnlyLanguages: ['en']},
        );
        const elementIds: readonly ElementIri[] = [
            org.FormalOrganization, org.memberOf, org.location
        ];
        const links = await provider.links({
            primary: [org.Organization, org.OrganizationalUnit, org.hasUnit],
            secondary: [org.FormalOrganization],
        });
        links.sort(compareLinks);
        expect(links).toEqual(
            [
                {
                    sourceId: org.FormalOrganization,
                    linkTypeId: rdfs.subClassOf,
                    targetId: org.Organization,
                    properties: {},
                },
                {
                    sourceId: org.hasUnit,
                    linkTypeId: rdfs.domain,
                    targetId: org.FormalOrganization,
                    properties: {},
                },
            ] satisfies LinkModel[]
        );
    });

    it('provides lookup() with options', async () => {
        const provider = await makeSparqlDataProvider(
            makeSparqlProviderOptions(),
            {...OwlStatsSettings, filterOnlyLanguages: ['en']},
        );
        const items = await provider.lookup({
            elementTypeId: owl.DatatypeProperty,
        });
        expect(items).toEqual(
            [
                {
                    element: {
                        id: org.identifier,
                        types: [rdf.Property, owl.DatatypeProperty],
                        properties: {
                            [test.label]: [provider.factory.literal('identifier', 'test')],
                        }
                    },
                    inLinks: new Set(),
                    outLinks: new Set(),
                },
                {
                    element: {
                        id: org.location,
                        types: [rdf.Property, owl.DatatypeProperty],
                        properties: {
                            [test.label]: [provider.factory.literal('location', 'test')],
                        }
                    },
                    inLinks: new Set(),
                    outLinks: new Set(),
                },
            ] satisfies DataProviderLookupItem[]
        );
    });
});

function makeSparqlProviderOptions() {
    const factory = Rdf.DefaultDataFactory;
    const options: Omit<SparqlDataProviderOptions, 'endpointUrl'> = {
        prepareLabels: async (resources) => {
            const result = new Map<string, Rdf.Literal[]>();
            for (const resource of resources) {
                result.set(
                    resource,
                    [factory.literal(Rdf.getLocalName(resource) ?? resource, 'test')]
                );
            }
            return result;
        },
        prepareLabelPredicate: test.label,
        prepareImages: async (resources) => {
            const result = new Map<string, string>();
            for (const resource of resources) {
                result.set(resource.id, resource.id);
            }
            return result;
        },
        prepareImagePredicate: test.image,
    };
    return options;
}

function readPropertyValues(
    dataset: MemoryDataset,
    subject: ElementIri,
    property: PropertyTypeIri
): Array<Rdf.NamedNode | Rdf.Literal> {
    const items: Array<Rdf.NamedNode | Rdf.Literal> = [];
    const matches = dataset.iterateMatches(
        Rdf.DefaultDataFactory.namedNode(subject),
        Rdf.DefaultDataFactory.namedNode(property),
        null
    );
    for (const {object: term} of matches) {
        if (
            term.termType === 'NamedNode' ||
            (term.termType === 'Literal' && (!term.language || term.language === 'en'))
        ) {
            items.push(term);
        }
    }
    return items;
}
