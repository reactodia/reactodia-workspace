import { describe, expect, it } from 'vitest';

import { LookupPattern } from '../../src/data/dataProvider';
import * as Rdf from '../../src/data/rdf/rdfModel';
import { xsd } from '../../src/data/rdf/vocabulary';
import {
    SearchPattern, SearchPatternType, SearchPatternGenerateContext, SearchPatternError,
    SearchPatternToJsonContext, SearchPatternFromJsonContext,
    SearchPatternAnd, SearchPatternOr, SearchPatternHasType,
    SearchPatternConnectedTo, SearchPatternFromValues, SearchPatternHasProperty,
} from '../../src/widgets/instancesSearch/searchPattern';

describe('SearchPattern', () => {
    it('can be used to generate lookup pattern', async () => {
        const sourcePattern = new SearchPatternAnd({
            patterns: [
                new SearchPatternOr({
                    patterns: [
                        new SearchPatternHasType({
                            elementType: 'http://example.com/schema/Organization',
                        }),
                        new IsPersonAndSteamboat({boatSize: 'medium'}),
                    ],
                }),
                new SearchPatternConnectedTo({
                    linkType: 'http://example.com/schema/sameAs',
                    linkDirection: 'in',
                    other: new SearchPatternFromValues({
                        values: [
                            'http://example.com/data/Adam_Johann_von_Krusenstern',
                            'http://example.com/data/Theodor_Ivanovich_Nette',
                        ],
                    }),
                }),
                new SearchPatternHasProperty({
                    propertyType: 'http://example.com/schema/describedAt',
                    values: [
                        Rdf.DefaultDataFactory.literal(
                            '2020-01-01T12:00:00.000Z',
                            xsd.dateTime
                        ),
                        Rdf.DefaultDataFactory.literal(
                            '2020-02-02T15:30:00.000Z',
                            xsd.dateTime
                        ),
                    ],
                }),
            ],
        });

        const generatedPattern = sourcePattern.generate({
            factory: Rdf.DefaultDataFactory,
        });
        const expectedPattern: LookupPattern = {
            type: 'and',
            patterns: [
                {
                    type: 'or',
                    patterns: [
                        {
                            type: 'hasType',
                            elementType: 'http://example.com/schema/Organization',
                        },
                        {
                            type: 'and',
                            patterns: [
                                {
                                    type: 'hasType',
                                    elementType: 'http://example.com/schema/Person',
                                },
                                {
                                    type: 'hasType',
                                    elementType: 'http://example.com/schema/Streamboat',
                                },
                                {
                                    type: 'hasProperty',
                                    propertyType: 'http://example.com/schema/boatSize',
                                    values: [
                                        Rdf.DefaultDataFactory.literal('medium'),
                                    ],
                                },
                            ],
                        },
                    ],
                },
                {
                    type: 'connectedTo',
                    linkType: 'http://example.com/schema/sameAs',
                    linkDirection: 'in',
                    other: {
                        type: 'fromValues',
                        values: [
                            'http://example.com/data/Adam_Johann_von_Krusenstern',
                            'http://example.com/data/Theodor_Ivanovich_Nette',
                        ],
                    },
                },
                {
                    type: 'hasProperty',
                    propertyType: 'http://example.com/schema/describedAt',
                    values: [
                        Rdf.DefaultDataFactory.literal(
                            '2020-01-01T12:00:00.000Z',
                            xsd.dateTime
                        ),
                        Rdf.DefaultDataFactory.literal(
                            '2020-02-02T15:30:00.000Z',
                            xsd.dateTime
                        ),
                    ],
                },
            ],
        };
        expect(generatedPattern).toStrictEqual(expectedPattern);
    });

    it('can be serialized then deserialized back', async () => {
        const patternTypes: readonly SearchPatternType[] = [
            SearchPatternAnd,
            SearchPatternOr,
            SearchPatternHasType,
            SearchPatternConnectedTo,
            SearchPatternFromValues,
            SearchPatternHasProperty,
            IsPersonAndSteamboat,
        ];
        const indexedTypes = new Map(
            patternTypes.map(type => [type.fromJSONType, type] as const)
        );
        const toContext: SearchPatternToJsonContext = {
            toJson: pattern => pattern.toJSON(toContext),
        };
        const fromContext: SearchPatternFromJsonContext = {
            factory: Rdf.DefaultDataFactory,
            fromJson: raw => {
                const patternType = indexedTypes.get(raw['@type']);
                if (!patternType) {
                    throw new Error(`Unknown pattern type '${raw['@type']}'`);
                }
                return patternType.fromJSON(raw, fromContext);
            },
        };

        const initialPattern = new SearchPatternAnd({
            patterns: [
                new SearchPatternOr({
                    patterns: [
                        new SearchPatternHasType({
                            elementType: 'http://example.com/schema/Organization',
                        }),
                        new IsPersonAndSteamboat({boatSize: 'medium'}),
                    ],
                }),
                new SearchPatternConnectedTo({
                    linkType: 'http://example.com/schema/sameAs',
                    linkDirection: 'in',
                    other: new SearchPatternFromValues({
                        values: [
                            'http://example.com/data/Adam_Johann_von_Krusenstern',
                            'http://example.com/data/Theodor_Ivanovich_Nette',
                        ],
                    }),
                }),
                new SearchPatternHasProperty({
                    propertyType: 'http://example.com/schema/describedAt',
                    values: [
                        Rdf.DefaultDataFactory.literal(
                            '2020-01-01T12:00:00.000Z',
                            xsd.dateTime
                        ),
                        Rdf.DefaultDataFactory.literal(
                            '2020-02-02T15:30:00.000Z',
                            xsd.dateTime
                        ),
                    ],
                }),
            ],
        });

        const serializedPattern = toContext.toJson(initialPattern);
        const deserializedPattern = fromContext.fromJson(serializedPattern);
        expect(deserializedPattern).toStrictEqual(initialPattern);
    });
});

class IsPersonAndSteamboat extends SearchPattern<{
    readonly boatSize?: 'small' | 'medium' | 'large';
}> {
    generate(context: SearchPatternGenerateContext): LookupPattern | SearchPatternError {
        const {boatSize} = this.state;
        if (!boatSize) {
            return {
                type: 'error',
                errors: [
                    {
                        target: this,
                        message: 'Boat size is required.',
                    },
                ],
            };
        }
        return {
            type: 'and',
            patterns: [
                {
                    type: 'hasType',
                    elementType: 'http://example.com/schema/Person',
                },
                {
                    type: 'hasType',
                    elementType: 'http://example.com/schema/Streamboat',
                },
                {
                    type: 'hasProperty',
                    propertyType: 'http://example.com/schema/boatSize',
                    values: [
                        context.factory.literal(boatSize)
                    ],
                },
            ],
        };
    }

    static readonly fromJSONType: RawIsPersonAndSteamboat['@type'] =
        'IsPersonAndSteamboat';

    static fromJSON(
        raw: RawIsPersonAndSteamboat,
        context: SearchPatternFromJsonContext
    ): IsPersonAndSteamboat {
        const {boatSize} = raw;
        return new IsPersonAndSteamboat({boatSize});
    }

    toJSON(context: SearchPatternToJsonContext): RawIsPersonAndSteamboat {
        const {boatSize} = this.state;
        return {
            '@type': 'IsPersonAndSteamboat',
            boatSize,
        };
    }
}

SearchPattern.define(IsPersonAndSteamboat);

interface RawIsPersonAndSteamboat {
    '@type': 'IsPersonAndSteamboat';
    boatSize?: 'small' | 'medium' | 'large';
}
