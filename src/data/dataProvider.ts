import type * as Rdf from './rdf/rdfModel';
import {
    ElementTypeGraph, ElementTypeModel, LinkTypeModel, ElementModel, LinkModel, PropertyTypeModel,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri,
} from './model';

/**
 * Asynchronously provides data for the elements, links and other graph entities.
 *
 * @category Data
 */
export interface DataProvider {
    /**
     * Returns an [RDF term factory](https://rdf.js.org/data-model-spec/#datafactory-interface)
     * to create RDF terms for identifiers and property values.
     */
    readonly factory: Rdf.DataFactory;

    /**
     * Gets the structure and data for all known element types.
     */
    knownElementTypes(params: {
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<ElementTypeGraph>;

    /**
     * Gets the data and statistics for all known link types.
     */
    knownLinkTypes(params: {
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<LinkTypeModel[]>;

    /**
     * Gets known element types filtered by a keyword.
     */
    lookupElementTypes(params: {
        /**
         * Filter by a text lookup.
         */
        text: string;
        /**
         * Limit number of element types returned.
         *
         * Default value depends on the provider implementation.
         */
        limit?: number;
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<ElementTypeModel[]>;

    /**
     * Gets known property types filtered by a keyword.
     */
    lookupPropertyTypes(params: {
        /**
         * Filter by a text lookup.
         */
        text: string;
        /**
         * Limit number of property types returned.
         *
         * Default value depends on the provider implementation.
         */
        limit?: number;
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<PropertyTypeModel[]>;

    /**
     * Gets known link types filtered by a keyword.
     */
    lookupLinkTypes(params: {
        /**
         * Filter by a text lookup.
         */
        text: string;
        /**
         * Limit number of link types returned.
         *
         * Default value depends on the provider implementation.
         */
        limit?: number;
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<LinkTypeModel[]>;

    /**
     * Gets the data for the specified element types.
     */
    elementTypes(params: {
        /**
         * Target element types to query data for.
         */
        classIds: ReadonlyArray<ElementTypeIri>;
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<Map<ElementTypeIri, ElementTypeModel>>;

    /**
     * Gets the data for the specified property types.
     */
    propertyTypes(params: {
        /**
         * Target property types to query data for.
         */
        propertyIds: ReadonlyArray<PropertyTypeIri>;
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<Map<PropertyTypeIri, PropertyTypeModel>>;

    /**
     * Gets the data for the specified link types.
     */
    linkTypes(params: {
        /**
         * Target link types to query data for.
         */
        linkTypeIds: ReadonlyArray<LinkTypeIri>;
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<Map<LinkTypeIri, LinkTypeModel>>;

    /**
     * Gets the data for the specified elements.
     */
    elements(params: {
        /**
         * Target elements to query data for.
         */
        elementIds: ReadonlyArray<ElementIri>;
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<Map<ElementIri, ElementModel>>;

    /**
     * Get all links between two specified sets of entities (bipartite graph links).
     *
     * To get all links between all entities in the set, it is possible to
     * pass the same set to both `primary` and `secondary` sets of elements.
     */
    links(params: {
        /**
         * First set of entities to get links between them and `secondary` elements.
         */
        primary: ReadonlyArray<ElementIri>;
        /**
         * Second set of entities to get links between them and `primary` elements.
         */
        secondary: ReadonlyArray<ElementIri>;
        /**
         * Return only links with specified types.
         */
        linkTypeIds?: ReadonlyArray<LinkTypeIri>;
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<LinkModel[]>;

    /**
     * Gets connected link types of an element for exploration.
     */
    connectedLinkStats(params: {
        /**
         * Target element to count linked elements from/to.
         */
        elementId: ElementIri;
        /**
         * Whether to allow to return inexact count of elements connected by
         * an each link type when result is non-zero.
         *
         * @default false
         */
        inexactCount?: boolean;
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<DataProviderLinkCount[]>;

    /**
     * Finds entities in a data graph by specified lookup filters.
     *
     * Support and validity for the provided lookup pattern can be checked
     * with {@link DataProvider.supportsPattern}.
     */
    lookup(params: DataProviderLookupParams): Promise<DataProviderLookupItem[]>;
}

/**
 * Describes how many unique elements are connected to some other element
 * via some link type (`id`) in each direction.
 *
 * @category Data
 * @see {@link DataProvider.connectedLinkStats}
 */
export interface DataProviderLinkCount {
    /**
     * Link type from/to target element.
     */
    readonly id: LinkTypeIri;
    /**
     * How many elements linked to target element via the link type.
     */
    readonly inCount: number;
    /**
     * How many elements linked from target element via the link type.
     */
    readonly outCount: number;
    /**
     * If `true`, then `inCount` and `outCount` values might be not exact
     * in case when the values are non-zero.
     */
    readonly inexact?: boolean;
}

/**
 * Parameters for {@link DataProvider.lookup} operation.
 *
 * Specified filters are be combined to produce an intersection of the results,
 * same as nesting them in a {@link LookupPatternAllOf} pattern.
 *
 * All lookup filters can be combined into a single pattern
 * with {@link lookupPatternOf}.
 *
 * @category Data
 * @see {@link DataProvider.lookup}
 */
export interface DataProviderLookupParams {
    /**
     * Filter by an element type.
     *
     * Same as {@link LookupPatternHasType}.
     */
    elementTypeId?: ElementTypeIri;
    
    /**
     * Filter by a text lookup.
     *
     * Same as {@link LookupPatternWithText}.
     */
    text?: string;

    /**
     * Filter by having a connected element with specified IRI.
     *
     * Same as {@link LookupPatternConnectedTo} (together with
     * {@link refElementLinkId} and {@link linkDirection}).
     */
    refElementId?: ElementIri;

    /**
     * Filter by connection link type.
     *
     * Same as {@link LookupPatternConnectedTo} (together with
     * {@link refElementId} and {@link linkDirection}).
     */
    refElementLinkId?: LinkTypeIri;

    /**
     * Reference element link type direction ('in' | 'out').
     *
     * Same as {@link LookupPatternConnectedTo} (together with
     * {@link refElementId} and {@link refElementLinkId}).
     */
    linkDirection?: 'in' | 'out';

    /**
     * Filter by a lookup pattern.
     */
    pattern?: LookupPattern;

    /**
     * Limit number of elements returned.
     *
     * Pass `null` to explicitly disable the limit.
     *
     * Default value depends on the provider implementation.
     */
    limit?: number | null;

    /**
     * Abort signal to cancel the async operation.
     */
    signal?: AbortSignal;
}

/**
 * Describes a lookup pattern to find entities in a data graph.
 *
 * @see {@link DataProvider.lookup}
 */
export type LookupPattern =
    | LookupPatternAllOf
    | LookupPatternAnyOf
    | LookupPatternWithText
    | LookupPatternHasType
    | LookupPatternConnectedTo
    | LookupPatternFromValues
    | LookupPatternHasProperty;

/**
 * Lookup pattern that filters entities by requiring all of the nested
 * {@link patterns} to match.
 */
export interface LookupPatternAllOf {
    /**
     * Lookup pattern type.
     */
    readonly type: 'allOf';
    /**
     * Patterns list, all of which matching are required for this pattern to match.
     *
     * Empty list is considered to be an invalid pattern.
     */
    readonly patterns: readonly LookupPattern[];
}

/**
 * Lookup pattern that filters entities by requiring any of the nested
 * {@link patterns} to match.
 */
export interface LookupPatternAnyOf {
    /**
     * Lookup pattern type.
     */
    readonly type: 'anyOf';
    /**
     * Patterns list, any of which matching is enough for this pattern to match.
     *
     * Empty list is considered to be an invalid pattern.
     */
    readonly patterns: readonly LookupPattern[];
}

/**
 * Lookup pattern that filters entities by an element type.
 */
export interface LookupPatternHasType {
    /**
     * Lookup pattern type.
     */
    readonly type: 'hasType';
    /**
     * Required element type for an entity.
     */
    readonly elementType: ElementTypeIri;
}

/**
 * Lookup pattern that filters entities by having another connected entity
 * matching a {@link target} pattern by any or specific {@link linkType link type}
 * and {@link linkDirection direction}.
 *
 * If provided as a top-level pattern (including as part of {@link LookupPatternAllOf}
 * or {@link LookupPatternAnyOf}), provides {@link DataProviderLookupItem.inLinks} and
 * {@link DataProviderLookupItem.outLinks} on the result items.
 */
export interface LookupPatternConnectedTo {
    /**
     * Lookup pattern type.
     */
    readonly type: 'connectedTo';
    /**
     * Required link type between {@link target} and the entity.
     *
     * If not specified, any link type is allowed.
     */
    readonly linkType?: LinkTypeIri;
    /**
     * Required link direction between {@link target} and the entity:
     *  - `out`: `target` → entity
     *  - `in`: `target` ← entity
     *
     * If not specified, both directions are allowed.
     */
    readonly linkDirection?: 'in' | 'out';
    /**
     * Required link pattern to match connected entities.
     *
     * If not specified, any connected entity is allowed.
     */
    readonly target?: LookupPattern;
}

/**
 * Lookup pattern that filters entities being in the fixed set of
 * the matching {@link values}.
 */
export interface LookupPatternFromValues {
    /**
     * Lookup pattern type.
     */
    readonly type: 'fromValues';
    /**
     * Set of allowed entity IRIs.
     *
     * If empty, the pattern should never match.
     */
    readonly values: readonly ElementIri[];
}

/**
 * Lookup pattern that filters entities by having a property value
 * with specified {@link propertyType property type}.
 *
 * The pattern can optionally match only when the property has at least
 * one value from the provided set of values.
 */
export interface LookupPatternHasProperty {
    /**
     * Lookup pattern type.
     */
    readonly type: 'hasProperty';
    /**
     * Required property type with at least one value for the entity.
     */
    readonly propertyType: PropertyTypeIri;
    /**
     * Set of matching property values: if non-empty, the pattern should match
     * only if the property has at least one values from this set.
     */
    readonly values?: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;
}

/**
 * Lookup pattern that filters entities by having a matching text
 * in its labels.
 *
 * If provided as a top-level pattern, depending on how close {@link text} matches
 * entity label by provider-specific score may infuence the result item position
 * in the {@link DataProvider.lookup} results.
 */
export interface LookupPatternWithText {
    /**
     * Lookup pattern type.
     */
    readonly type: 'withText';
    /**
     * Text token to match in an entity label.
     *
     * The exact text matching behavior is provider-specific
     * (e.g. how partial word matches are handled, etc).
     */
    readonly text: string;
}

/**
 * Describes an element with information on which link types and directions
 * are used to connect it to other elements.
 *
 * @category Data
 * @see {@link DataProvider.lookup}
 */
export interface DataProviderLookupItem {
    /**
     * Result looked up element data.
     */
    readonly element: ElementModel;
    /**
     * Link types for connections in the form: `entity` → `target`
     * ({@link LookupPatternConnectedTo.target}).
     *
     * Only applicable if {@link LookupPatternConnectedTo} or equivalent filter
     * is specified in {@link DataProvider.lookup}.
     */
    readonly inLinks: ReadonlySet<LinkTypeIri>;
    /**
     * Link types for connections in the form: `entity` ← `target`
     * ({@link LookupPatternConnectedTo.target}).
     *
     * Only applicable if {@link LookupPatternConnectedTo} or equivalent filter
     * is specified in {@link DataProvider.lookup}.
     */
    readonly outLinks: ReadonlySet<LinkTypeIri>;
}

/**
 * Composes a a single lookup pattern from filters specified in
 * {@link DataProviderLookupParams params} for {@link DataProvider.lookup}.
 */
export function lookupPatternOf(
    params: Omit<DataProviderLookupParams, 'limit' | 'signal'>
): LookupPattern {
    const {
        elementTypeId, refElementId, refElementLinkId, linkDirection, text, pattern,
    } = params;

    const patterns: LookupPattern[] = [];

    if (elementTypeId) {
        patterns.push({
            type: 'hasType',
            elementType: elementTypeId,
        });
    }

    if (refElementId || refElementLinkId || linkDirection) {
        patterns.push({
            type: 'connectedTo',
            linkType: refElementLinkId,
            linkDirection: linkDirection,
            target: refElementId ? {
                type: 'fromValues',
                values: [refElementId],
            } : undefined,
        });
    }

    if (text) {
        patterns.push({
            type: 'withText',
            text,
        });
    }

    if (pattern) {
        patterns.push(pattern);
    }

    return patterns.length === 1 ? patterns[0] : {
        type: 'allOf',
        patterns,
    };
}
