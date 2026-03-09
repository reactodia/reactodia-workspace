import { describe, expect, it } from 'vitest';

import type {
    ElementIri, ElementModel, ElementTypeIri, ElementTypeModel, LinkTypeIri, LinkTypeModel,
    LinkModel, PropertyTypeIri, PropertyTypeModel,
} from '../../../src/data/model';
import type { DataProviderLookupItem } from '../../../src/data/dataProvider';
import { type MemoryDataset } from '../../../src/data/rdf/memoryDataset';
import * as Rdf from '../../../src/data/rdf/rdfModel';
import { rdf, owl } from '../../../src/data/rdf/vocabulary';
import {
    OwlStatsSettings,
} from '../../../src/data/sparql/sparqlDataProviderSettings';

import { makeSparqlDataProvider, makeSparqlDataset, org, rdfs } from '../../mock/sparqlMocks';
import { compareLinks } from '../../utilities/dataCompare';

describe('SparqlDataProvider', () => {
    it('provides knownElementTypes()', async () => {
        const provider = await makeSparqlDataProvider(
            {},
            {...OwlStatsSettings, filterOnlyLanguages: ['en']},
        );
        const {elementTypes, subtypeOf} = await provider.knownElementTypes({});
        expect(elementTypes.find(t => t.id === org.FormalOrganization)).toEqual({
            id: org.FormalOrganization,
            label: [provider.factory.literal('Formal Organization', 'en')],
            count: undefined,
        } satisfies ElementTypeModel);
        expect(
            subtypeOf.some(edge => edge[0] === org.FormalOrganization && edge[1] === org.Organization)
        ).toBeTruthy();
    });

    it('provides knownLinkTypes()', async () => {
        const provider = await makeSparqlDataProvider(
            {},
            {...OwlStatsSettings, filterOnlyLanguages: ['en']},
        );
        const linkTypes = await provider.knownLinkTypes({});
        expect(linkTypes.find(t => t.id === org.subOrganizationOf)).toEqual({
            id: org.subOrganizationOf,
            label: [provider.factory.literal('subOrganization of', 'en')],
            count: 0,
        } satisfies LinkTypeModel);
    });

    it('provides elementTypes()', async () => {
        const provider = await makeSparqlDataProvider(
            {},
            {...OwlStatsSettings, filterOnlyLanguages: ['en']},
        );
        const classIds: readonly ElementTypeIri[] = [org.FormalOrganization, org.Role];
        const elementTypes = await provider.elementTypes({classIds});
        const result = classIds.map(id => elementTypes.get(id));
        expect(result).toEqual(
            [
                {
                    id: org.FormalOrganization,
                    label: [provider.factory.literal('Formal Organization', 'en')],
                    count: 0,
                },
                {
                    id: org.Role,
                    label: [provider.factory.literal('Role', 'en')],
                    count: 0,
                },
            ] satisfies ElementTypeModel[]
        );
    });

    it('provides linkTypes()', async () => {
        const provider = await makeSparqlDataProvider(
            {},
            {...OwlStatsSettings, filterOnlyLanguages: ['en']},
        );
        const linkTypeIds: readonly LinkTypeIri[] = [org.subOrganizationOf, org.memberOf];
        const linkTypes = await provider.linkTypes({linkTypeIds});
        const result = linkTypeIds.map(id => linkTypes.get(id));
        expect(result).toEqual(
            [
                {
                    id: org.subOrganizationOf,
                    label: [provider.factory.literal('subOrganization of', 'en')],
                    count: undefined,
                },
                {
                    id: org.memberOf,
                    label: [provider.factory.literal('member of', 'en')],
                    count: undefined,
                },
            ] satisfies LinkTypeModel[]
        );
    });

    it('provides propertyTypes()', async () => {
        const provider = await makeSparqlDataProvider(
            {},
            {...OwlStatsSettings, filterOnlyLanguages: ['en']},
        );
        const propertyIds: readonly PropertyTypeIri[] = [org.identifier, org.location];
        const propertyTypes = await provider.propertyTypes({propertyIds});
        const result = propertyIds.map(id => propertyTypes.get(id));
        expect(result).toEqual(
            [
                {
                    id: org.identifier,
                    label: [provider.factory.literal('identifier', 'en')],
                },
                {
                    id: org.location,
                    label: [provider.factory.literal('location', 'en')],
                },
            ] satisfies PropertyTypeModel[]
        );
    });

    it('provides elements()', async () => {
        const provider = await makeSparqlDataProvider(
            {},
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
                        [rdfs.label]: [provider.factory.literal('location', 'en')],
                        [rdfs.comment]: readPropertyValues(
                            dataset, org.location, rdfs.comment
                        ),
                    }
                },
            ] satisfies ElementModel[]
        );
    });

    it('provides links()', async () => {
        const provider = await makeSparqlDataProvider(
            {},
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

    it('provides lookup()', async () => {
        const provider = await makeSparqlDataProvider(
            {},
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
                            [rdfs.label]: [provider.factory.literal('identifier', 'en')],
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
                            [rdfs.label]: [provider.factory.literal('location', 'en')],
                        }
                    },
                    inLinks: new Set(),
                    outLinks: new Set(),
                },
            ] satisfies DataProviderLookupItem[]
        );
    });
});

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
