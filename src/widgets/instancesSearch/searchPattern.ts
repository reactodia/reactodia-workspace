import { TranslatedText } from '../../coreUtils/i18n';
import { ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri } from '../../data/model';
import { LookupPattern } from '../../data/dataProvider';
import type * as Rdf from '../../data/rdf/rdfModel';

/**
 * Abstract search pattern type for search criteria in
 * {@link SearchSectionEntities} and {@link InstancesSearch}.
 *
 * Compared to {@link LookupPattern}, a search pattern represents
 * displayed or edited state for a {@link SearchCriterionOption}.
 * This state can be converted into {@link LookupPattern} with
 * validation, serialized to/deserialized from a plain JSON value.
 *
 * **Example**:
 * ```ts
 * class FromNamedSet extends SearchPattern<{
 *     readonly setIri: Rdf.NamedNode;
 * }> {
 *     generate(
 *         context: SearchPatternGenerateContext
 *     ): LookupPattern | SearchPatternError {
 *         // ...
 *     }
 * 
 *     static readonly fromJSONType = 'fromNamedSet';
 *     static fromJSON(
 *         raw: SerializedFromNamedSet,
 *         context: 
 *     ): FromNamedSet {
 *         const {setIri} = raw;
 *         return new FromNamedSet({
 *             setIri: context.factory.namedNode(setIri),
 *         });
 *     }
 * 
 *     toJSON(
 *         context: SearchPatternToJsonContext
 *     ): SerializedFromNamedSet {
 *         const {setIri} = this.state;
 *         return {
 *             '@type': 'fromNamedSet',
 *             setIri: setIri.value,
 *         };
 *     }
 * }
 * 
 * SearchPattern.define(FromNamedSet);
 * 
 * interface SerializedFromNamedSet {
 *     setIri: string;
 * }
 * ```
 *
 * @see {@link SearchPattern.define}
 */
export abstract class SearchPattern<S = unknown> {
    constructor(
        /**
         * Search pattern state.
         */
        readonly state: S
    ) {}

    /**
     * Generates a valid {@link LookupPattern} from the pattern or
     * {@link SearchPatternError} if it's incomplete or contradictory.
     */
    abstract generate(
        context: SearchPatternGenerateContext
    ): LookupPattern | SearchPatternError;

    /**
     * Serializes the pattern to a plain JSON-stringifiable value.
     */
    abstract toJSON(
        context: SearchPatternToJsonContext
    ): SerializedSearchPattern;

    /**
     * Utility function to define {@link SearchPattern search pattern} type
     * and assert its contract on serialization.
     */
    static define(type: SearchPatternType): void {
        if (typeof type.fromJSONType !== 'string') {
            throw new Error('Missing or invalid "fromJSONType" on a search pattern type');
        } else if (typeof type.fromJSON !== 'function') {
            throw new Error('Missing or invalid "fromJSON" on a search pattern type');
        }
    }

    /**
     * Utility function to generate lookup patterns from an array of search patterns,
     * returing all collected errors instead if any error is produced.
     */
    static generateMany(
        patterns: readonly SearchPattern[],
        context: SearchPatternGenerateContext
    ): LookupPattern[] | SearchPatternError {
        const results: LookupPattern[] = [];
        const errors: SearchPatternErrorItem[] = [];
        let hasError = false;
        for (const pattern of patterns) {
            const result = pattern.generate(context);
            if (result.type === 'error') {
                hasError = true;
                for (const error of result.errors) {
                    errors.push(error);
                }
            } else {
                results.push(result);
            }
        }
        return hasError ? {type: 'error', errors} : results;
    }
}

/**
 * Describes a serializable {@link SearchPattern search pattern type}.
 */
export interface SearchPatternType<P extends SearchPattern = SearchPattern> {
    new (...args: any[]): P;
    /**
     * Unique identifier string to act as determine a search pattern type
     * for a serialized pattern state.
     */
    readonly fromJSONType: ReturnType<P['toJSON']>['@type'];
    /**
     * Deserializes the pattern from a plain JSON-stringifiable value.
     */
    fromJSON(
        state: ReturnType<P['toJSON']>,
        context: SearchPatternFromJsonContext
    ): P | undefined;
}

/**
 * A combined error from search pattern {@link SearchPattern.generate generation}.
 */
export interface SearchPatternError {
    /**
     * Error result type.
     */
    readonly type: 'error';
    /**
     * All collected generation errors.
     */
    readonly errors: readonly SearchPatternErrorItem[];
}

/**
 * A sigle error related to search pattern {@link SearchPattern.generate generation}
 * from a `target` pattern.
 */
export interface SearchPatternErrorItem {
    /**
     * Target search pattern from which the error originates.
     */
    readonly target: SearchPattern;
    /**
     * Error message.
     */
    readonly message: string | TranslatedText;
}

/**
 * Context for {@link SearchPattern.generate}.
 */
export type SearchPatternGenerateContext = Record<string, never>;

/**
 * Context for {@link SearchPattern.toJSON}.
 */
export interface SearchPatternToJsonContext {
    /**
     * Serializes a sub-pattern.
     */
    toJson: (pattern: SearchPattern) => SerializedSearchPattern;
}

/**
 * Context for {@link SearchPatternType.fromJSON}.
 */
export interface SearchPatternFromJsonContext {
    /**
     * An [RDF term factory](https://rdf.js.org/data-model-spec/#datafactory-interface)
     * to create RDF terms for identifiers and property values.
     */
    factory: Rdf.DataFactory;
    /**
     * Deserializes a sub-pattern.
     */
    fromJson: (pattern: SerializedSearchPattern) => SearchPattern;
}

/**
 * Base type for serialized {@link SearchPattern search pattern}.
 */
export interface SerializedSearchPattern {
    '@type': string;
}

/**
 * Search pattern corresponding to {@link LookupPatternAllOf}.
 *
 * @see {@link SearchCriterionAllOf}
 */
export class SearchPatternAllOf extends SearchPattern<{
    readonly patterns: readonly SearchPattern[];
}> {
    generate(
        context: SearchPatternGenerateContext
    ): LookupPattern | SearchPatternError {
        const {patterns} = this.state;
        if (patterns.length === 0) {
            return {
                type: 'error',
                errors: [{
                    target: this,
                    message: TranslatedText.text(
                        'search_entities.error.required_at_least_one_pattern'
                    ),
                }],
            };
        }
        const inner = SearchPattern.generateMany(patterns, context);
        return Array.isArray(inner) ? {type: 'allOf', patterns: inner} : inner;
    }

    static readonly fromJSONType = 'AllOf';

    static fromJSON(
        raw: SerializedAllOf,
        context: SearchPatternFromJsonContext
    ): SearchPatternAllOf {
        const {patterns} = raw;
        return new SearchPatternAllOf({
            patterns: patterns.map(p => context.fromJson(p)),
        });
    }

    toJSON(context: SearchPatternToJsonContext): SerializedAllOf {
        const {patterns} = this.state;
        return {
            '@type': 'AllOf',
            patterns: patterns.map(p => context.toJson(p)),
        };
    }
}

SearchPattern.define(SearchPatternAllOf);

interface SerializedAllOf {
    '@type': 'AllOf';
    patterns: SerializedSearchPattern[];
}

/**
 * Search pattern corresponding to {@link LookupPatternAnyOf}.
 *
 * @see {@link SearchCriterionAnyOf}
 */
export class SearchPatternAnyOf extends SearchPattern<{
    readonly patterns: readonly SearchPattern[];
}> {
    generate(
        context: SearchPatternGenerateContext
    ): LookupPattern | SearchPatternError {
        const {patterns} = this.state;
        if (patterns.length === 0) {
            return {
                type: 'error',
                errors: [{
                    target: this,
                    message: TranslatedText.text(
                        'search_entities.error.required_at_least_one_pattern'
                    ),
                }],
            };
        }
        const inner = SearchPattern.generateMany(patterns, context);
        return Array.isArray(inner) ? {type: 'anyOf', patterns: inner} : inner;
    }

    static readonly fromJSONType = 'AnyOf';

    static fromJSON(
        raw: SerializedAnyOf,
        context: SearchPatternFromJsonContext
    ): SearchPatternAnyOf {
        const {patterns} = raw;
        return new SearchPatternAnyOf({
            patterns: patterns.map(p => context.fromJson(p)),
        });
    }

    toJSON(context: SearchPatternToJsonContext): SerializedAnyOf {
        const {patterns} = this.state;
        return {
            '@type': 'AnyOf',
            patterns: patterns.map(p => context.toJson(p)),
        };
    }
}

SearchPattern.define(SearchPatternAnyOf);

interface SerializedAnyOf {
    '@type': 'AnyOf';
    patterns: SerializedSearchPattern[];
}

/**
 * Search pattern corresponding to {@link LookupPatternHasType}.
 *
 * @see {@link SearchCriterionHasType}
 */
export class SearchPatternHasType extends SearchPattern<{
    readonly elementType?: ElementTypeIri;
}> {
    generate(
        context: SearchPatternGenerateContext
    ): LookupPattern | SearchPatternError {
        const {elementType} = this.state;
        if (!elementType) {
            return {
                type: 'error',
                errors: [{
                    target: this,
                    message: TranslatedText.text(
                        'search_entities.error.required_element_type'
                    ),
                }],
            };
        }
        return {
            type: 'hasType',
            elementType,
        };
    }

    static readonly fromJSONType = 'HasType';

    static fromJSON(raw: SerializedHasType): SearchPatternHasType {
        const {elementType} = raw;
        return new SearchPatternHasType({elementType});
    }

    toJSON(context: SearchPatternToJsonContext): SerializedHasType {
        const {elementType} = this.state;
        return {
            '@type': 'HasType',
            elementType,
        };
    }
}

SearchPattern.define(SearchPatternHasType);

interface SerializedHasType {
    '@type': 'HasType';
    elementType?: ElementTypeIri;
}

/**
 * Search pattern corresponding to {@link LookupPatternConnectedTo}.
 *
 * @see {@link SearchCriterionConnectedTo}
 */
export class SearchPatternConnectedTo extends SearchPattern<{
    readonly linkType?: LinkTypeIri;
    readonly linkDirection?: 'in' | 'out';
    readonly target?: SearchPattern;
}> {
    generate(
        context: SearchPatternGenerateContext
    ): LookupPattern | SearchPatternError {
        const {linkType, linkDirection, target} = this.state;
        const targetPattern = target?.generate(context);
        if (targetPattern?.type === 'error') {
            return targetPattern;
        }
        return {
            type: 'connectedTo',
            linkType,
            linkDirection,
            target: targetPattern,
        };
    }

    static readonly fromJSONType = 'ConnectedTo';

    static fromJSON(
        raw: SerializedConnectedTo,
        context: SearchPatternFromJsonContext
    ): SearchPatternConnectedTo {
        const {linkType, linkDirection, target} = raw;
        return new SearchPatternConnectedTo({
            linkType,
            linkDirection,
            target: target ? context.fromJson(target) : undefined,
        });
    }

    toJSON(context: SearchPatternToJsonContext): SerializedConnectedTo {
        const {linkType, linkDirection, target} = this.state;
        return {
            '@type': 'ConnectedTo',
            linkType,
            linkDirection,
            target: target ? context.toJson(target) : undefined,
        };
    }
}

SearchPattern.define(SearchPatternConnectedTo);

interface SerializedConnectedTo {
    '@type': 'ConnectedTo';
    linkType?: LinkTypeIri;
    linkDirection?: 'in' | 'out';
    target?: SerializedSearchPattern;
}

/**
 * Search pattern corresponding to {@link LookupPatternFromValues}.
 *
 * @see {@link SearchCriterionFromValues}
 */
export class SearchPatternFromValues extends SearchPattern<{
    readonly values: readonly ElementIri[];
}> {
    generate(
        context: SearchPatternGenerateContext
    ): LookupPattern | SearchPatternError {
        const {values} = this.state;
        return {
            type: 'fromValues',
            values,
        };
    }

    static readonly fromJSONType = 'FromValues';

    static fromJSON(raw: SerializedFromValues): SearchPatternFromValues {
        const {values} = raw;
        return new SearchPatternFromValues({values});
    }

    toJSON(context: SearchPatternToJsonContext): SerializedFromValues {
        const {values} = this.state;
        return {
            '@type': 'FromValues',
            values,
        };
    }
}

SearchPattern.define(SearchPatternFromValues);

interface SerializedFromValues {
    '@type': 'FromValues';
    values: readonly ElementIri[];
}

/**
 * Search pattern corresponding to {@link LookupPatternHasProperty}.
 *
 * @see {@link SearchCriterionHasProperty}
 */
export class SearchPatternHasProperty extends SearchPattern<{
    readonly propertyType?: PropertyTypeIri;
    readonly values?: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;
}> {
    generate(
        context: SearchPatternGenerateContext
    ): LookupPattern | SearchPatternError {
        const {propertyType, values} = this.state;
        if (!propertyType) {
            return {
                type: 'error',
                errors: [{
                    target: this,
                    message: TranslatedText.text(
                        'search_entities.error.required_property_type'
                    ),
                }],
            };
        }
        return {
            type: 'hasProperty',
            propertyType,
            values,
        };
    }

    static readonly fromJSONType = 'HasProperty';

    static fromJSON(
        raw: SerializedHasProperty,
        context: SearchPatternFromJsonContext
    ): SearchPatternHasProperty {
        const {propertyType, values} = raw;
        return new SearchPatternHasProperty({
            propertyType,
            values: values?.map(v => context.factory.fromTerm(
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                v as any
            ) as Rdf.NamedNode | Rdf.Literal),
        });
    }

    toJSON(context: SearchPatternToJsonContext): SerializedHasProperty {
        const {propertyType, values} = this.state;
        return {
            '@type': 'HasProperty',
            propertyType,
            values,
        };
    }
}

SearchPattern.define(SearchPatternHasProperty);

interface SerializedHasProperty {
    '@type': 'HasProperty';
    propertyType?: PropertyTypeIri;
    values?: readonly (
        | Pick<Rdf.NamedNode, 'termType' | 'value'>
        | Pick<Rdf.Literal, 'termType' | 'value' | 'datatype' | 'language'>
    )[];
}
