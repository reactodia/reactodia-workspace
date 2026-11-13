import * as N3 from 'n3';
import { describe, expect, it } from 'vitest';

import { RdfDataProvider } from '../../../src/data/rdf/rdfDataProvider';

import {
    linksOrgOntologyCases, lookupBasicOrgOntologyCases, lookupPatternOrgOntologyCases,
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
});

function makeRdfDataProvider() {
    const quads = new N3.Parser().parse(TURTLE_DATA);
    const provider = new RdfDataProvider();
    provider.addGraph(quads);
    return provider;
}
