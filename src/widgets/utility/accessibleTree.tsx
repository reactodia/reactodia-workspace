import * as React from 'react';

import { findParentWithin } from '../../coreUtils/dom';

import { FocusGroup, FocusGroupController, useFocusGroupItem } from './focusGroup';

export interface AccessibleTreeProps<T, S> {
    model: TreeModel<T, S>;
    /**
     * Item data to render in the tree.
     */
    items: readonly T[];
    /**
     * Pure function to render an item.
     */
    renderItem: TreeRenderItem<T, S>;
    expanded?: TreeState<boolean>;
    /**
     * @default false
     */
    defaultExpanded?: boolean;
    onSetExpanded?: (item: T, path: TreeDownPath, expand: boolean) => void;
    /**
     * Selection state for the tree.
     */
    selected?: TreeState<S>;
    /**
     * @default undefined
     */
    defaultSelected?: S;
    /**
     * Props for the top-level container element.
     *
     * **Default**:
     * ```
     * {role: 'list'}
     * ```
     */
    rootProps: React.HTMLProps<HTMLUListElement>;
    forestProps: React.HTMLProps<HTMLUListElement>;
    /**
     * Props for each element wrapper around rendered item.
     *
     * **Default**:
     * ```
     * {role: 'listitem'}
     * ```
     */
    itemProps: React.HTMLProps<HTMLLIElement>;
}

export interface TreeModel<T, S> {
    /**
     * Pure function to get unique key for an item.
     */
    readonly getKey: (item: T) => string;
    readonly getChildren: (item: T) => readonly T[] | undefined;
    readonly getDefaultSelected: (item: T, selected: S | undefined) => S | undefined;
    /**
     * Pure function to determine whether an item is active (`true`) or disabled (`false`).
     *
     * Disabled items cannot be focused on.
     */
    readonly isActive: (item: T) => boolean;
}

/**
 * Function to render content for each item in an {@link AccessibleTree}.
 */
export type TreeRenderItem<T, S> = (props: {
    /**
     * Item data.
     */
    item: T;
    path: TreeUpPath;
    /**
     * Props to set on a sub-element to make it focusable.
     *
     * Can be applied to multiple sub-elements to move focus
     * between them with `Tab` key.
     */
    focusProps: TreeFocusableProps;
    expanded: boolean;
    /**
     * Selected state for the item.
     *
     * Item is considered selected when the value is different from `undefined`.
     */
    selected: S | undefined;
}) => React.ReactElement | null;

/**
 * Props for a focusable DOM-element.
 */
export interface TreeFocusableProps {
    /**
     * See [tabindex](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/tabindex).
     */
    readonly tabIndex: number | undefined;
}

/**
 * Utility component as base for [accessible](https://www.w3.org/TR/wai-aria/)
 * tree-like container with selection.
 *
 * @category Components
 */
export function AccessibleTree<T extends object, S>(props: AccessibleTreeProps<T, S>) {
    const {
        model, items, renderItem, expanded, defaultExpanded, onSetExpanded,
        selected, defaultSelected, rootProps, forestProps, itemProps,
    } = props;

    const treeContext = React.useMemo((): TreeContext<T, S> => ({
        model,
        renderItem,
        forestProps,
        itemProps,
    }), [model, renderItem, forestProps, itemProps]);

    const onKeyDown = (
        e: React.KeyboardEvent<HTMLUListElement>,
        controller: FocusGroupController
    ) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            controller.defaultKeyDown(e);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            if (e.target instanceof HTMLElement && onSetExpanded) {
                e.preventDefault();
                const current = findParentWithin(
                    e.target,
                    e.currentTarget,
                    item => item.hasAttribute('data-tree-index')
                );
                if (!current) {
                    return;
                }
                const currentIndex = Number(current.getAttribute('data-tree-index'));
                if (Number.isFinite(currentIndex)) {
                    if (e.key === 'ArrowLeft' && (
                        !current.hasAttribute('aria-expanded') ||
                        current.getAttribute('aria-expanded') === 'false'
                    )) {
                        controller.focusParent({from: current});
                    } else {
                        // Expand or collapse current item
                        const indexPath = reconstructTreeIndexPath(current, e.currentTarget);
                        const found = indexPath
                            ? lookupTreeItem(treeContext.model, items, indexPath)
                            : undefined;
                        if (found) {
                            const [target, path] = found;
                            const expand = e.key === 'ArrowRight';
                            onSetExpanded(target, path, expand);
                        }
                    }
                }
            }
        } else {
            rootProps?.onKeyDown?.(e);
        }
    };

    return (
        <FocusGroup>
            {({ref, controller}) => (
                <Forest
                    treeContext={treeContext}
                    items={items}
                    expanded={expanded}
                    defaultExpanded={defaultExpanded ?? false}
                    selected={selected}
                    defaultSelected={defaultSelected}
                    rootProps={{
                        ...rootProps,
                        ref,
                        onClick: controller.defaultClick,
                        onKeyDown: e => onKeyDown(e, controller),
                    }}
                />
            )}
        </FocusGroup>
    );
}

interface TreeContext<T, S> {
    readonly model: TreeModel<T, S>;
    readonly renderItem: TreeRenderItem<T, S>;
    readonly forestProps: React.HTMLProps<HTMLUListElement>;
    readonly itemProps: React.HTMLProps<HTMLLIElement>;
}

function Forest<T, S>(props: {
    treeContext: TreeContext<T, S>;
    items: readonly T[];
    parentPath?: TreeUpPath;
    expanded: TreeState<boolean> | undefined;
    defaultExpanded: boolean;
    selected: TreeState<S> | undefined;
    defaultSelected: S | undefined;
    rootProps?: React.HTMLProps<HTMLUListElement>;
}) {
    const {
        treeContext, items, parentPath, expanded, defaultExpanded,
        selected, defaultSelected, rootProps,
    } = props;
    const {model, forestProps} = treeContext;
    const targetProps = rootProps ?? forestProps;
    return (
        <ul {...targetProps}>
            {items.map((item, index) => {
                const path: TreeUpPath = {
                    parent: parentPath,
                    key: model.getKey(item),
                };
                return (
                    <Item key={path.key}
                        treeContext={treeContext}
                        item={item}
                        index={index}
                        path={path}
                        expanded={expanded?.get(path.key)}
                        defaultExpanded={defaultExpanded}
                        selected={selected?.get(path.key)}
                        defaultSelected={defaultSelected}
                    />
                );
            })}
        </ul>
    );
}

function Item<T, S>(props: {
    treeContext: TreeContext<T, S>;
    item: T;
    index: number;
    path: TreeUpPath;
    expanded: TreeItemState<boolean> | undefined;
    defaultExpanded: boolean;
    selected: TreeItemState<S> | undefined;
    defaultSelected: S | undefined;
}) {
    const {
        treeContext, item, index, path, expanded, defaultExpanded,
        selected, defaultSelected,
    } = props;
    const {model, renderItem, itemProps} = treeContext;

    const isActive = model.isActive(item);
    const {ref, tabIndex} = useFocusGroupItem({active: isActive});
    const leafExpanded = expanded?.value ?? defaultExpanded;
    const leafSelected = selected?.value ?? defaultSelected;
    const children = model.getChildren(item);

    return (
        <li {...itemProps}
            ref={ref}
            data-tree-index={index}
            aria-expanded={!children || children.length === 0 ? undefined : leafExpanded}
            aria-selected={leafSelected !== undefined}>
            {renderItem({
                item,
                path,
                focusProps: {tabIndex},
                expanded: leafExpanded,
                selected: leafSelected,
            })}
            {leafExpanded && children && children.length > 0 ? (
                <Forest treeContext={treeContext}
                    items={children}
                    parentPath={path}
                    expanded={expanded?.level}
                    defaultExpanded={defaultExpanded}
                    selected={selected?.level}
                    defaultSelected={model.getDefaultSelected(item, leafSelected)}
                />
            ) : null}
        </li>
    );
}

export interface TreeUpPath {
    readonly parent: TreeUpPath | undefined;
    readonly key: string;
}

export interface TreeDownPath {
    readonly child: TreeDownPath | undefined;
    readonly key: string;
}

export class TreeState<S> implements Iterable<readonly [string, TreeItemState<S>]> {
    constructor(
        private readonly states = new Map<string, TreeItemState<S>>()
    ) {}

    [Symbol.iterator](): Iterator<readonly [string, TreeItemState<S>]> {
        return this.states[Symbol.iterator]();
    }

    get(key: string): TreeItemState<S> | undefined {
        return this.states.get(key);
    }

    setAt(
        path: TreeDownPath,
        updater: (previous: S | undefined) => S | undefined
    ): TreeState<S> {
        const itemState = this.states.get(path.key);
        const nextState = TreeState.setAtItem(
            itemState, path.child, updater
        );
        if (nextState === itemState) {
            return this;
        }
        const nextStates = new Map(this.states);
        if (nextState) {
            nextStates.set(path.key, nextState);
        } else {
            nextStates.delete(path.key);
        }
        return new TreeState(nextStates);
    }

    private static setAtItem<S>(
        itemState: TreeItemState<S> | undefined,
        path: TreeDownPath | undefined,
        updater: (previous: S | undefined) => S | undefined
    ): TreeItemState<S> | undefined {
        if (path) {
            if (itemState && itemState.level) {
                const nextLevel = itemState.level.setAt(path, updater);
                return nextLevel === itemState.level
                    ? itemState : {...itemState, level: nextLevel};
            } else {
                const nextItem = TreeState.setAtItem(
                    undefined, path.child, updater
                );
                if (!nextItem || nextItem === itemState) {
                    return nextItem;
                }
                return {
                    value: itemState?.value,
                    level: new TreeState(new Map([[path.key, nextItem]])),
                };
            }
        }

        const nextValue = updater(itemState?.value);
        if (nextValue === itemState?.value) {
            return itemState;
        }

        return nextValue === undefined && itemState?.level === undefined ? undefined : {
            ...itemState,
            value: nextValue,
        };
    }
}

export interface TreeItemState<S> {
    readonly value: S | undefined;
    readonly level?: TreeState<S> | undefined;
}

export function treePathToDown(upPath: TreeUpPath): TreeDownPath {
    let current = upPath.parent;
    let downward: TreeDownPath = {
        key: upPath.key,
        child: undefined,
    };
    while (current) {
        downward = {
            key: current.key,
            child: downward,
        };
        current = current.parent;
    }
    return downward;
}

function reconstructTreeIndexPath(item: Element, parent: Element): number[] | undefined {
    const indexPath: number[] = [];
    let current: Element | null = item;
    while (current && current !== parent) {
        if (current.hasAttribute('data-tree-index')) {
            const index = Number(current.getAttribute('data-tree-index'));
            if (Number.isFinite(index)) {
                indexPath.push(index);
            } else {
                return undefined;
            }
        }
        current = current.parentElement;
    }
    indexPath.reverse();
    return indexPath;
}

function lookupTreeItem<T, S>(
    model: TreeModel<T, S>,
    items: readonly T[],
    indexPath: readonly number[]
): [T, TreeDownPath] | undefined {
    let level: readonly T[] | undefined = items;
    let item: T | undefined;
    let topPath: { child: TreeDownPath | undefined; key: string } | undefined;
    let tailPath: { child: TreeDownPath | undefined; key: string } | undefined;
    for (const index of indexPath) {
        if (!level || index < 0 || index >= level.length) {
            return undefined;
        }
        item = level[index];
        if (tailPath) {
            tailPath.child = {
                child: undefined,
                key: model.getKey(item),
            };
            tailPath = tailPath.child;
        } else {
            topPath = {
                child: undefined,
                key: model.getKey(item),
            };
            tailPath = topPath;
        }
        level = model.getChildren(item);
    }
    return item && topPath ? [item, topPath] : undefined;
}
