export function findNextWithin(
    from: Element,
    parent: Element,
    condition: (element: Element) => boolean
): Element | undefined {
    let current: Element = from;
    let allowDescent = true;
    do {
        while (true) {
            if (allowDescent && current.firstElementChild) {
                current = current.firstElementChild;
                break;
            } else if (current.nextElementSibling) {
                current = current.nextElementSibling;
                allowDescent = true;
                break;
            } else if (current.parentElement === parent) {
                if (parent.firstElementChild) {
                    current = parent.firstElementChild;
                    allowDescent = true;
                    break;
                } else {
                    return undefined;
                }
            } else if (current.parentElement) {
                current = current.parentElement;
                allowDescent = false;
            } else {
                return undefined;
            }
        }

        if (condition(current)) {
            return current;
        }
    } while (current !== from);
}

export function findPreviousWithin(
    from: Element,
    parent: Element,
    condition: (element: Element) => boolean
): Element | undefined {
    let current: Element = from;
    let descent = false;
    do {
        while (true) {
            if (descent) {
                if (current.lastElementChild) {
                    current = current.lastElementChild;
                } else {
                    descent = false;
                    break;
                }
            } else if (current.previousElementSibling) {
                current = current.previousElementSibling;
                descent = true;
            } else if (current.parentElement === parent) {
                if (parent.lastElementChild) {
                    current = parent.lastElementChild;
                    descent = true;
                } else {
                    return undefined;
                }
            } else if (current.parentElement) {
                current = current.parentElement;
                break;
            } else {
                return undefined;
            }
        }

        if (condition(current)) {
            return current;
        }
    } while (current !== from);
}

export function findParentWithin(
    from: Element,
    parent: Element,
    condition: (element: Element) => boolean
): Element | undefined {
    let current: Element | null = from;
    while (current && current !== parent) {
        if (condition(current)) {
            return current;
        }
        current = current.parentElement;
    }
    return undefined;
}

const FOCUSABLE_SELECTORS: readonly string[] = [
    '[data-reactodia-autofocus]',
    '[autofocus]',
    'input:not(disabled), textarea:not(disabled), button:not(disabled), select:not(disabled), a[href], details > summary',
];

export function findAutoFocusable(parent: HTMLElement): HTMLElement | undefined {
    const activeElement = document.activeElement;
    if (parent.contains(activeElement)) {
        return activeElement instanceof HTMLElement ? activeElement : undefined;
    }
    for (const selector of FOCUSABLE_SELECTORS) {
        const target = parent.querySelector(selector);
        if (target instanceof HTMLElement) {
            return target;
        }
    }
    return undefined;
}
