import { HashMap } from '@reactodia/hashmap';

import { LookupPattern } from '../dataProvider';
import { ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri } from '../model';
import { RdfExpression, RdfExpressionEvaluator, effectiveBoolean } from '../rdfExpressions';
import { makeCaseInsensitiveFilter } from '../utils';

import { MemoryDataset } from './memoryDataset';
import * as Rdf from './rdfModel';

interface MatchItem {
    readonly term: Rdf.NamedNode | Rdf.BlankNode;
    outLinks?: Set<LinkTypeIri>;
    inLinks?: Set<LinkTypeIri>;
}

export interface MatchPatternContext {
    readonly dataset: MemoryDataset;
    readonly factory: Rdf.DataFactory;
    readonly evaluator: RdfExpressionEvaluator;
    readonly typePredicate: Rdf.NamedNode;
    readonly labelPredicate: Rdf.NamedNode | null;
}

export function matchPattern(
    pattern: LookupPattern,
    context: MatchPatternContext
): HashMap<Rdf.NamedNode | Rdf.BlankNode, MatchItem> {
    return joinWithPattern(undefined, pattern, context);
}

function joinWithPattern(
    previous: HashMap<Rdf.NamedNode | Rdf.BlankNode, MatchItem> | undefined,
    pattern: LookupPattern,
    context: MatchPatternContext
): HashMap<Rdf.NamedNode | Rdf.BlankNode, MatchItem> {
    switch (pattern.type) {
        case 'allOf': {
            if (pattern.patterns.length === 0) {
                return makeItemMap();
            }
            let items = previous;
            for (const p of pattern.patterns) {
                items = joinWithPattern(items, p, context);
            }
            return items ?? makeItemMap();
        }
        case 'anyOf': {
            const items = makeItemMap();
            for (const p of pattern.patterns) {
                const next = joinWithPattern(previous, p, context);
                for (const m of next.values()) {
                    const item = items.get(m.term);
                    items.set(m.term, item ? mergeItem(item, m) : m);
                }
            }
            return items;
        }
        case 'withText': {
            const items = makeItemMap();
            if (context.labelPredicate) {
                const textFilter = makeCaseInsensitiveFilter(pattern.text);
                const iterable = previous
                    ? iterateWithAllSubjects(context.dataset, context.labelPredicate, previous.values())
                    : context.dataset.iterateMatches(null, context.labelPredicate, null);
                for (const t of iterable) {
                    if (
                        isResourceTerm(t.subject) &&
                        t.object.termType === 'Literal' &&
                        textFilter(t.object.value) &&
                        !items.has(t.subject)
                    ) {
                        items.set(t.subject, {term: t.subject});
                    }
                }
            }
            return items;
        }
        case 'hasType': {
            const typeTerm = decodeTerm(pattern.elementType, context.factory);
            const items = makeItemMap();
            if (previous) {
                for (const item of previous.values()) {
                    if (context.dataset.hasMatches(item.term, context.typePredicate, typeTerm)) {
                        items.set(item.term, item);
                    }
                }
            } else {
                for (const t of context.dataset.iterateMatches(null, context.typePredicate, typeTerm)) {
                    if (isResourceTerm(t.subject) && !items.has(t.subject)) {
                        items.set(t.subject, {term: t.subject});
                    }
                }
            }
            return items;
        }
        case 'connectedTo': {
            const providedTerms = (pattern.values ?? []).map(v => decodeTerm(v, context.factory));
            const valueTerms = providedTerms.length === 0 ? [null] : providedTerms;
            const linkTerm = pattern.linkType ? decodeTerm(pattern.linkType, context.factory) : null;
            const items = makeItemMap();
            if (!pattern.linkDirection || pattern.linkDirection === 'out') {
                for (const valueTerm of valueTerms) {
                    for (const t of context.dataset.iterateMatches(valueTerm, linkTerm, null)) {
                        if (
                            t.predicate.termType === 'NamedNode' &&
                            isResourceTerm(t.object) &&
                            (!previous || previous.has(t.object))
                        ) {
                            const term = t.object;
                            let item = items.get(term);
                            if (!item) {
                                item = {term};
                                items.set(term, item);
                            }
                            const predicate: LinkTypeIri = encodeTerm(t.predicate);
                            if (!item.outLinks) {
                                item.outLinks = new Set();
                            }
                            item.outLinks.add(predicate);
                        }
                    }
                }
            }
            if (!pattern.linkDirection || pattern.linkDirection === 'in') {
                for (const valueTerm of valueTerms) {
                    for (const t of context.dataset.iterateMatches(null, linkTerm, valueTerm)) {
                        if (
                            t.predicate.termType === 'NamedNode' &&
                            isResourceTerm(t.subject) &&
                            (!previous || previous.has(t.subject))
                        ) {
                            const term = t.subject;
                            let item = items.get(term);
                            if (!item) {
                                item = {term};
                                items.set(term, item);
                            }
                            const predicate: LinkTypeIri = encodeTerm(t.predicate);
                            if (!item.inLinks) {
                                item.inLinks = new Set();
                            }
                            item.inLinks.add(predicate);
                        }
                    }
                }
            }
            return items;
        }
        case 'fromValues': {
            const items = makeItemMap();
            for (const value of pattern.values) {
                const valueTerm = decodeTerm(value, context.factory);
                if (!previous || previous.has(valueTerm)) {
                    items.set(valueTerm, {term: valueTerm});
                }
            }
            return items;
        }
        case 'hasProperty': {
            const providedTerms = pattern.values ?? [];
            const propertyTerm = decodeTerm(pattern.propertyType, context.factory);
            const items = makeItemMap();
            if (propertyTerm.termType === 'BlankNode') {
                return items;
            }
            const iterable = (
                previous ? iterateWithAllSubjects(context.dataset, propertyTerm, previous.values()) :
                providedTerms.length === 0 ? context.dataset.iterateMatches(null, propertyTerm, null) :
                iterateWithAllObjects(context.dataset, propertyTerm, providedTerms)
            );
            for (const t of iterable) {
                if (
                    isResourceTerm(t.subject) &&
                    (!previous || providedTerms.find(value => Rdf.equalTerms(t.object, value))) &&
                    (!pattern.filter || matchesFilter(t.object, pattern.filter, context.evaluator))
                ) {
                    items.set(t.subject, {term: t.subject});
                }
            }
            return items;
        }
    }
};
        
function makeItemMap() {
    return new HashMap<Rdf.NamedNode | Rdf.BlankNode, MatchItem>(
        Rdf.hashTerm, Rdf.equalTerms
    );
}
function mergeItem(a: MatchItem, b: MatchItem): MatchItem {
    if (!a.inLinks && !a.outLinks) {
        return b;
    } else if (!b.inLinks && !b.outLinks) {
        return a;
    } else {
        let inLinks: Set<LinkTypeIri> | undefined;
        if (a.inLinks && b.inLinks) {
            inLinks = new Set(a.inLinks);
            for (const link of b.inLinks) {
                inLinks.add(link);
            }
        } else {
            inLinks = a.inLinks ?? b.inLinks;
        }

        let outLinks: Set<LinkTypeIri> | undefined;
        if (a.outLinks && b.outLinks) {
            outLinks = new Set(a.outLinks);
            for (const link of b.outLinks) {
                outLinks.add(link);
            }
        } else {
            outLinks = a.outLinks ?? b.outLinks;
        }

        return {
            term: a.term,
            inLinks,
            outLinks,
        };
    }
}

function* iterateWithAllSubjects(
    dataset: MemoryDataset,
    predicate: Rdf.NamedNode,
    items: Iterable<MatchItem>
): IterableIterator<Rdf.Quad> {
    for (const item of items) {
        yield* dataset.iterateMatches(item.term, predicate, null);
    }
}

function* iterateWithAllObjects(
    dataset: MemoryDataset,
    predicate: Rdf.NamedNode,
    objects: readonly Rdf.Quad['object'][]
): IterableIterator<Rdf.Quad> {
    for (const object of objects) {
        yield* dataset.iterateMatches(null, predicate, object);
    }
}

function matchesFilter(
    term: Rdf.Term,
    filter: RdfExpression,
    evaluator: RdfExpressionEvaluator
): boolean {
    const result = evaluator.evaluate(filter, new Map([['value', term]]));
    return effectiveBoolean(result) || false;
}

export function isResourceTerm(term: Rdf.Term): term is Rdf.NamedNode | Rdf.BlankNode {
    switch (term.termType) {
        case 'NamedNode':
        case 'BlankNode':
            return true;
        default:
            return false;
    }
}

const BLANK_PREFIX = 'urn:reactodia:blank:rdf:';

export function encodeTerm(term: Rdf.NamedNode | Rdf.BlankNode): string {
    switch (term.termType) {
        case 'NamedNode':
            return term.value;
        case 'BlankNode':
            return BLANK_PREFIX + term.value;
        default:
            throw new Error(
                `Unexpected term type to encode: ${(term as Rdf.Term).termType}`
            );
    }
}

export function decodeTerm(
    iri: ElementIri | ElementTypeIri | LinkTypeIri | PropertyTypeIri,
    factory: Rdf.DataFactory
): Rdf.NamedNode | Rdf.BlankNode {
    if (iri.startsWith(BLANK_PREFIX)) {
        return factory.blankNode(iri.substring(BLANK_PREFIX.length));
    } else {
        return factory.namedNode(iri);
    }
}
