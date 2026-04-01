import * as React from 'react';

import {
    neverSyncStore, useEventStore, useFrameDebouncedStore, useSyncStore,
} from '../../coreUtils/hooks';

import { ElementModel, ElementIri } from '../../data/model';
import { getAllPresentEntities } from '../../editor/dataDiagramModel';
import { useWorkspace } from '../../workspace/workspaceContext';

import { ListElementView, startDragElements } from './listElementView';
import {
    TreeList, TreeListState, type TreeListModel, type TreeListRenderItem, type TreeListFocusProps,
    type TreeListUpPath,
} from './treeList';

const CLASS_NAME = 'reactodia-search-results';

/**
 * Props for {@link SearchResults} component.
 *
 * @see {@link SearchResults}
 */
export interface SearchResultsProps {
    /**
     * List of entities to display.
     */
    items: ReadonlyArray<ElementModel>;
    /**
     * Set of selected entities from {@link items}.
     */
    selection: ReadonlySet<ElementIri>;
    /**
     * Handler to change a selected set of entities.
     */
    onSelectionChanged: (newSelection: ReadonlySet<ElementIri>) => void;
    /**
     * Whether to allow to select an entity from the list.
     *
     * **Default** is to disable an entity if it has been already placed on the canvas.
     */
    isItemDisabled?: (item: ElementModel) => boolean;
    /**
     * Text sub-string to highlight in the displayed entities.
     */
    highlightText?: string;
    /**
     * Whether to allow to drag entities from the list (e.g. onto the diagram canvas).
     *
     * @default true
     */
    useDragAndDrop?: boolean;
    /**
     * Whether to allow to select multiple items at the same time.
     * 
     * It is possible to select a range of items by holding `Shift` when
     * selecting another item to select all other items in-between as well.
     *
     * @default true
     */
    multiSelection?: boolean;
    /**
     * Additional components to render after the result items.
     */
    footer?: React.ReactNode;
}

/**
 * Utility component to display a list of selectable entities.
 *
 * @category Components
 */
export function SearchResults(props: SearchResultsProps) {
    const {
        items, selection, onSelectionChanged, isItemDisabled, highlightText,
        useDragAndDrop = true, multiSelection = true, footer,
    } = props;

    const renderItem = React.useCallback<TreeListRenderItem<ElementItem, boolean>>(
        ({item, path, focusProps, selected}) => (
            <ResultItem item={item} path={path} focusProps={focusProps} selected={selected} />
        ),
        []
    );
    const rootProps = React.useMemo((): React.HTMLProps<HTMLUListElement> => ({
        className: `${CLASS_NAME}__root`,
        role: 'list',
        'aria-multiselectable': true,
    }), []);
    const forestProps = React.useMemo((): React.HTMLProps<HTMLUListElement> => ({}), []);
    const itemProps = React.useMemo((): React.HTMLProps<HTMLLIElement> => ({
        className: `${CLASS_NAME}__item`,
        role: 'listitem',
    }), []);

    const computeIsItemDisabled = useIsItemDisabledWithDefault(isItemDisabled);
    const extendedItems = React.useMemo(() => items.map((data): ElementItem => ({
        data,
        active: !computeIsItemDisabled(data),
    })), [items, computeIsItemDisabled]);

    const latestItems = React.useRef(items);
    React.useEffect(() => {
        latestItems.current = items;
    });
    const lastSelected = React.useRef<ElementModel>();

    const searchResultsContext = React.useMemo(
        (): SearchResultsContext => ({
            highlightText,
            useDragAndDrop,
            selection,
            onSetSelected: (item, select, e) => {
                if (select) {
                    if (multiSelection && e.shiftKey && lastSelected.current) {
                        const lastIri = lastSelected.current.id;
                        const lastIndex = latestItems.current
                            .findIndex(entity => entity.id === lastIri);
                        const currentIndex = latestItems.current
                            .findIndex(entity => entity.id === item.data.id);
                        if (lastIndex >= 0 && currentIndex >= 0) {
                            const nextSelection = new Set(selection);
                            const endIndex = Math.max(lastIndex, currentIndex);
                            for (let i = Math.min(lastIndex, currentIndex); i <= endIndex; i++) {
                                nextSelection.add(latestItems.current[i].id);
                            }
                            onSelectionChanged(nextSelection);
                        }
                    } else if (!selection.has(item.data.id)) {
                        const nextSelection = new Set(multiSelection ? selection : undefined);
                        nextSelection.add(item.data.id);
                        onSelectionChanged(nextSelection);
                    }
                    lastSelected.current = item.data;
                } else {
                    if (selection.has(item.data.id)) {
                        const nextSelection = new Set(selection);
                        nextSelection.delete(item.data.id);
                        onSelectionChanged(nextSelection);
                    }
                }
            }
        }),
        [
            highlightText,
            useDragAndDrop,
            selection,
            onSelectionChanged,
            multiSelection,
        ]
    );

    const selected = React.useMemo((): TreeListState<boolean> | undefined => {
        if (selection.size === 0) {
            return undefined;
        }
        return new TreeListState<boolean>(
            new Map(Array.from(selection, iri => [iri, {value: true}]))
        );
    }, [selection]);

    React.useEffect(() => {
        const leftovers = new Set(selection);
        for (const item of extendedItems) {
            if (item.active) {
                leftovers.delete(item.data.id);
            }
        }
        if (leftovers.size > 0) {
            onSelectionChanged(new Set(
                Array.from(selection).filter(iri => !leftovers.has(iri))
            ));
        }
    }, [computeIsItemDisabled]);

    return (
        <SearchResultsContext.Provider value={searchResultsContext}>
            <div className={CLASS_NAME}>
                <TreeList
                    model={SearchResultsModel}
                    items={extendedItems}
                    renderItem={renderItem}
                    selected={selected}
                    rootProps={rootProps}
                    forestProps={forestProps}
                    itemProps={itemProps}
                />
                {footer}
            </div>
        </SearchResultsContext.Provider>
    );
}

function useIsItemDisabledWithDefault(
    isItemDisabled: ((item: ElementModel) => boolean) | undefined
): (item: ElementModel) => boolean {
    const {model} = useWorkspace();
    const changeCellsStore = useFrameDebouncedStore(
        useEventStore(model.events, 'changeCells')
    );
    const cellsVersion = useSyncStore(
        isItemDisabled ? neverSyncStore() : changeCellsStore,
        () => model.cellsVersion
    );
    return React.useMemo(() => {
        if (isItemDisabled) {
            return isItemDisabled;
        }
        const presentEntities = getAllPresentEntities(model);
        return (item: ElementModel) => presentEntities.has(item.id);
    }, [isItemDisabled, cellsVersion]);
}

interface ElementItem {
    readonly data: ElementModel;
    readonly active: boolean;
}

const SearchResultsModel: TreeListModel<ElementItem, boolean> = {
    getKey: item => item.data.id,
    getChildren: item => undefined,
    getDefaultSelected: (item, selected) => undefined,
    isActive: item => item.active,
};

interface SearchResultsContext {
    readonly highlightText: string | undefined;
    readonly useDragAndDrop: boolean;
    readonly selection: ReadonlySet<ElementIri>;
    readonly onSetSelected: (
        item: ElementItem,
        select: boolean,
        e: React.MouseEvent | React.KeyboardEvent
    ) => void;
}

const SearchResultsContext = React.createContext<SearchResultsContext | null>(null);

function useSearchResultsContext(): SearchResultsContext {
    const context = React.useContext(SearchResultsContext);
    if (!context) {
        throw new Error('Reactodia: missing search results context');
    }
    return context;
}

function ResultItem(props: {
    item: ElementItem;
    path: TreeListUpPath;
    focusProps: TreeListFocusProps;
    selected: boolean | undefined;
}) {
    const {item, focusProps, selected} = props;
    const {
        highlightText, useDragAndDrop, selection, onSetSelected,
    } = useSearchResultsContext();
    return (
        <ListElementView {...(item.active ? focusProps : undefined)}
            element={item.data}
            highlightText={highlightText}
            disabled={!item.active}
            selected={Boolean(selected)}
            onClick={item.active ? e => onSetSelected(item, !selected, e) : undefined}
            onKeyDown={e => {
                if (item.active && e.key === ' ') {
                    e.preventDefault();
                    onSetSelected(item, !selected, e);
                }
            }}
            onDragStart={useDragAndDrop ? e => {
                const iris: ElementIri[] = [];
                selection.forEach(iri => iris.push(iri));
                if (!selection.has(item.data.id)) {
                    iris.push(item.data.id);
                }
                return startDragElements(e, iris);
            } : undefined}
        />
    );
}
