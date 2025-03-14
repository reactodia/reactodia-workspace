import * as React from 'react';

import { EventObserver } from '../../coreUtils/events';

import { ClassTree } from '../classTree';
import { InstancesSearch, SearchCriteria } from '../instancesSearch';
import { LinkTypesToolbox } from '../linksToolbox';

import { InstancesSearchTopic } from '../../workspace/commandBusTopic';
import { useWorkspace } from '../../workspace/workspaceContext';

import { useUnifiedSearchSection } from './searchSection';

const SECTION_ELEMENT_TYPES_CLASS = 'reactodia-search-section-element-types';

/**
 * Search section (provider) to lookup element types via tree.
 *
 * @category Components
 */
export function SearchSectionElementTypes(props: {
    /**
     * Debounce timeout in milliseconds after input to perform the text search.
     *
     * @default 200
     */
    searchTimeout?: number;
    /**
     * Minimum number of characters in the search term to initiate the search.
     *
     * @default 2
     */
    minSearchTermLength?: number;
}) {
    const {searchTimeout = 200, minSearchTermLength = 2} = props;
    const {searchStore, shouldRender} = useUnifiedSearchSection({
        searchTimeout,
        allowSubmit: term => term.length >= minSearchTermLength,
    });
    
    return shouldRender ? (
        <ClassTree className={SECTION_ELEMENT_TYPES_CLASS}
            searchStore={searchStore}
        />
    ) : null;
}

const SECTION_ENTITIES_CLASS = 'reactodia-search-section-entities';

/**
 * Search section (provider) to lookup entities.
 *
 * @category Components
 */
export function SearchSectionEntities(props: {
    /**
     * Debounce timeout in milliseconds after input to perform the text search.
     *
     * @default 600
     */
    searchTimeout?: number;
    /**
     * Minimum number of characters in the search term to initiate the search.
     *
     * @default 3
     */
    minSearchTermLength?: number;
}) {
    const {searchTimeout = 600, minSearchTermLength = 3} = props;
    const {getCommandBus} = useWorkspace();
    const {shouldRender, setSectionActive, searchStore} = useUnifiedSearchSection({
        searchTimeout,
        allowSubmit: term => term.length >= minSearchTermLength,
    });

    const commands = getCommandBus(InstancesSearchTopic);
    React.useEffect(() => {
        const listener = new EventObserver();
        listener.listen(commands, 'setCriteria', ({criteria}) => {
            setSectionActive(true, criteriaAsSearchExtra(criteria));
        });
        return () => listener.stopListening();
    }, [shouldRender, commands]);

    return (
        <InstancesSearch className={SECTION_ENTITIES_CLASS}
            searchStore={searchStore}
            onChangeCriteria={criteria => {
                if (shouldRender) {
                    setSectionActive(true, criteriaAsSearchExtra(criteria));
                }
            }}
            onAddElements={() => {
                setSectionActive(false);
            }}
        />
    );
}

function criteriaAsSearchExtra(criteria: SearchCriteria): object | undefined {
    if (criteria.text || criteria.elementType || criteria.refElement) {
        return criteria;
    } else {
        return undefined;
    }
}

const SECTION_LINK_TYPES_CLASS = 'reactodia-search-section-link-types';

/**
 * Search section (provider) to lookup link types.
 *
 * @category Components
 */
export function SearchSectionLinkTypes(props: {
    /**
     * Debounce timeout in milliseconds after input to perform the text search.
     *
     * @default 200
     */
    searchTimeout?: number;
    /**
     * Minimum number of characters in the search term to initiate the search.
     *
     * @default 1
     */
    minSearchTermLength?: number;
}) {
    const {searchTimeout = 200, minSearchTermLength = 1} = props;
    const {shouldRender, isSectionActive, searchStore} = useUnifiedSearchSection({
        searchTimeout,
        allowSubmit: term => term.length >= minSearchTermLength,
    });

    return shouldRender ? (
        <LinkTypesToolbox className={SECTION_LINK_TYPES_CLASS}
            trackSelected={isSectionActive}
            searchStore={searchStore}
        />
    ) : null;
}
