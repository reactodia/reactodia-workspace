import * as React from 'react';

import { findNextWithin, findPreviousWithin, findParentWithin } from '../../coreUtils/dom';
import { Events, EventSource } from '../../coreUtils/events';
import { useObservedProperty } from '../../coreUtils/hooks';

/**
 * Utility component to implement [accessible](https://www.w3.org/TR/wai-aria/) focus container.
 *
 * The root component acts as [focus group](https://www.w3.org/TR/wai-aria/#managingfocus)
 * with pre-defined methods to provide keyboard navigation between items (e.g. with arrow keys)
 * and `Tab` key to move focus to/from container or within currently focused item
 * (if a {@link useFocusGroupItem group item} has multiple focusable children).
 *
 * @category Components
 * @see {@link useFocusGroup}
 * @see {@link useFocusGroupItem}
 */
export function FocusGroup(props: {
    /**
     * Render function for children content with {@link useFocusGroupItem focusable items}.
     *
     * Focusable group root ***must** use provided {@link FocusGroupProvidedProps.ref ref}
     * to properly maintain the focusable state.
     */
    children: (providedProps: FocusGroupProvidedProps) => React.ReactNode;
}) {
    const {children} = props;
    const [controller] = React.useState(() => new StatefulFocusGroupController());

    const content = children({ref: controller._setRoot, controller});

    const [focusableVersion, setFocusableVersion] = React.useState(0);
    React.useLayoutEffect(
        () => controller.ensureFocusable(),
        [focusableVersion, content]
    );

    React.useEffect(() => {
        let queued = false;
        const listener = () => {
            if (!queued) {
                queued = true;
                setTimeout(() => {
                    setFocusableVersion(v => (v + 1) % Number.MAX_SAFE_INTEGER);
                    queued = false;
                }, 0);
            }
        };
        controller.events.on('lostFocusable', listener);
        return () => controller.events.off('lostFocusable', listener);
    }, []);

    return (
        <FocusGroupContext.Provider value={controller}>
            {content}
        </FocusGroupContext.Provider>
    );
}

const FocusGroupContext = React.createContext<StatefulFocusGroupController | null>(null);

/**
 * Props for {@link FocusGroup} children render function.
 */
export interface FocusGroupProvidedProps {
    /**
     * **Required** ref for the group root element.
     */
    readonly ref: (element: HTMLElement | null) => void;
    /**
     * Controller to manipulate the focus inside the group.
     */
    readonly controller: FocusGroupController;
}

/**
 * @category Hooks
 * @see {@link FocusGroup}
 */
export function useFocusGroup(): FocusGroupController {
    const controller = React.useContext(FocusGroupContext);
    if (!controller) {
        throw new Error('Reactodia: missing <FocusGroup> context');
    }
    return controller;
}

/**
 * Result for {@link useFocusGroupItem} hook function.
 */
export interface UseFocusGroupItemResult {
    /**
     * **Required** ref for the focusable group item element.
     */
    readonly ref: (element: HTMLElement | null) => void;
    /**
     * [tabindex](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/tabindex)
     * attribute for the focusable sub-children inside the group item.
     */
    readonly tabIndex: -1 | 0 | undefined;
}

/**
 * Hook to render a focusable item inside {@link FocusGroup}.
 *
 * Focusable item allows multiple "tab-indexable" sub-children inside reachable via `Tab` key
 * when the item is focused. When moving focus with {@link FocusGroupController.focusNext}
 * and other methods, the first "tab-indexable" sub-child would be focused.
 *
 * Focusable item element ***must** use provided {@link UseFocusGroupItemResult.ref ref}
 * to properly maintain the focusable state.
 *
 * @category Hooks
 * @see {@link FocusGroup}
 */
export function useFocusGroupItem(params?: {
    /**
     * Sets the group item to be "active" as opposed to "disabled".
     *
     * Only active items can be focused with {@link FocusGroupController} methods.
     */
    active?: boolean;
    /**
     * Internal item label for debugging purposes.
     */
    debugLabel?: string | number;
}): UseFocusGroupItemResult {
    const {debugLabel, active = true} = params ?? {};
    const controller = React.useContext(FocusGroupContext);
    if (!controller) {
        throw new Error('Reactodia: missing <FocusGroup> context');
    }
    const [token] = React.useState(new FocusToken(debugLabel));
    const itemRef = React.useCallback((element: HTMLElement | null) => {
        controller._bindFocusable(token, element);
    }, [controller, token]);
    const isFocused = useObservedProperty(
        controller.events,
        'changeFocus',
        () => controller._getFocus() === token
    );
    return {
        ref: itemRef,
        tabIndex: active ? (isFocused ? 0 : -1) : undefined,
    };
}

class FocusToken {
    constructor(
        readonly debugLabel?: string | number
    ) {}
}

/**
 * Controller to manipulate the focus inside the {@link FocusGroup}.
 */
export interface FocusGroupController {
    /**
     * Gets current focus group root DOM element.
     */
    getRoot(): HTMLElement | null;
    /**
     * Tries to focus on active item containing specified `leaf` child.
     */
    focusAt(leaf: HTMLElement): void;
    /**
     * Tries to focus on a previous active item closest to item with
     * specified `from` child.
     */
    focusPrevious(params: { from: Element }): void;
    /**
     * Tries to focus on a next active item closest to item with
     * specified `from` child.
     */
    focusNext(params: { from: Element }): void;
    /**
     * Tries to focus on a parent active item closest to item with
     * specified `from` child.
     */
    focusParent(params: { from: Element }): void;
    /**
     * Ensures that the group has a reachable via `Tab` key focusable item
     * otherwise (or always if `reset` is true) makes the first active
     * focusable item as such.
     */
    ensureFocusable(params?: { reset?: boolean }): void;
    /**
     * Default implementation for `onClick` handler which focuses on the clicked item.
     */
    readonly defaultClick: (e: React.MouseEvent) => void;
    /**
     * Default implementation for `onKeyDown` handler which focuses on the next/previous
     * items on `ArrowDown`/`ArrowUp` keys.
     */
    readonly defaultKeyDown: (e: React.KeyboardEvent) => void;
}

interface FocusGroupControllerEvents {
    changeFocus: { readonly source: StatefulFocusGroupController };
    lostFocusable: { readonly source: StatefulFocusGroupController };
}

class StatefulFocusGroupController implements FocusGroupController {
    private readonly _source = new EventSource<FocusGroupControllerEvents>();
    readonly events: Events<FocusGroupControllerEvents> = this._source;

    private _root: HTMLElement | null = null;
    private _tokens = new WeakMap<Element, FocusToken>();
    private _focus: FocusToken | undefined;

    getRoot(): HTMLElement | null {
        return this._root;
    }

    readonly _setRoot = (root: HTMLElement | null) => {
        this._root = root;
        this._focus = undefined;
    };

    _getFocus(): FocusToken | undefined {
        return this._focus;
    }

    _bindFocusable(token: FocusToken, element: HTMLElement | null) {
        if (element) {
            this._tokens.set(element, token);
        } else if (token === this._focus) {
            this._source.trigger('lostFocusable', {source: this});
        }
    }

    private _isItem = (element: Element): boolean => {
        return this._tokens.has(element);
    };

    private _isFocusableItem = (element: Element): boolean => {
        return this._isItem(element) && Boolean(
            element.hasAttribute('tabindex') || element.querySelector('[tabindex]')
        );
    };

    focusAt(leaf: HTMLElement): void {
        if (!this._root) {
            return;
        }
        const item = findParentWithin(leaf, this._root, this._isItem);
        if (item) {
            this._changeFocused(item);
        }
    }

    focusPrevious(params: { from: Element }): void {
        const {from} = params;
        if (!this._root) {
            return;
        }
        const item = findParentWithin(from, this._root, this._isItem);
        if (item) {
            const previous = findPreviousWithin(item, this._root, this._isFocusableItem);
            this._tryFocusOnItemElement(previous);
        }
    }

    focusNext(params: { from: Element }): void {
        const {from} = params;
        if (!this._root) {
            return;
        }
        const item = findParentWithin(from, this._root, this._isItem);
        if (item) {
            const next = findNextWithin(item, this._root, this._isFocusableItem);
            this._tryFocusOnItemElement(next);
        }
    }

    focusParent(params: { from: Element }): void {
        const {from} = params;
        if (!this._root) {
            return;
        }
        const item = findParentWithin(from, this._root, this._isItem);
        if (!item) {
            return;
        }
        const parent = item.parentElement
            ? findParentWithin(item.parentElement, this._root, this._isItem)
            : undefined;
        this._tryFocusOnItemElement(parent);
    }

    ensureFocusable(params?: { reset?: boolean }): void {
        const {reset = false} = params ?? {};
        if (!this._root) {
            return;
        }

        const focusedToken = reset ? undefined : this._focus;
        if (focusedToken) {
            for (const focusable of this._root.querySelectorAll('[tabindex="0"]')) {
                const item = findParentWithin(focusable, this._root, this._isItem);
                const itemToken = item ? this._tokens.get(item) : undefined;
                if (itemToken === focusedToken) {
                    /* Focused item exists and focusable */
                    return;
                }
            }
        }

        let foundFocusable = false;
        for (const focusable of this._root.querySelectorAll('[tabindex]')) {
            const item = findParentWithin(focusable, this._root, this._isItem);
            if (item && this._tokens.has(item)) {
                foundFocusable = true;
                this._changeFocused(item);
                break;
            }
        }

        if (reset && !foundFocusable) {
            this._focus = undefined;
        }
    }

    private _tryFocusOnItemElement(target: Element | undefined): void {
        if (target) {
            const focusable = target.hasAttribute('tabindex')
                ? target : target.querySelector('[tabindex]');
            if (focusable instanceof HTMLElement) {
                focusable.focus();
            }
            this._changeFocused(target);
        }
    };

    private _changeFocused(target: Element): void {
        const token = this._tokens.get(target);
        if (token && this._focus !== token) {
            this._focus = token;
            this._source.trigger('changeFocus', {source: this});
        }
    }

    defaultClick = (e: React.MouseEvent) => {
        if (e.target instanceof HTMLElement) {
            this.focusAt(e.target);
        }
    };

    defaultKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (e.target instanceof HTMLElement) {
                this.focusPrevious({from: e.target});
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (e.target instanceof HTMLElement) {
                this.focusNext({from: e.target});
            }
        }
    };
}
