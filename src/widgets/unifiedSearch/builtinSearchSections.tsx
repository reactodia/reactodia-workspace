import * as React from 'react';

import { Events, EventTrigger, EventObserver } from '../../coreUtils/events';

import { ClassTree } from '../classTree';
import { InstancesSearch, InstancesSearchCommands, SearchCriteria } from '../instancesSearch';
import { LinkTypesToolbox } from '../linksToolbox';

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
     * @default 1
     */
    minSearchTermLength?: number;
    /**
     * Event bus to send commands to `InstancesSearch` component.
     */
    instancesSearchCommands?: EventTrigger<InstancesSearchCommands>;
}) {
    const {searchTimeout = 200, minSearchTermLength = 1, instancesSearchCommands} = props;
    const {searchStore, shouldRender} = useUnifiedSearchSection({
        searchTimeout,
        allowSubmit: term => term.length >= minSearchTermLength,
    });
    
    return shouldRender ? (
        <ClassTree className={SECTION_ELEMENT_TYPES_CLASS}
            searchStore={searchStore}
            instancesSearchCommands={instancesSearchCommands}
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
    /**
     * Event bus to listen commands for `InstancesSearch` component.
     */
    instancesSearchCommands: Events<InstancesSearchCommands> & EventTrigger<InstancesSearchCommands>;
}) {
    const {searchTimeout = 600, minSearchTermLength = 3, instancesSearchCommands} = props;
    const {shouldRender, setSectionActive, searchStore} = useUnifiedSearchSection({
        searchTimeout,
        allowSubmit: term => term.length >= minSearchTermLength,
    });

    React.useEffect(() => {
        if (instancesSearchCommands) {
            const listener = new EventObserver();
            listener.listen(instancesSearchCommands, 'setCriteria', ({criteria}) => {
                setSectionActive(true, criteriaAsSearchExtra(criteria));
            });
            return () => listener.stopListening();
        }
    }, [shouldRender, instancesSearchCommands]);

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
            commands={instancesSearchCommands}
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
    /**
     * Event bus to send commands to `InstancesSearch` component.
     */
    instancesSearchCommands?: EventTrigger<InstancesSearchCommands>;
}) {
    const {searchTimeout = 200, minSearchTermLength = 1, instancesSearchCommands} = props;
    const {shouldRender, isSectionActive, searchStore} = useUnifiedSearchSection({
        searchTimeout,
        allowSubmit: term => term.length >= minSearchTermLength,
    });

    return shouldRender ? (
        <LinkTypesToolbox className={SECTION_LINK_TYPES_CLASS}
            trackSelected={isSectionActive}
            searchStore={searchStore}
            instancesSearchCommands={instancesSearchCommands}
        />
    ) : null;
}
