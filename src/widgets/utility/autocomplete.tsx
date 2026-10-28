import cx from 'clsx';
import * as React from 'react';

import { EventObserver } from '../../coreUtils/events';
import { UseAsyncResult, useObservedProperty } from '../../coreUtils/hooks';
import { useTranslation } from '../../coreUtils/i18n';
import { HtmlSpinner } from '../../diagram/spinner';

import { Dropdown } from './dropdown';
import { ErrorMessage } from './errorMessage';
import {
    FocusGroup, FocusGroupController, useFocusGroup,
} from './focusGroup';
import { NoSearchResults } from './noSearchResults';
import { ProgressBar } from './progressBar';
import { SearchInput, SearchInputStore, useSearchInputStore } from './searchInput';

const CLASS_NAME = 'reactodia-autocomplete';

export function Autocomplete<T>(props: {
    inlineContent: React.ReactNode | undefined;
    inlineStatus?: 'loading' | 'error';
    contentReplacesInput?: boolean;
    suggest: (text: string, options: { signal: AbortSignal }) => Promise<readonly T[]>;
    /**
     * Input dropdown expand direction.
     *
     * @default "down"
     */
    direction?: 'down' | 'up';
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
    /**
     * Placeholder text for the input.
     *
     * @default "Search for..."
     */
    placeholder?: string;
    /**
     * @default "m"
     */
    size?: 'm' | 's';
    children: (params: {
        items: readonly T[];
        highlightText: string;
    }) => React.ReactNode;
}) {
    const {
        inlineContent,
        inlineStatus,
        contentReplacesInput = false,
        suggest,
        direction,
        searchTimeout = 200,
        minSearchTermLength = 2,
        placeholder,
        size,
        children,
    } = props;

    const [expanded, setExpanded] = React.useState(false);
    const searchStore = useSearchInputStore({
        initialValue: '',
        submitTimeout: searchTimeout,
        allowSubmit: text => text.length >= minSearchTermLength,
    });
    const searchTerm = useObservedProperty(
        searchStore.events, 'changeValue', () => searchStore.value
    );

    const cancellation = React.useRef<AbortController>();
    const [suggestions, setSuggestions] = React.useState<UseAsyncResult<readonly T[]>>({
        data: undefined,
        status: 'completed',
    });

    React.useEffect(() => {
        const listener = new EventObserver();
        listener.listen(searchStore.events, 'executeSearch', ({value}) => {
            cancellation.current?.abort();
            cancellation.current = new AbortController();
            const signal = cancellation.current.signal;
            setSuggestions(previous => ({data: previous.data, status: 'loading'}));
            suggest(value, {signal}).then(
                items => {
                    setSuggestions({data: items, status: 'completed'});
                },
                error => {
                    setSuggestions(previous => ({data: previous.data, status: 'error'}));
                    console.error(error);
                }
            );
        });
        listener.listen(searchStore.events, 'clearSearch', () => {
            cancellation.current?.abort();
            setSuggestions({data: undefined, status: 'completed'});
        });
    }, [searchStore, suggest, setSuggestions]);

    React.useEffect(() => {
        return () => cancellation.current?.abort();
    }, []);

    const dropdownRef = React.useRef<HTMLDivElement | null>(null);
    const toggleInputRef = React.useRef<HTMLInputElement | null>(null);

    const hasSearchText = searchTerm.length > 0;

    const onClickOutside = React.useCallback(() => {
        if (!hasSearchText) {
            setExpanded(false);
        }
    }, [hasSearchText, setExpanded]);

    React.useLayoutEffect(() => {
        const container = dropdownRef.current;
        if (container) {
            const onFocusout = (e: FocusEvent) => {
                if (!(
                    e.relatedTarget instanceof Node &&
                    container.contains(e.relatedTarget)
                )) {
                    setExpanded(false);
                }
            };
            container.addEventListener('focusout', onFocusout);
            return () => container.removeEventListener('focusout', onFocusout);
        }
    }, [dropdownRef]);

    let content: React.ReactNode;
    if (suggestions.status === 'error') {
        content = <ErrorMessage error={suggestions.error} />;
    } else if (suggestions.data && suggestions.data.length > 0) {
        content = children({ items: suggestions.data, highlightText: searchTerm });
    } else {
        content = (
            <NoSearchResults className={`${CLASS_NAME}__no-results`}
                hasQuery={hasSearchText}
                minSearchTermLength={minSearchTermLength}
                message={suggestions.status === 'loading' ? 'Loading...' : undefined}
            />
        );
    }

    return (
        <FocusGroup>
            {({ref}) => (
                <Dropdown innerRef={dropdownRef}
                    className={cx(
                        CLASS_NAME,
                        contentReplacesInput && inlineContent
                            ? `${CLASS_NAME}--inline-content-only` : null
                    )}
                    role='combobox'
                    aria-expanded={expanded}
                    direction={direction}
                    expanded={expanded}
                    onClickOutside={onClickOutside}
                    toggle={
                        <AutocompleteToggle inputRef={toggleInputRef}
                            searchStore={searchStore}
                            hasSearchText={hasSearchText}
                            inlineContent={inlineContent}
                            inlineStatus={inlineStatus}
                            expanded={expanded}
                            setExpanded={setExpanded}
                            placeholder={placeholder}
                            size={size}
                        />
                    }>
                    <AutocompleteItems innerRef={ref}
                        visible={expanded}
                        dropUp={direction === 'up'}
                        setExpanded={setExpanded}>
                        <ProgressBar state={suggestions.status} title='Loading...' />
                        {content}
                    </AutocompleteItems>
                </Dropdown>
            )}
        </FocusGroup>
    );
}

function AutocompleteToggle(props: {
    inputRef: React.RefObject<HTMLInputElement | null>,
    searchStore: SearchInputStore;
    hasSearchText: boolean;
    inlineContent: React.ReactNode;
    inlineStatus: 'loading' | 'error' | undefined;
    expanded: boolean;
    setExpanded: (expanded: boolean) => void;
    placeholder?: string;
    size?: 'm' | 's';
}) {
    const {
        inputRef, searchStore, hasSearchText, inlineContent, inlineStatus,
        placeholder, size, expanded, setExpanded,
    } = props;
    const t = useTranslation();

    return (
        <SearchInput className={`${CLASS_NAME}__toggle`}
            store={searchStore}
            size={size}
            inputProps={{
                /* For compatibility with React 19 typings */
                ref: inputRef as React.RefObject<HTMLInputElement>,
                className: `${CLASS_NAME}__toggle-input`,
                placeholder,
                onClick: () => setExpanded(true),
                onFocus: () => setExpanded(true),
                onKeyUp: e => {
                    switch (e.key) {
                        case 'Enter': {
                            if (e.currentTarget.value.length > 0) {
                                setExpanded(true);
                            }
                            break;
                        }
                        case 'Escape': {
                            setExpanded(false);
                            break;
                        }
                        default: {
                            setExpanded(true);
                            break;
                        }
                    }
                }
            }}
            slotInput={
                <>
                    {inlineContent}
                    {inlineStatus ? (
                        <HtmlSpinner className={`${CLASS_NAME}__spinner`}
                            width={16}
                            height={16}
                            errorOccurred={inlineStatus === 'error'}
                        />
                    ) : null}
                </>
            }
            slotEnd={
                hasSearchText ? undefined : (
                    <button type='button'
                        title={t.text('unified_search.input_collapse.title')}
                        className={`${CLASS_NAME}__toggle-button`}
                        onClick={() => setExpanded(!expanded)}>
                    </button>
                )
            }
        />
    );
}

function AutocompleteItems(props: {
    innerRef: (element: HTMLElement | null) => void;
    visible: boolean;
    dropUp: boolean;
    setExpanded: (nextExpanded: boolean) => void;
    children: React.ReactNode;
}) {
    const {innerRef, visible, dropUp, setExpanded, children} = props;
    const controller = useFocusGroup();

    const onKeyDown = (e: React.KeyboardEvent, controller: FocusGroupController) => {
        if (e.key === 'Escape') {
            setExpanded(false);
        } else {
            controller.defaultKeyDown(e);
        }
    };

    return (
        <div ref={innerRef}
            role='menu'
            className={`${CLASS_NAME}__items reactodia-scrollable`}
            tabIndex={-1}
            onClick={controller.defaultClick}
            onKeyDown={e => onKeyDown(e, controller)}>
            {children}
        </div>
    );
}
