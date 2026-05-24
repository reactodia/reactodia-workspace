import * as React from 'react';

import { useLatest } from '../../coreUtils/hooks';

import {
    AccessibleTree, type TreeModel, type TreeRenderItem, TreeState, type TreeItemState,
} from './accessibleTree';

/**
 * Function to render content for each item in an {@link AccessibleList}.
 */
export type ListRenderItem<T, S> = (props: {
    /**
     * Item data.
     */
    item: T;
    /**
     * Props to set on a sub-element to make it focusable.
     *
     * Can be applied to multiple sub-elements to move focus
     * between them with `Tab` key.
     */
    focusProps: ListFocusableProps;
    /**
     * Selected state for the item.
     *
     * Item is considered selected when the value is different from `undefined`.
     */
    selected: S | undefined;
}) => React.ReactElement | null;

/**
 * Props for a focusable DOM-element within an {@link AccessibleList}.
 */
export interface ListFocusableProps {
    /**
     * See [tabIndex](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/tabindex).
     */
    readonly tabIndex: number;
}

const DEFAULT_ROOT_PROPS: React.HTMLProps<HTMLUListElement> = {
    role: 'list',
};

const DEFAULT_ITEM_PROPS: React.HTMLProps<HTMLLIElement> = {
    role: 'listitem',
};

/**
 * Utility component as base for [accessible](https://www.w3.org/TR/wai-aria/)
 * list-like container.
 *
 * The container component acts as [focus group](https://www.w3.org/TR/wai-aria/#managingfocus)
 * with keyboard navigation via arrow keys between items and `Tab` key to move focus
 * to/from container or within currently focused item (if it has multiple focusable children).
 *
 * @category Components
 */
export function AccessibleList<T extends object, S = boolean>(props: {
    /**
     * Item data to render in the list.
     */
    items: readonly T[];
    /**
     * Pure function to get unique key for an item.
     */
    getItemKey: (item: T) => string;
    /**
     * Pure function to determine whether an item is active (`true`) or disabled (`false`).
     *
     * Disabled items cannot be focused on.
     */
    isItemActive?: (item: T) => boolean;
    /**
     * Pure function to render an item.
     */
    renderItem: ListRenderItem<T, S>;
    /**
     * Selection state for the list items.
     */
    selection?: ListSelection<S>;
    /**
     * Props for the top-level container element.
     *
     * **Default**:
     * ```
     * {role: 'list'}
     * ```
     */
    rootProps?: React.HTMLProps<HTMLUListElement>;
    /**
     * Props for each element wrapper around rendered item.
     *
     * **Default**:
     * ```
     * {role: 'listitem'}
     * ```
     */
    itemProps?: React.HTMLProps<HTMLLIElement>;
}) {
    const {items, getItemKey, isItemActive, renderItem, selection, rootProps, itemProps} = props;

    const renderTreeItem = React.useCallback<TreeRenderItem<T, S>>(
        ({item, focusProps, selected}) => renderItem({item, focusProps, selected}),
        [renderItem]
    );

    const latestGetKey = useLatest(getItemKey);
    const latestIsActive = useLatest(isItemActive);
    const model = React.useMemo((): TreeModel<T, S> => ({
        getKey: item => latestGetKey.current(item),
        getChildren: item => undefined,
        getDefaultSelected: (item, selected) => undefined,
        isActive: item => latestIsActive.current?.(item) ?? true,
    }), [latestGetKey, latestIsActive]);

    const forestProps = React.useMemo((): React.HTMLProps<HTMLUListElement> => ({}), []);

    return (
        <AccessibleTree model={model}
            items={items}
            renderItem={renderTreeItem}
            selected={selection?._state}
            rootProps={rootProps ?? DEFAULT_ROOT_PROPS}
            forestProps={forestProps}
            itemProps={itemProps ?? DEFAULT_ITEM_PROPS}
        />
    );
}

/**
 * Represents a selection state in an {@link AccessibleList}.
 *
 * Item is considered to be selected if associated value is different from `undefined`.
 */
export class ListSelection<S> implements Iterable<readonly [string, S]> {
    private static readonly _empty = new ListSelection(
        new TreeState<any>()
    );

    /** @hidden */
    readonly _state: TreeState<S>;

    private constructor(state: TreeState<S>) {
        this._state = state;
    }

    /**
     * Gets a empty selection state.
     */
    static empty<S>(): ListSelection<S> {
        return ListSelection._empty as ListSelection<S>;
    }

    /**
     * Creates a selection state from a sequence of `[item, state]` pairs.
     */
    static fromEntries<S>(entries: Iterable<readonly [string, S]>): ListSelection<S> {
        const states = new Map<string, TreeItemState<S>>();
        for (const [key, state] of entries) {
            states.set(key, {value: state});
        }
        return new ListSelection(new TreeState(states));
    }

    [Symbol.iterator](): Iterator<readonly [string, S]> {
        return this.entries();
    }

    /**
     * Gets an iterator over selected `[item, state]` pairs.
     */
    *entries(): Iterator<readonly [string, S]> {
        for (const [key, state] of this._state) {
            if (state.value !== undefined) {
                yield [key, state.value];
            }
        }
    }

    /**
     * Gets a selection state for the item with the specified `key`.
     */
    get(key: string): S | undefined {
        return this._state.get(key)?.value;
    }

    /**
     * Updates a selection state for the item with the specified `key`.
     */
    update(key: string, updater: (previous: S | undefined) => S | undefined): ListSelection<S> {
        const nextState = this._state.setAt({key, child: undefined}, updater);
        if (nextState === this._state) {
            return this;
        }
        return new ListSelection(nextState);
    }
}
