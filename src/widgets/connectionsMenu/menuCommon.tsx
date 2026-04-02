import type { ElementModel, LinkTypeIri, LinkTypeModel } from '../../data/model';

import { HtmlSpinner } from '../../diagram/spinner';

/**
 * Provides smart suggestions when searching by the link type label.
 *
 * @see {@link ConnectionsMenuProps.suggestProperties}
 */
export type PropertySuggestionHandler = (params: PropertySuggestionParams) => Promise<PropertyScore[]>;

/**
 * Parameters for the smart link type suggestion handler.
 *
 * @see {@link PropertySuggestionHandler}
 */
export interface PropertySuggestionParams {
    /**
     * Target connected entity IRI.
     */
    elementId: string;
    /**
     * Link type label search token.
     */
    token: string;
    /**
     * A collection of possible link type IRIs.
     */
    properties: readonly string[];
    /**
     * Current diagram model data language.
     */
    lang: string;
    /**
     * Cancellation signal.
     */
    signal: AbortSignal | undefined;
}

/**
 * Result entry for the smart link type suggestion handler.
 *
 * @see {@link PropertySuggestionHandler}
 */
export interface PropertyScore {
    /**
     * Link type IRI.
     */
    propertyIri: string;
    /**
     * Suggestion score (higher is more suggested for the top positions).
     */
    score: number;
}

export type SortMode = 'alphabet' | 'smart';

export interface ConnectionsData {
    readonly links: ReadonlyArray<LinkTypeModel>;
    readonly counts: ReadonlyMap<LinkTypeIri, ConnectionCount>;
}

export interface ConnectionSuggestions {
    readonly filterKey: string | null;
    readonly scores: ReadonlyMap<LinkTypeIri, PropertyScore>;
}

export interface ConnectionCount {
    readonly inexact: boolean;
    readonly inCount: number;
    readonly outCount: number;
}

export interface ObjectsData {
    readonly chunk: LinkDataChunk;
    readonly elements: ReadonlyArray<ElementModel>;
}

export interface LinkDataChunk {
    /**
     * Random key to check if chunk is different from another
     * (i.e. should be re-rendered).
     */
    readonly chunkId: string;
    readonly linkType: LinkTypeModel;
    readonly direction?: 'in' | 'out';
    readonly expectedCount: number | 'some';
    readonly pageCount: number;
}

export type ObjectPlacingMode = 'separately' | 'grouped';

export const CLASS_NAME = 'reactodia-connections-menu';
export const LINK_COUNT_PER_PAGE = 100;

export function LoadingSpinner(props: { error?: boolean }) {
    return (
        <div className={`${CLASS_NAME}__spinner`}>
            <HtmlSpinner width={30} height={30}
                errorOccurred={Boolean(props.error)}
            />
        </div>
    );
}
