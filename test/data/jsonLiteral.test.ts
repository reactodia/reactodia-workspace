import { describe, expect, it } from 'vitest';

import * as Rdf from '../../src/data/rdf/rdfModel';

const JSON_STRING =
`{
  "authoredBy": "user",
  "likes":42,
  "location": { "x":102, "y":-12.3 },
  "tags": ["todo", { "id":"toDelete", "name":"To delete" }]
}`;

describe('JsonLiteral', () => {
    it('can be created from a JS value', () => {
        const serializedAsIs = [
            null,
            true,
            42,
            -0,
            Infinity,
            NaN,
            'A quick brown fox\r\njumped!',
            ['test', {x: 1, y: 2.5}],
            {
                first: 'First',
                middle: {value: 'Middle'},
                last: ['Last'],
            },
        ];
        
        for (const value of serializedAsIs) {
            const json = Rdf.JsonLiteral.create(Rdf.DefaultDataFactory, value);
            expect(json.value).toBe(JSON.stringify(value));
        }

        expect(Rdf.JsonLiteral.create(Rdf.DefaultDataFactory, undefined).value)
            .toBe('null');
    });

    it('can be parsed from valid RDF literal with JSON datatype', () => {
        const json = Rdf.JsonLiteral.fromLiteral(Rdf.DefaultDataFactory.literal(
            JSON_STRING,
            Rdf.DefaultDataFactory.namedNode(Rdf.Vocabulary.rdf.JSON)
        ));
        expect(json).toBeTruthy();
        expect(json?.content).to.be.eql({
            authoredBy: 'user',
            likes: 42,
            location: {
                x: 102,
                y: -12.3,
            },
            tags: ['todo', { id: 'toDelete', name: 'To delete' }],
        });
    });

    it('cannot be parsed from literal with an invalid JSON string', () => {
        const json = Rdf.JsonLiteral.fromLiteral(Rdf.DefaultDataFactory.literal(
            '{ "x": 1, "y": 2',
            Rdf.DefaultDataFactory.namedNode(Rdf.Vocabulary.rdf.JSON)
        ));
        expect(json).toBe(undefined);
    });

    it('has string-based equality semantics for equals() and structure-based for equalTerms()', () => {
        const jsonA = Rdf.JsonLiteral.fromLiteral(Rdf.DefaultDataFactory.literal(
            '{ "x": 1, "y": 2 }',
            Rdf.DefaultDataFactory.namedNode(Rdf.Vocabulary.rdf.JSON)
        ))!;
        const jsonB = Rdf.JsonLiteral.fromLiteral(Rdf.DefaultDataFactory.literal(
            '{ "y": 2, "x": 1 }',
            Rdf.DefaultDataFactory.namedNode(Rdf.Vocabulary.rdf.JSON)
        ))!;
        expect(jsonA.equals(jsonB))
            .to.be.equal(false, 'JSON literals are compared by string values via equals()');
        expect(Rdf.equalTerms(jsonA, jsonB))
            .to.be.equal(true, 'JSON literals are compared by structure via equalTerms()');
    });

    it('hashes based on value structure', () => {
        const jsonA = Rdf.JsonLiteral.fromLiteral(Rdf.DefaultDataFactory.literal(
            '{ "x": 1, "y": 2 }',
            Rdf.DefaultDataFactory.namedNode(Rdf.Vocabulary.rdf.JSON)
        ))!;
        const jsonB = Rdf.JsonLiteral.fromLiteral(Rdf.DefaultDataFactory.literal(
            '{ "y": 2, "x": 1 }',
            Rdf.DefaultDataFactory.namedNode(Rdf.Vocabulary.rdf.JSON)
        ))!;
        const jsonC = Rdf.JsonLiteral.fromLiteral(Rdf.DefaultDataFactory.literal(
            '{ "y": 2, "x": 1, "z": null }',
            Rdf.DefaultDataFactory.namedNode(Rdf.Vocabulary.rdf.JSON)
        ))!;
        expect(Rdf.hashTerm(jsonA)).toBe(553668630);
        expect(Rdf.hashTerm(jsonB)).toBe(553668630);
        expect(Rdf.hashTerm(jsonC)).toBe(1132359522);
    });
});
