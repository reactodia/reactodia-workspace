import { ElementModel, ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri } from '../../data/model';
import {
    DataProviderLookupParams, DataProviderLookupItem, LookupPattern,
} from '../../data/dataProvider';
import type * as Rdf from '../../data/rdf/rdfModel';

/**
 * A filter criteria for the entity lookup from a {@link DataProvider}.
 *
 * @see {@link DataProviderLookupParams}
 */
export interface SearchCriteria {
    /**
     * Filter by a text lookup.
     */
    readonly text?: string;
    /**
     * Filter by an element type.
     */
    readonly elementType?: ElementTypeIri;
    /**
     * Filter by having a connected element with specified IRI.
     */
    readonly refElement?: ElementIri;
    /**
     * Filter by connection link type.
     *
     * Only applicable when {@link refElement} is set.
     */
    readonly refElementLink?: LinkTypeIri;
    /**
     * Reference element link type direction ('in' | 'out').
     * 
     * Only when {@link refElementLink} is set.
     */
    readonly linkDirection?: 'in' | 'out';
    /**
     * Filter by a lookup pattern.
     */
    readonly pattern?: SearchPattern;
}

/**
 * Typed search pattern type (string literal) for {@link InstancesSearch}.
 *
 * @see {@link SearchPattern}
 */
export type SearchPatternType<K extends string = string, S = unknown> = K & { __searchPattern: S };

export interface SearchPattern<P extends SearchPatternType = SearchPatternType> {
    readonly type: P & string;
    readonly state: SearchPatternState<P>;
}

export type SearchPatternState<P> = P extends SearchPatternType<string, infer S> ? S : never;

export const SearchPattern = {
    /**
     * Utility function to define typed {@link SearchPatternType search pattern type}.
     *
     * **Example**:
     * ```ts
     * const FromNamedSet = SearchPattern
     *     .property('urn:my:fromNamedSet')
     *     .of<{ readonly setName: string }>();
     * ```
     */
    type: <K extends string>(key: K): { of<V>(): SearchPatternType<K, V> } => {
        return {
            of: <V>() => key as SearchPatternType<K, V>,
        };
    },
    hasType: <P extends SearchPatternType>(
        pattern: SearchPattern,
        type: P
    ): pattern is SearchPattern<P> => {
        return pattern.type === type;
    },
    create: <P extends SearchPatternType>(type: P, state: SearchPatternState<P>): SearchPattern<P> => {
        return {type, state};
    },
} as const;

export const SearchPatternAllOf = SearchPattern.type('urn:reactodia:allOf').of<{
    readonly patterns: readonly SearchPattern[];
}>();
export const SearchPatternAnyOf = SearchPattern.type('urn:reactodia:anyOf').of<{
    readonly patterns: readonly SearchPattern[];
}>();
export const SearchPatternHasType = SearchPattern.type('urn:reactodia:hasType').of<{
    readonly elementType: ElementTypeIri;
}>();
export const SearchPatternConnectedTo = SearchPattern.type('urn:reactodia:connectedTo').of<{
    readonly linkType?: LinkTypeIri;
    readonly linkDirection?: 'in' | 'out';
    readonly target?: SearchPattern;
}>();
export const SearchPatternFromValues = SearchPattern.type('urn:reactodia:fromValues').of<{
    readonly values: readonly ElementIri[];
}>();
export const SearchPatternHasProperty = SearchPattern.type('urn:reactodia:hasProperty').of<{
    readonly property: PropertyTypeIri;
    readonly values?: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;
}>();

export function searchPatternFrom(criteria: SearchCriteria): SearchPattern | undefined {
    const {
        elementType, refElement, refElementLink, linkDirection, text, pattern,
    } = criteria;

    const patterns: SearchPattern[] = [];

    if (elementType) {
        patterns.push(SearchPattern.create(SearchPatternHasType, {elementType}));
    }

    if (refElement || refElementLink) {
        patterns.push(SearchPattern.create(SearchPatternConnectedTo, {
            linkType: refElementLink,
            linkDirection,
            target: refElement
                ? SearchPattern.create(SearchPatternFromValues, {values: [refElement]})
                : undefined,
        }));
    }

    if (pattern) {
        patterns.push(pattern);
    }

    return (
        patterns.length === 0 ? undefined :
        patterns.length === 1 ? patterns[0] :
        SearchPattern.create(SearchPatternAllOf, {patterns})
    );
}
