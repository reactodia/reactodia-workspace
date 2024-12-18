import * as React from 'react';

import { Events, EventObserver } from '../../coreUtils/events';

import {
    SearchInputStore, SearchInputStoreEvents, useSearchInputStore,
} from '../utility/searchInput';

export interface UnifiedSearchSectionContext {
    readonly searchStore: ExternalSearchStore;
    readonly isSectionActive: boolean;
    readonly setSectionActive: (active: boolean, searchExtra?: object) => void;
}

export interface ExternalSearchStore extends Pick<SearchInputStore, 'value' | 'change'> {
    readonly events: Events<Pick<SearchInputStoreEvents<string>, 'changeValue'>>;
}

export const UnifiedSearchSectionContext = React.createContext<UnifiedSearchSectionContext | null>(null);

/**
 * Options for {@link useUnifiedSearchSection} hook.
 *
 * @see {@link useUnifiedSearchSection}
 */
export interface UseUnifiedSearchSectionOptions {
    /**
     * Debounce timeout in milliseconds after input to perform the text search.
     *
     * @default 0
     */
    searchTimeout?: number;
    /**
     * Validates whether the search value can be submitted,
     * e.g. the search term is at least some characters long.
     */
    allowSubmit?: (term: string) => boolean;
}

/**
 * Search context provided for its section.
 *
 * @see {@link useUnifiedSearchSection}
 */
export interface UnifiedSearchSectionProvidedContext {
    /**
     * Whether this section must be rendered because its opened the first time.
     *
     * This is useful for optimization purpose to allow lazy-loading for the section content.
     */
    readonly shouldRender: boolean;
    /**
     * Whether this section is active (displayed to the user).
     */
    readonly isSectionActive: boolean;
    /**
     * Requests the search to activate or deactivate this section.
     *
     * @param searchExtra Additional search request data to mark that this section
     * displays search result with additional restrictions, so the request should not
     * be assumed empty even if there is no search term.
     */
    readonly setSectionActive: (active: boolean, searchExtra?: object) => void;
    /**
     * Controlled state store for the search input in this section.
     */
    readonly searchStore: SearchInputStore;
}

/**
 * React hook to get provided search context for the current section.
 *
 * Throws an error if called from a non-mounted or non-section component.
 * 
 * @category Hooks
 */
export function useUnifiedSearchSection(
    props: UseUnifiedSearchSectionOptions = {}
): UnifiedSearchSectionProvidedContext {
    const context = React.useContext(UnifiedSearchSectionContext);
    if (!context) {
        throw new Error('Missing Reactodia unified search section context');
    }

    const {searchStore, isSectionActive, setSectionActive} = context;
    const [shouldRender, setShouldRender] = React.useState(isSectionActive);

    const {searchTimeout = 0, allowSubmit} = props;
    const derivedSearchState = useSearchInputStore({
        initialValue: searchStore.value,
        submitTimeout: searchTimeout,
        allowSubmit,
    });

    React.useLayoutEffect(() => {        
        if (isSectionActive) {
            setShouldRender(true);

            const listener = new EventObserver();
            listener.listen(searchStore.events, 'changeValue', ({source, action}) => {
                derivedSearchState.change({value: source.value, action});
            });
            derivedSearchState.change({value: searchStore.value, action: 'submit'});
            return () => listener.stopListening();
        }
    }, [isSectionActive]);

    React.useEffect(() => {
        if (shouldRender) {
            derivedSearchState.change({value: searchStore.value, action: 'submit'});
        }
    }, [shouldRender]);

    return {
        shouldRender,
        isSectionActive,
        setSectionActive,
        searchStore: derivedSearchState,
    };
}
