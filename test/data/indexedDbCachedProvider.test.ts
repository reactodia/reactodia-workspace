import { expect, describe, it, vi } from 'vitest';

import { IndexedDbCachedProvider } from '../../src/data/indexedDb/indexedDbCachedProvider';
import type {
    ElementIri, ElementTypeIri, LinkModel, LinkTypeIri, PropertyTypeIri,
} from '../../src/data/model';
import {
    MockDataProvider, element, elementType, linkType, propertyType, missing,
} from '../mock/mockDataProvider';

describe('IndexedDbCachedProvider', () => {
    it('caches data once for known element/link types', async () => {
        const baseProvider = new MockDataProvider();
        const knownElementTypesSpy = vi.spyOn(baseProvider, 'knownElementTypes');
        const knownLinkTypesSpy = vi.spyOn(baseProvider, 'knownLinkTypes');

        const controller = new AbortController();
        try {
            const provider = new IndexedDbCachedProvider({
                baseProvider,
                dbName: 'test',
                closeSignal: controller.signal,
            });

            await provider.clearCache();

            await provider.knownElementTypes({});
            await provider.knownLinkTypes({});

            expect(knownElementTypesSpy.mock.calls.length).toEqual(1);
            expect(knownLinkTypesSpy.mock.calls.length).toEqual(1);

            await provider.knownElementTypes({});
            await provider.knownLinkTypes({});

            expect(knownElementTypesSpy.mock.calls.length).toEqual(1);
            expect(knownLinkTypesSpy.mock.calls.length).toEqual(1);
        } finally {
            controller.abort();
        }
    });

    it('caches data for elements', async () => {
        const baseProvider = new MockDataProvider();
        const elementsSpy = vi.spyOn(baseProvider, 'elements');

        const controller = new AbortController();
        try {
            const provider = new IndexedDbCachedProvider({
                baseProvider,
                dbName: 'test',
                closeSignal: controller.signal,
            });

            await provider.clearCache();

            await provider.elements({
                elementIds: [element('a'), element('b'), missing(element('c'))],
            });

            expect(elementsSpy.mock.calls.map(call => call[0].elementIds)).toEqual([
                [element('a'), element('b'), missing(element('c'))],
            ] satisfies Array<ElementIri[]>);

            await provider.elements({
                elementIds: [element('d'), element('b'), missing(element('c')), element('e')],
            });

            expect(elementsSpy.mock.calls.map(call => call[0].elementIds)).toEqual([
                [element('a'), element('b'), missing(element('c'))],
                [element('d'), element('e')],
            ] satisfies Array<ElementIri[]>);
        } finally {
            controller.abort();
        }
    });

    it('caches data for element/link/property types', async () => {
        const baseProvider = new MockDataProvider();
        const elementTypesSpy = vi.spyOn(baseProvider, 'elementTypes');
        const linkTypesSpy = vi.spyOn(baseProvider, 'linkTypes');
        const propertyTypesSpy = vi.spyOn(baseProvider, 'propertyTypes');

        const controller = new AbortController();
        try {
            const provider = new IndexedDbCachedProvider({
                baseProvider,
                dbName: 'test',
                closeSignal: controller.signal,
            });

            await provider.clearCache();

            await provider.elementTypes({
                classIds: [elementType('a'), elementType('b'), missing(elementType('c'))],
            });

            await provider.linkTypes({
                linkTypeIds: [linkType('a'), linkType('b'), missing(linkType('c'))],
            });

            await provider.propertyTypes({
                propertyIds: [propertyType('a'), propertyType('b'), missing(propertyType('c'))],
            });

            expect(elementTypesSpy.mock.calls.map(call => call[0].classIds)).toEqual([
                [elementType('a'), elementType('b'), missing(elementType('c'))],
            ] satisfies Array<ElementTypeIri[]>);

            expect(linkTypesSpy.mock.calls.map(call => call[0].linkTypeIds)).toEqual([
                [linkType('a'), linkType('b'), missing(linkType('c'))],
            ] satisfies Array<LinkTypeIri[]>);

            expect(propertyTypesSpy.mock.calls.map(call => call[0].propertyIds)).toEqual([
                [propertyType('a'), propertyType('b'), missing(propertyType('c'))],
            ] satisfies Array<PropertyTypeIri[]>);

            await provider.elementTypes({
                classIds: [
                    elementType('d'), elementType('b'), missing(elementType('c')), elementType('e'),
                ],
            });

            await provider.linkTypes({
                linkTypeIds: [
                    linkType('d'), linkType('b'), missing(linkType('c')), linkType('e'),
                ],
            });

            await provider.propertyTypes({
                propertyIds: [
                    propertyType('d'), propertyType('b'), missing(propertyType('c')), propertyType('e'),
                ],
            });

            expect(elementTypesSpy.mock.calls.map(call => call[0].classIds)).toEqual([
                [elementType('a'), elementType('b'), missing(elementType('c'))],
                [elementType('d'), elementType('e')],
            ] satisfies Array<ElementTypeIri[]>);

            expect(linkTypesSpy.mock.calls.map(call => call[0].linkTypeIds)).toEqual([
                [linkType('a'), linkType('b'), missing(linkType('c'))],
                [linkType('d'), linkType('e')],
            ] satisfies Array<LinkTypeIri[]>);

            expect(propertyTypesSpy.mock.calls.map(call => call[0].propertyIds)).toEqual([
                [propertyType('a'), propertyType('b'), missing(propertyType('c'))],
                [propertyType('d'), propertyType('e')],
            ] satisfies Array<PropertyTypeIri[]>);
        } finally {
            controller.abort();
        }
    });

    it('avoid caching missing data if disabled via option', async () => {
        const baseProvider = new MockDataProvider();
        const elementsSpy = vi.spyOn(baseProvider, 'elements');
        const elementTypesSpy = vi.spyOn(baseProvider, 'elementTypes');
        const linkTypesSpy = vi.spyOn(baseProvider, 'linkTypes');
        const propertyTypesSpy = vi.spyOn(baseProvider, 'propertyTypes');

        const controller = new AbortController();
        try {
            const provider = new IndexedDbCachedProvider({
                baseProvider,
                dbName: 'test',
                cacheMissing: false,
                closeSignal: controller.signal,
            });

            await provider.clearCache();

            const requestData = async () => {
                await provider.elements({
                    elementIds: [element('a'), missing(element('b'))],
                });
    
                await provider.elementTypes({
                    classIds: [elementType('a'), missing(elementType('b'))],
                });
    
                await provider.linkTypes({
                    linkTypeIds: [linkType('a'), missing(linkType('b'))],
                });
    
                await provider.propertyTypes({
                    propertyIds: [propertyType('a'), missing(propertyType('b'))],
                });
            };

            await requestData();
            await requestData();

            expect(elementsSpy.mock.calls.map(call => call[0].elementIds)).toEqual([
                [element('a'), missing(element('b'))],
                [missing(element('b'))],
            ] satisfies Array<ElementIri[]>);

            expect(elementTypesSpy.mock.calls.map(call => call[0].classIds)).toEqual([
                [elementType('a'), missing(elementType('b'))],
                [missing(elementType('b'))],
            ] satisfies Array<ElementTypeIri[]>);

            expect(linkTypesSpy.mock.calls.map(call => call[0].linkTypeIds)).toEqual([
                [linkType('a'), missing(linkType('b'))],
                [missing(linkType('b'))],
            ] satisfies Array<LinkTypeIri[]>);

            expect(propertyTypesSpy.mock.calls.map(call => call[0].propertyIds)).toEqual([
                [propertyType('a'), missing(propertyType('b'))],
                [missing(propertyType('b'))],
            ] satisfies Array<PropertyTypeIri[]>);
        } finally {
            controller.abort();
        }
    });

    it('caches data for links', async () => {
        const baseProvider = new MockDataProvider();
        const linksSpy = vi.spyOn(baseProvider, 'links');

        const popLinksCalls = () => {
            const calls = linksSpy.mock.calls.map(
                ([params]) => ({primary: params.primary, secondary: params.secondary})
            );
            linksSpy.mock.calls.length = 0;
            return calls;
        };
        type LinkRequest = ReturnType<typeof popLinksCalls>;

        const controller = new AbortController();
        try {
            const provider = new IndexedDbCachedProvider({
                baseProvider,
                dbName: 'test',
                closeSignal: controller.signal,
            });

            await provider.clearCache();

            await provider.links({
                primary: [element('a'), element('b'), element('c'), element('d')],
                secondary: [element('a'), element('b'), element('e')],
            });

            expect(popLinksCalls()).toEqual([
                {
                    primary: [element('a'), element('b'), element('c'), element('d')],
                    secondary: [element('a'), element('b'), element('e')]
                },
            ] satisfies LinkRequest);

            await provider.links({
                primary: [element('a'), element('b')],
                secondary: [element('b')],
            });

            expect(popLinksCalls()).toEqual([] satisfies LinkRequest);

            await provider.links({
                primary: [element('c'), element('x')],
                secondary: [element('a'), element('f')],
            });

            expect(popLinksCalls()).toEqual([
                {
                    primary: [element('c')],
                    secondary: [element('f')],
                },
                {
                    primary: [element('x')],
                    secondary: [element('a'), element('f')],
                },
            ] satisfies LinkRequest);

            await provider.links({
                primary: [element('c')],
                secondary: [element('a'), element('b')],
            });

            expect(popLinksCalls()).toEqual([] satisfies LinkRequest);
        } finally {
            controller.abort();
        }
    });

    it('caches data for links (ascending)', async () => {
        const baseProvider = new MockDataProvider();
        const linksSpy = vi.spyOn(baseProvider, 'links');

        const popLinksCalls = () => {
            const calls = linksSpy.mock.calls.map(
                ([params]) => ({primary: params.primary, secondary: params.secondary})
            );
            linksSpy.mock.calls.length = 0;
            return calls;
        };
        type LinkRequest = ReturnType<typeof popLinksCalls>;

        const controller = new AbortController();
        try {
            const provider = new IndexedDbCachedProvider({
                baseProvider,
                dbName: 'test',
                closeSignal: controller.signal,
            });

            await provider.clearCache();

            await provider.links({
                primary: [element('a')],
                secondary: [element('a')],
            });

            expect(popLinksCalls()).toEqual([
                {
                    primary: [element('a')],
                    secondary: [element('a')],
                },
            ] satisfies LinkRequest);

            await provider.links({
                primary: [element('a'), element('b')],
                secondary: [element('b')],
            });

            expect(popLinksCalls()).toEqual([
                {
                    primary: [element('a'), element('b')],
                    secondary: [element('b')],
                },
            ] satisfies LinkRequest);

            await provider.links({
                primary: [element('a'), element('b'), element('c')],
                secondary: [element('c')],
            });

            expect(popLinksCalls()).toEqual([
                {
                    primary: [element('a'), element('b'), element('c')],
                    secondary: [element('c')],
                },
            ] satisfies LinkRequest);

            await provider.links({
                primary: [element('a'), element('b'), element('c'), element('d')],
                secondary: [element('d')],
            });

            expect(popLinksCalls()).toEqual([
                {
                    primary: [element('a'), element('b'), element('c'), element('d')],
                    secondary: [element('d')],
                },
            ] satisfies LinkRequest);

            await provider.links({
                primary: [element('a'), element('b'), element('c'), element('d')],
                secondary: [element('a'), element('b'), element('c'), element('d')],
            });

            expect(popLinksCalls()).toEqual([] satisfies LinkRequest);
        } finally {
            controller.abort();
        }
    });

    it('uses cached data for reverse links as well', async () => {
        const baseProvider = new MockDataProvider();
        const linksSpy = vi.spyOn(baseProvider, 'links');

        const popLinksCalls = () => {
            const calls = linksSpy.mock.calls.map(
                ([params]) => ({primary: params.primary, secondary: params.secondary})
            );
            linksSpy.mock.calls.length = 0;
            return calls;
        };
        type LinkRequest = ReturnType<typeof popLinksCalls>;

        const controller = new AbortController();
        try {
            const provider = new IndexedDbCachedProvider({
                baseProvider,
                dbName: 'test',
                closeSignal: controller.signal,
            });

            await provider.clearCache();

            await provider.links({
                primary: [element('a'), element('b'), element('c'), element('d')],
                secondary: [element('a'), element('b'), element('e')],
            });

            expect(popLinksCalls()).toEqual([
                {
                    primary: [element('a'), element('b'), element('c'), element('d')],
                    secondary: [element('a'), element('b'), element('e')]
                },
            ] satisfies LinkRequest);

            await provider.links({
                primary: [element('e'), element('b')],
                secondary: [element('b')],
            });

            expect(popLinksCalls()).toEqual([] satisfies LinkRequest);
        } finally {
            controller.abort();
        }
    });

    it('returns all cached links matching the request', async () => {
        const baseProvider = new MockDataProvider();

        const controller = new AbortController();
        try {
            const provider = new IndexedDbCachedProvider({
                baseProvider,
                dbName: 'test',
                closeSignal: controller.signal,
            });

            await provider.clearCache();

            const links = await provider.links({
                primary: [
                    element('a'), element('bb'),
                    element('aa'), element('b'),
                    element('self-a'), element('self-aaa'),
                    element('full-a'), element('full-b'),
                ],
                secondary: [
                    element('a'), element('b'),
                    element('aa'), element('bb'),
                    element('self-a'), element('self-aa'),
                    element('full-a'), element('full-b'),
                ],
            });

            links.sort(compareLinks);

            expect(links).toEqual([
                {
                    sourceId: 'element:a',
                    targetId: 'element:aa',
                    linkTypeId: 'link-type:prefix-of',
                    properties: {},
                },
                {
                    sourceId: 'element:b',
                    targetId: 'element:bb',
                    linkTypeId: 'link-type:prefix-of',
                    properties: {},
                },
                {
                    sourceId: 'element:full-a',
                    targetId: 'element:full-b',
                    linkTypeId: 'link-type:related',
                    properties: {},
                },
                {
                    sourceId: 'element:full-b',
                    targetId: 'element:full-a',
                    linkTypeId: 'link-type:related',
                    properties: {},
                },
                {
                    sourceId: 'element:self-a',
                    targetId: 'element:self-a',
                    linkTypeId: 'link-type:self',
                    properties: {},
                },
                {
                    sourceId: 'element:self-a',
                    targetId: 'element:self-aa',
                    linkTypeId: 'link-type:prefix-of',
                    properties: {},
                },
                {
                    sourceId: 'element:self-a',
                    targetId: 'element:self-aaa',
                    linkTypeId: 'link-type:prefix-of',
                    properties: {},
                },
                {
                    sourceId: 'element:self-aa',
                    targetId: 'element:self-aaa',
                    linkTypeId: 'link-type:prefix-of',
                    properties: {},
                },
            ]);

        } finally {
            controller.abort();
        }
    });
});

function compareLinks(a: LinkModel, b: LinkModel): number {
    let result = (
        a.sourceId < b.sourceId ? -1 :
        a.sourceId > b.sourceId ? 1 :
        0
    );
    if (result !== 0) {
        return result;
    }
    result = (
        a.targetId < b.targetId ? -1 :
        a.targetId > b.targetId ? 1 :
        0
    );
    if (result !== 0) {
        return result;
    }
    result = (
        a.linkTypeId < b.linkTypeId ? -1 :
        a.linkTypeId > b.linkTypeId ? 1 :
        0
    );
    return result;
}
