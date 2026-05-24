import * as React from 'react';

import { findNextWithin, findPreviousWithin } from '../../coreUtils/dom';

export interface AccessibleTreeProps<T, S> {
    model: TreeModel<T, S>;
    items: readonly T[];
    renderItem: TreeRenderItem<T, S>;
    expanded?: TreeState<boolean>;
    /**
     * @default false
     */
    defaultExpanded?: boolean;
    onSetExpanded?: (item: T, path: TreeDownPath, expand: boolean) => void;
    selected?: TreeState<S>;
    /**
     * @default undefined
     */
    defaultSelected?: S;
    rootProps: React.HTMLProps<HTMLUListElement>;
    forestProps: React.HTMLProps<HTMLUListElement>;
    itemProps: React.HTMLProps<HTMLLIElement>;
}

export interface TreeModel<T, S> {
    readonly getKey: (item: T) => string;
    readonly getChildren: (item: T) => readonly T[] | undefined;
    readonly getDefaultSelected: (item: T, selected: S | undefined) => S | undefined;
    readonly isActive: (item: T) => boolean;
}

export type TreeRenderItem<T, S> = (props: {
    item: T;
    path: TreeUpPath;
    focusProps: TreeFocusableProps;
    expanded: boolean;
    selected: S | undefined;
}) => React.ReactElement | null;

export interface TreeFocusableProps {
    readonly tabIndex: number;
}

export function AccessibleTree<T extends object, S>(props: AccessibleTreeProps<T, S>) {
    const {
        model, items, renderItem, expanded, defaultExpanded, onSetExpanded,
        selected, defaultSelected, rootProps, forestProps, itemProps,
    } = props;

    const getTotalChildCount = React.useMemo(() => makeGetTotalChildCount(model), [model]);
    const treeContext = React.useMemo((): TreeContext<T, S> => ({
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
            const focusable = target.querySelector('[tabIndex]');
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
                                if (e.key === 'ArrowLeft' && (
                                    !current.hasAttribute('aria-expanded') ||
                                    current.getAttribute('aria-expanded') === 'false'
                                )) {
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
                    } else {
                        rootProps?.onKeyDown?.(e);
                    }
                },
            }}
        />
    );
}

interface TreeContext<T, S> {
    readonly model: TreeModel<T, S>;
    readonly getTotalChildCount: (item: T) => number;
    readonly renderItem: TreeRenderItem<T, S>;
    readonly forestProps: React.HTMLProps<HTMLUListElement>;
    readonly itemProps: React.HTMLProps<HTMLLIElement>;
}

function Forest<T, S>(props: {
    treeContext: TreeContext<T, S>;
    items: readonly T[];
    index: number;
    parentPath?: TreeUpPath;
    focusIndex: number;
    expanded: TreeState<boolean> | undefined;
    defaultExpanded: boolean;
    selected: TreeState<S> | undefined;
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
                const path: TreeUpPath = {
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
    treeContext: TreeContext<T, S>;
    item: T;
    index: number;
    path: TreeUpPath;
    focusIndex: number;
    expanded: TreeItemState<boolean> | undefined;
    defaultExpanded: boolean;
    selected: TreeItemState<S> | undefined;
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

function makeGetTotalChildCount<T extends object, S>(
    model: TreeModel<T, S>
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
    model: TreeModel<T, S>,
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
    model: TreeModel<T, S>,
    getTotalChildCount: (item: T) => number,
    items: readonly T[],
    firstIndex: number,
    targetIndex: number
): [T, TreeDownPath] | undefined {
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
