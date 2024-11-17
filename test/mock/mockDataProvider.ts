import { HashSet } from '../../src/coreUtils/hashMap';
import { EmptyDataProvider } from '../../src/data/decorated/emptyDataProvider';
import {
    ElementIri, ElementModel,
    ElementTypeGraph,
    ElementTypeIri, ElementTypeModel,
    LinkModel,
    LinkTypeIri, LinkTypeModel,
    PropertyTypeIri, PropertyTypeModel,
    hashLink, equalLinks,
} from '../../src/data/model';

export class MockDataProvider extends EmptyDataProvider {
    knownElementTypes(params: {
        signal?: AbortSignal | undefined;
    }): Promise<ElementTypeGraph> {
        const typeGraph: ElementTypeGraph = {
            elementTypes: [
                {
                    id: elementType('root'),
                    label: [],
                },
                {
                    id: elementType('aa'),
                    label: [],
                },
                {
                    id: elementType('bb'),
                    label: [],
                },
                {
                    id: elementType('cc'),
                    label: [],
                }
            ],
            subtypeOf: [
                [elementType('aa'), elementType('root')],
                [elementType('bb'), elementType('root')],
                [elementType('cc'), elementType('bb')],
            ],
        };
        return Promise.resolve(typeGraph);
    }

    knownLinkTypes(params: {
        signal?: AbortSignal | undefined;
    }): Promise<LinkTypeModel[]> {
        const linkTypes: LinkTypeModel[] = [
            {
                id: linkType('aa'),
                label: [],
            },
            {
                id: linkType('bb'),
                label: [],
            },
            {
                id: linkType('cc'),
                label: [],
            },
        ];
        return Promise.resolve(linkTypes);
    }

    elements(params: {
        elementIds: readonly ElementIri[];
        signal?: AbortSignal | undefined;
    }): Promise<Map<ElementIri, ElementModel>> {
        const result = new Map<ElementIri, ElementModel>();
        for (const iri of params.elementIds) {
            if (!iri.startsWith('element:')) {
                continue;
            }
            result.set(iri, {
                id: iri,
                types: [],
                label: [],
                properties: {},
            });
        }
        return Promise.resolve(result);
    }

    links(params: {
        primary: ReadonlyArray<ElementIri>;
        secondary: ReadonlyArray<ElementIri>;
        linkTypeIds?: readonly LinkTypeIri[] | undefined;
        signal?: AbortSignal | undefined;
    }): Promise<LinkModel[]> {
        const result = new HashSet<LinkModel>(hashLink, equalLinks);
        for (const primaryIri of params.primary) {
            for (const secondaryIri of params.secondary) {
                if (primaryIri === secondaryIri) {
                    if (primaryIri.startsWith('element:self-')) {
                        result.add({
                            sourceId: primaryIri,
                            targetId: primaryIri,
                            linkTypeId: linkType('self'),
                            properties: {},
                        });
                    }
                } else {
                    if (secondaryIri.startsWith(primaryIri)) {
                        result.add({
                            sourceId: primaryIri,
                            targetId: secondaryIri,
                            linkTypeId: linkType('prefix-of'),
                            properties: {},
                        });
                    } else if (primaryIri.startsWith(secondaryIri)) {
                        result.add({
                            sourceId: secondaryIri,
                            targetId: primaryIri,
                            linkTypeId: linkType('prefix-of'),
                            properties: {},
                        });
                    }

                    if (
                        primaryIri.startsWith('element:full-') &&
                        secondaryIri.startsWith('element:full-')
                    ) {
                        result.add({
                            sourceId: primaryIri,
                            targetId: secondaryIri,
                            linkTypeId: linkType('related'),
                            properties: {},
                        });
                        result.add({
                            sourceId: secondaryIri,
                            targetId: primaryIri,
                            linkTypeId: linkType('related'),
                            properties: {},
                        });
                    }
                }
            }
        }
        return Promise.resolve(Array.from(result));
    }

    elementTypes(params: {
        classIds: readonly ElementTypeIri[];
        signal?: AbortSignal | undefined;
    }): Promise<Map<ElementTypeIri, ElementTypeModel>> {
        const result = new Map<ElementTypeIri, ElementTypeModel>();
        for (const iri of params.classIds) {
            if (!iri.startsWith('element-type:')) {
                continue;
            }
            result.set(iri, {
                id: iri,
                label: [],
            });
        }
        return Promise.resolve(result);
    }

    linkTypes(params: {
        linkTypeIds: readonly LinkTypeIri[];
        signal?: AbortSignal | undefined;
    }): Promise<Map<LinkTypeIri, LinkTypeModel>> {
        const result = new Map<LinkTypeIri, LinkTypeModel>();
        for (const iri of params.linkTypeIds) {
            if (!iri.startsWith('link-type:')) {
                continue;
            }
            result.set(iri, {
                id: iri,
                label: [],
            });
        }
        return Promise.resolve(result);
    }

    propertyTypes(params: {
        propertyIds: readonly PropertyTypeIri[];
        signal?: AbortSignal | undefined;
    }): Promise<Map<PropertyTypeIri, PropertyTypeModel>> {
        const result = new Map<PropertyTypeIri, PropertyTypeModel>();
        for (const iri of params.propertyIds) {
            if (!iri.startsWith('property-type:')) {
                continue;
            }
            result.set(iri, {
                id: iri,
                label: [],
            });
        }
        return Promise.resolve(result);
    }
}

export function element(key: string): ElementIri {
    return `element:${key}` as ElementIri;
}

export function elementType(key: string): ElementTypeIri {
    return `element-type:${key}` as ElementTypeIri;
}

export function linkType(key: string): LinkTypeIri {
    return `link-type:${key}` as LinkTypeIri;
}

export function propertyType(key: string): PropertyTypeIri {
    return `property-type:${key}` as PropertyTypeIri;
}

export function missing<T extends string>(iri: T): T {
    return `missing:${iri}` as T;
}
