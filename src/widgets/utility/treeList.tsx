import * as React from 'react';

import { findNextWithin, findPreviousWithin } from '../../coreUtils/dom';

export interface TreeListProps<T, S> {
    model: TreeListModel<T, S>;
    items: readonly T[];
    renderItem: TreeListRenderItem<T, S>;
    expanded?: TreeListState<boolean>;
    /**
     * @default false
     */
    defaultExpanded?: boolean;
    onSetExpanded?: (item: T, path: TreeListDownPath, expand: boolean) => void;
    selected?: TreeListState<S>;
    /**
     * @default undefined
     */
    defaultSelected?: S;
    rootProps: React.HTMLProps<HTMLUListElement>;
    forestProps: React.HTMLProps<HTMLUListElement>;
    itemProps: React.HTMLProps<HTMLLIElement>;
}

export interface TreeListModel<T, S> {
    readonly getKey: (item: T) => string;
    readonly getChildren: (item: T) => readonly T[] | undefined;
    readonly getDefaultSelected: (item: T, selected: S | undefined) => S | undefined;
    readonly isActive: (item: T) => boolean;
}

export type TreeListRenderItem<T, S> = (props: {
    item: T;
    path: TreeListUpPath;
    focusProps: TreeListFocusProps;
    expanded: boolean;
    selected: S | undefined;
}) => React.ReactElement | null;

export interface TreeListFocusProps {
    tabIndex: number;
    'data-tree-focusable': true;
};

export function TreeList<T extends object, S>(props: TreeListProps<T, S>) {
    const {
        model, items, renderItem, expanded, defaultExpanded, onSetExpanded,
        selected, defaultSelected, rootProps, forestProps, itemProps,
    } = props;

    const getTotalChildCount = React.useMemo(() => makeGetTotalChildCount(model), [model]);
    const treeContext = React.useMemo((): TreeListContext<T, S> => ({
        model,
        getTotalChildCount,
        renderItem,
        forestProps,
        itemProps,
    }), [model, getTotalChildCount, renderItem, forestProps, itemProps]);

    const rootRef = React.useRef<HTMLUListElement>(null);
    const [focusIndex, setFocusIndex] = React.useState(0);
    const tryFocusOnItemElement = (target: Element | undefined) => {
        if (target) {
            const focusable = target.querySelector('[data-tree-focusable]');
            if (focusable instanceof HTMLElement) {
                focusable.focus();
            }
            const targetIndex = Number(target.getAttribute('data-tree-index'));
            if (Number.isFinite(targetIndex)) {
                setFocusIndex(targetIndex);
            }
        }
    };

    React.useEffect(() => {
        setFocusIndex(previousIndex => {
            const previousItem = findItemAtIndex(
                model, getTotalChildCount, items, 0, previousIndex
            );
            if (!(previousItem && model.isActive(previousItem[0]))) {
                const found = findItem(model, items, item => model.isActive(item));
                if (found) {
                    const [nextItem, nextIndex] = found;
                    return nextIndex;
                }
            }
            return previousIndex;
        });
    }, [model, getTotalChildCount, items]);

    return (
        <Forest treeContext={treeContext}
            items={items}
            index={0}
            focusIndex={focusIndex}
            expanded={expanded}
            defaultExpanded={defaultExpanded ?? false}
            selected={selected}
            defaultSelected={defaultSelected}
            rootProps={{
                ...rootProps,
                ref: rootRef,
                onClick: e => {
                    const current = findTreeIndexedAt(e.target, e.currentTarget);
                    if (current) {
                        const currentIndex = Number(current.getAttribute('data-tree-index'));
                        if (Number.isFinite(currentIndex)) {
                            setFocusIndex(currentIndex);
                        }
                    }
                },
                onKeyDown: e => {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        const current = findTreeIndexedAt(e.target, e.currentTarget);
                        if (current) {
                            const next = e.key === 'ArrowUp'
                                ? findPreviousWithin(current, e.currentTarget, isActiveIndexedElement)
                                : findNextWithin(current, e.currentTarget, isActiveIndexedElement);
                            tryFocusOnItemElement(next);
                        }
                    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        if (onSetExpanded) {
                            e.preventDefault();
                            const current = findTreeIndexedAt(e.target, e.currentTarget);
                            if (!current) {
                                return;
                            }
                            const currentIndex = Number(current.getAttribute('data-tree-index'));
                            if (Number.isFinite(currentIndex)) {
                                if (e.key === 'ArrowLeft' && current.getAttribute('aria-expanded') === 'false') {
                                    // Focus on parent item
                                    const parent = current.parentElement
                                        ? findTreeIndexedAt(current.parentElement, e.currentTarget)
                                        : undefined;
                                    tryFocusOnItemElement(parent);
                                } else {
                                    // Expand or collapse current item
                                    const found = findItemAtIndex(
                                        model, getTotalChildCount, items, 0, currentIndex
                                    );
                                    if (found) {
                                        const [target, path] = found;
                                        const expand = e.key === 'ArrowRight';
                                        onSetExpanded(target, path, expand);
                                    }
                                }
                            }
                        }
                    }
                },
            }}
        />
    );
}

interface TreeListContext<T, S> {
    readonly model: TreeListModel<T, S>;
    readonly getTotalChildCount: (item: T) => number;
    readonly renderItem: TreeListRenderItem<T, S>;
    readonly forestProps: React.HTMLProps<HTMLUListElement>;
    readonly itemProps: React.HTMLProps<HTMLLIElement>;
}

function Forest<T, S>(props: {
    treeContext: TreeListContext<T, S>;
    items: readonly T[];
    index: number;
    parentPath?: TreeListUpPath;
    focusIndex: number;
    expanded: TreeListState<boolean> | undefined;
    defaultExpanded: boolean;
    selected: TreeListState<S> | undefined;
    defaultSelected: S | undefined;
    rootProps?: React.HTMLProps<HTMLUListElement>;
}) {
    const {
        treeContext, items, index, parentPath, focusIndex, expanded, defaultExpanded,
        selected, defaultSelected, rootProps,
    } = props;
    const {model, getTotalChildCount, forestProps} = treeContext;
    const targetProps = rootProps ?? forestProps;
    let nextIndex = index;
    return (
        <ul {...targetProps}>
            {items.map(item => {
                const itemIndex = nextIndex;
                nextIndex += 1 + getTotalChildCount(item);
                const path: TreeListUpPath = {
                    parent: parentPath,
                    key: model.getKey(item),
                };
                return (
                    <Item key={path.key}
                        treeContext={treeContext}
                        item={item}
                        index={itemIndex}
                        path={path}
                        focusIndex={focusIndex}
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
    treeContext: TreeListContext<T, S>;
    item: T;
    index: number;
    path: TreeListUpPath;
    focusIndex: number;
    expanded: TreeListItemState<boolean> | undefined;
    defaultExpanded: boolean;
    selected: TreeListItemState<S> | undefined;
    defaultSelected: S | undefined;
}) {
    const {
        treeContext, item, index, path, focusIndex, expanded, defaultExpanded,
        selected, defaultSelected,
    } = props;
    const {model, renderItem, itemProps} = treeContext;

    const leafExpanded = expanded?.value ?? defaultExpanded;
    const leafSelected = selected?.value ?? defaultSelected;
    const children = model.getChildren(item);

    return (
        <li {...itemProps}
            data-tree-index={index}
            data-tree-active={model.isActive(item) ? true : undefined}
            aria-expanded={!children || children.length === 0 ? undefined : leafExpanded}
            aria-selected={leafSelected !== undefined}>
            {renderItem({
                item,
                path,
                focusProps: {
                    tabIndex: index === focusIndex ? 0 : -1,
                    'data-tree-focusable': true,
                },
                expanded: leafExpanded,
                selected: leafSelected,
            })}
            {leafExpanded && children && children.length > 0 ? (
                <Forest treeContext={treeContext}
                    items={children}
                    index={index + 1}
                    parentPath={path}
                    focusIndex={focusIndex}
                    expanded={expanded?.level}
                    defaultExpanded={defaultExpanded}
                    selected={selected?.level}
                    defaultSelected={model.getDefaultSelected(item, leafSelected)}
                />
            ) : null}
        </li>
    );
}

export interface TreeListUpPath {
    readonly parent: TreeListUpPath | undefined;
    readonly key: string;
}

export interface TreeListDownPath {
    readonly child: TreeListDownPath | undefined;
    readonly key: string;
}

export class TreeListState<S> {
    constructor(
        private readonly states = new Map<string, TreeListItemState<S>>()
    ) {}

    get(key: string): TreeListItemState<S> | undefined {
        return this.states.get(key);
    }

    setAt(
        path: TreeListDownPath,
        updater: (previous: S | undefined) => S | undefined
    ): TreeListState<S> {
        const itemState = this.states.get(path.key);
        const nextState = TreeListState.setAtItem(
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
        return new TreeListState(nextStates);
    }

    private static setAtItem<S>(
        itemState: TreeListItemState<S> | undefined,
        path: TreeListDownPath | undefined,
        updater: (previous: S | undefined) => S | undefined
    ): TreeListItemState<S> | undefined {
        if (path) {
            if (itemState && itemState.level) {
                const nextLevel = itemState.level.setAt(path, updater);
                return nextLevel === itemState.level
                    ? itemState : {...itemState, level: nextLevel};
            } else {
                const nextItem = TreeListState.setAtItem(
                    undefined, path.child, updater
                );
                if (!nextItem || nextItem === itemState) {
                    return nextItem;
                }
                return {
                    value: itemState?.value,
                    level: new TreeListState(new Map([[path.key, nextItem]])),
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

export interface TreeListItemState<S> {
    readonly value: S | undefined;
    readonly level?: TreeListState<S> | undefined;
}

export function treeListPathToDown(upPath: TreeListUpPath): TreeListDownPath {
    let current = upPath.parent;
    let downward: TreeListDownPath = {
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

function makeGetTotalChildCount<T extends object, S>(
    model: TreeListModel<T, S>
): (item: T) => number {
    const totalChildCount = new WeakMap<T, number>();
    const getTotalChildCount = (item: T): number => {
        const children = model.getChildren(item);
        if (!children || children.length === 0) {
            return 0;
        }
        let count = totalChildCount.get(item);
        if (count === undefined) {
            count = children.reduce(
                (acc, child) => acc + 1 + getTotalChildCount(child),
                0
            );
            totalChildCount.set(item, count);
        }
        return count;
    };
    return getTotalChildCount;
}

function findItem<T, S>(
    model: TreeListModel<T, S>,
    items: readonly T[],
    isMatch: (item: T) => boolean
): [T, number] | undefined {
    const stack: Array<[readonly T[], number]> = [[items, 0]];
    let nextIndex = 0;
    while (true) {
        const frame = stack.pop();
        if (!frame) {
            break;
        }
        const [children, startAt] = frame;
        for (let i = startAt; i < children.length; i++) {
            const child = children[i];
            if (isMatch(child)) {
                return [child, nextIndex];
            }
            nextIndex++;
            const nested = model.getChildren(child);
            if (nested && nested.length > 0) {
                frame[1] = i + 1;
                stack.push(frame);
                stack.push([nested, 0]);
                break;
            }
        }
    }
    return undefined;
}

function findItemAtIndex<T, S>(
    model: TreeListModel<T, S>,
    getTotalChildCount: (item: T) => number,
    items: readonly T[],
    firstIndex: number,
    targetIndex: number
): [T, TreeListDownPath] | undefined {
    let current = firstIndex;
    for (const item of items) {
        if (current === targetIndex) {
            return [item, {key: model.getKey(item), child: undefined}];
        }
        current++;
        const count = getTotalChildCount(item);
        if (targetIndex < current + count) {
            const children = model.getChildren(item);
            if (!children) {
                return undefined;
            }
            const found = findItemAtIndex(model, getTotalChildCount, children, current, targetIndex);
            if (found) {
                const [target, child] = found;
                return [target, {key: model.getKey(item), child}];
            }
            return undefined;
        }
        current += count;
    }
    return undefined;
}

function findTreeIndexedAt(target: EventTarget, parent: HTMLElement): HTMLElement | undefined {
    if (!(target instanceof HTMLElement)) {
        return undefined;
    }
    let current: HTMLElement | null = target;
    while (current && current !== parent) {
        if (current.hasAttribute('data-tree-index')) {
            return current;
        }
        current = current.parentElement;
    }
    return undefined;
}

function isActiveIndexedElement(element: Element): boolean {
    return element.hasAttribute('data-tree-index') && element.hasAttribute('data-tree-active');
}
