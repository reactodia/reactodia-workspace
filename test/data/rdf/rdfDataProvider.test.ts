import * as N3 from 'n3';
import { describe, expect, it } from 'vitest';

import { RdfDataProvider } from '../../../src/data/rdf/rdfDataProvider';
import * as Rdf from '../../../src/data/rdf/rdfModel';

import {
    linksOrgOntologyCases, lookupBasicOrgOntologyCases, lookupPatternOrgOntologyCases,
    lookupWithLinksOrgOntologyCases,
} from '../orgOntologyCases';
import { compareLinks, compareLookupItemsByIri } from '../../utilities/dataCompare';

import TURTLE_DATA from '../../../examples/resources/orgOntology.ttl?raw';

describe('RdfDataProvider', () => {
    it.each(
        linksOrgOntologyCases
    )('provides links() by "%s"', async (name, params, expectedLinks) => {
        const provider = makeRdfDataProvider();
        const links = await provider.links(params);
        links.sort(compareLinks);
        expect(links).toEqual(expectedLinks);
    });

    it.each(
        lookupBasicOrgOntologyCases
    )('provides lookup() by "%s"', async (name, params, expectedIds) => {
        const provider = makeRdfDataProvider();
        const items = await provider.lookup(params);
        items.sort(compareLookupItemsByIri);
        expect(items.map(item => item.element.id)).toEqual(expectedIds);
    });

    it.each(
        lookupPatternOrgOntologyCases
    )('provides lookup() by pattern "%s"', async (name, params, expectedIds) => {
        const provider = makeRdfDataProvider();
        const items = await provider.lookup(params);
        items.sort(compareLookupItemsByIri);
        expect(items.map(item => item.element.id)).toEqual(expectedIds);
    });

    it.each(
        lookupWithLinksOrgOntologyCases   
    )('provides lookup({withLinks: true}) by "%s"', async (name, params, expectedItems) => {
        const provider = makeRdfDataProvider();
        const items = await provider.lookup(params);
        items.sort(compareLookupItemsByIri);
        for (const {element} of items) {
            const removeProperties: string[] = [];
            for (const propertyId in element.properties) {
                if (Object.hasOwn(element.properties, propertyId)) {
                    const propertyValues =
                        element.properties[propertyId] as (Rdf.NamedNode | Rdf.Literal)[];
                    keepOnlyValuesWithLanguage(propertyValues, 'en');
                    if (propertyValues.length === 0) {
                        removeProperties.push(propertyId);
                    }
                }
            }
            for (const propertyId of removeProperties) {
                const properties = element.properties as { [id: string]: unknown };
                delete properties[propertyId];
            }
        }
        expect(items).toEqual(expectedItems);
    });
});

function makeRdfDataProvider() {
    const quads = new N3.Parser().parse(TURTLE_DATA);
    const provider = new RdfDataProvider();
    provider.addGraph(quads);
    return provider;
}

function keepOnlyValuesWithLanguage(
    values: (Rdf.NamedNode | Rdf.Literal)[],
    language: string
): void {
    const found = values.filter(v => v.termType === 'Literal' && v.language === language);
    values.length = 0;
    for (const value of found) {
        values.push(value);
    }
}
