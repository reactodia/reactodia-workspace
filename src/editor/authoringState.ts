import { HashMap, ReadonlyHashMap, HashSet, ReadonlyHashSet } from '../coreUtils/hashMap';

import { ElementModel, ElementIri, LinkKey, LinkModel, equalLinks, hashLink } from '../data/model';

/**
 * Immutable graph authoring state: added, deleted or changed
 * graph entities and/or relations.
 *
 * @category Core
 */
export interface AuthoringState {
    /**
     * Authoring state for the graph entities.
     */
    readonly elements: ReadonlyMap<ElementIri, ElementChange>;
    /**
     * Authoring state for the graph relations.
     */
    readonly links: ReadonlyHashMap<LinkKey, LinkChange>;
}

/**
 * @category Core
 */
export type AuthoringEvent = ElementChange | LinkChange;

/**
 * @category Core
 */
export enum AuthoringKind {
    ChangeElement = 'changeElement',
    ChangeLink = 'changeLink',
}

/**
 * Represents a change to an entity in graph authoring
 * (added, changed or deleted entity).
 *
 * @category Core
 */
export interface ElementChange {
    readonly type: AuthoringKind.ChangeElement;
    readonly before?: ElementModel;
    readonly after: ElementModel;
    readonly newIri?: ElementIri;
    readonly deleted: boolean;
}

/**
 * Represents a change to a relation in graph authoring
 * (added, changed or deleted relation).
 *
 * @category Core
 */
export interface LinkChange {
    readonly type: AuthoringKind.ChangeLink;
    readonly before?: LinkModel;
    readonly after: LinkModel;
    readonly deleted: boolean;
}

/**
 * A mutable clone of the graph authoring state.
 *
 * @see AuthoringState.clone()
 */
export interface MutableAuthoringState extends AuthoringState {
    readonly elements: Map<ElementIri, ElementChange>;
    readonly links: HashMap<LinkKey, LinkChange>;
}

/**
 * Utility functions to operate on graph authoring state.
 *
 * @category Core
 */
export namespace AuthoringState {
    /**
     * Empty graph authoring state.
     */
    export const empty: AuthoringState = {
        elements: new Map<ElementIri, ElementChange>(),
        links: new HashMap<LinkKey, LinkChange>(hashLink, equalLinks),
    };

    /**
     * Returns `true` is specified graph authoring state is empty;
     * otherwise `false`.
     */
    export function isEmpty(state: AuthoringState) {
        return state.elements.size === 0 && state.links.size === 0;
    }

    /**
     * Creates a mutable clone of the specified graph authoring state.
     */
    export function clone(index: AuthoringState): MutableAuthoringState {
        return {
            elements: new Map(index.elements),
            links: index.links.clone(),
        };
    }

    /**
     * Returns `true` if a graph authoring state contains specified `event`;
     * otherwise `false`.
     */
    export function has(state: AuthoringState, event: AuthoringEvent): boolean {
        return event.type === AuthoringKind.ChangeElement
            ? state.elements.get(event.after.id) === event
            : state.links.get(event.after) === event;
    }

    /**
     * Discards the specified event from the graph authoring state if the state contains it.
     */
    export function discard(state: AuthoringState, discarded: AuthoringEvent): AuthoringState {
        if (!has(state, discarded)) {
            return state;
        }
        const newState = clone(state);
        if (discarded.type === AuthoringKind.ChangeElement) {
            newState.elements.delete(discarded.after.id);
            if (!discarded.before) {
                state.links.forEach(e => {
                    if (isLinkConnectedToElement(e.after, discarded.after.id)) {
                        newState.links.delete(e.after);
                    }
                });
            }
        } else {
            newState.links.delete(discarded.after);
        }
        return newState;
    }

    export function addElement(state: AuthoringState, item: ElementModel): AuthoringState {
        const event: ElementChange = {type: AuthoringKind.ChangeElement, after: item, deleted: false};
        const newState = clone(state);
        newState.elements.set(event.after.id, event);
        return newState;
    }

    export function addLink(state: AuthoringState, item: LinkModel): AuthoringState {
        const event: LinkChange = {type: AuthoringKind.ChangeLink, after: item, deleted: false};
        const newState = clone(state);
        newState.links.set(event.after, event);
        return newState;
    }

    export function changeElement(state: AuthoringState, before: ElementModel, after: ElementModel): AuthoringState {
        const newState = clone(state);
        // delete previous state for an entity
        newState.elements.delete(before.id);

        const previous = state.elements.get(before.id);
        if (previous && !previous.before) {
            // adding or changing new entity
            newState.elements.set(after.id, {
                type: AuthoringKind.ChangeElement,
                after,
                deleted: false,
            });
            if (before.id !== after.id) {
                state.links.forEach(e => {
                    if (!e.before && isLinkConnectedToElement(e.after, before.id)) {
                        const updatedLink = updateLinkToReferByNewIri(e.after, before.id, after.id);
                        newState.links.delete(e.after);
                        newState.links.set(updatedLink, {
                            type: AuthoringKind.ChangeLink,
                            after: updatedLink,
                            deleted: false,
                        });
                    }
                });
            }
        } else {
            // changing existing entity
            const iriChanged = after.id !== before.id;
            const previousBefore = previous ? previous.before : undefined;
            newState.elements.set(before.id, {
                type: AuthoringKind.ChangeElement,
                // always initialize 'before', otherwise entity will be considered new
                before: previousBefore || before,
                after: iriChanged ? {...after, id: before.id} : after,
                newIri: iriChanged ? after.id : undefined,
                deleted: false,
            });
        }

        return newState;
    }

    export function changeLink(state: AuthoringState, before: LinkModel, after: LinkModel): AuthoringState {
        if (!equalLinks(before, after)) {
            throw new Error('Cannot move link to another element or change its type');
        }
        const newState = clone(state);
        const previous = state.links.get(before);
        newState.links.set(before, {
            type: AuthoringKind.ChangeLink,
            before: previous ? previous.before : undefined,
            after: after,
            deleted: false,
        });
        return newState;
    }

    export function deleteElement(state: AuthoringState, model: ElementModel): AuthoringState {
        const newState = clone(state);
        newState.elements.delete(model.id);
        state.links.forEach(e => {
            if (isLinkConnectedToElement(e.after, model.id)) {
                newState.links.delete(e.after);
            }
        });
        if (!isNewElement(state, model.id)) {
            newState.elements.set(model.id, {
                type: AuthoringKind.ChangeElement,
                before: model,
                after: model,
                deleted: true,
            });
        }
        return newState;
    }

    export function deleteLink(state: AuthoringState, target: LinkModel): AuthoringState {
        const newState = clone(state);
        newState.links.delete(target);
        if (!isNewLink(state, target)) {
            newState.links.set(target, {
                type: AuthoringKind.ChangeLink,
                before: target,
                after: target,
                deleted: true,
            });
        }
        return newState;
    }

    export function deleteNewLinksConnectedToElements(
        state: AuthoringState, elementIris: Set<ElementIri>
    ): AuthoringState {
        const newState = clone(state);
        state.links.forEach(e => {
            if (!e.before) {
                const target = e.after;
                if (elementIris.has(target.sourceId) || elementIris.has(target.targetId)) {
                    newState.links.delete(target);
                }
            }
        });
        return newState;
    }

    export function isNewElement(state: AuthoringState, target: ElementIri): boolean {
        const event = state.elements.get(target);
        return Boolean(event && event.type === AuthoringKind.ChangeElement && !event.before);
    }

    export function isDeletedElement(state: AuthoringState, target: ElementIri): boolean {
        const event = state.elements.get(target);
        return Boolean(event && event.deleted);
    }

    export function isElementWithModifiedIri(state: AuthoringState, target: ElementIri): boolean {
        const event = state.elements.get(target);
        return Boolean(
            event &&
            event.type === AuthoringKind.ChangeElement &&
            event.before &&
            event.newIri
        );
    }

    export function isNewLink(state: AuthoringState, key: LinkKey): boolean {
        const event = state.links.get(key);
        return Boolean(event && !event.before);
    }

    export function isDeletedLink(state: AuthoringState, key: LinkKey): boolean {
        const event = state.links.get(key);
        return event && event.deleted ||
            isDeletedElement(state, key.sourceId) ||
            isDeletedElement(state, key.targetId);
    }

    export function isUncertainLink(state: AuthoringState, key: LinkKey): boolean {
        return !isDeletedLink(state, key) && (
            isElementWithModifiedIri(state, key.sourceId) ||
            isElementWithModifiedIri(state, key.targetId)
        );
    }
}

/**
 * Immutable temporary (transient) state for the graph authoring.
 *
 * Represents a set of temporary entities and relations which are
 * discarded from the diagram if a graph authoring operation gets
 * cancelled.
 *
 * @category Core
 */
export interface TemporaryState {
    /**
     * A set of temporary entities.
     */
    readonly elements: ReadonlySet<ElementIri>;
    /**
     * A set of temporary relations.
     */
    readonly links: ReadonlyHashSet<LinkKey>;
}

/**
 * Utility functions to operate on temporary state for the graph authoring.
 *
 * @category Core
 */
export namespace TemporaryState {
    /**
     * Empty temporary state for the graph authoring.
     */
    export const empty: TemporaryState = {
        elements: new Set<ElementIri>(),
        links: new HashSet<LinkKey>(hashLink, equalLinks),
    };

    export function addElement(state: TemporaryState, element: ElementModel): TemporaryState {
        if (state.elements.has(element.id)) {
            return state;
        }
        const elements = new Set(state.elements);
        elements.add(element.id);
        return {...state, elements};
    }

    export function deleteElement(state: TemporaryState, element: ElementModel): TemporaryState {
        if (!state.elements.has(element.id)) {
            return state;
        }
        const elements = new Set(state.elements);
        elements.delete(element.id);
        return {...state, elements};
    }

    export function addLink(state: TemporaryState, link: LinkKey) {
        if (state.links.has(link)) {
            return state;
        }
        const links = state.links.clone();
        links.add(link);
        return {...state, links};
    }
    export function deleteLink(state: TemporaryState, link: LinkKey) {
        if (!state.links.has(link)) {
            return state;
        }
        const links = state.links.clone();
        links.delete(link);
        return {...state, links};
    }
}

function isLinkConnectedToElement(link: LinkKey, elementIri: ElementIri) {
    return link.sourceId === elementIri || link.targetId === elementIri;
}

function updateLinkToReferByNewIri(link: LinkModel, oldIri: ElementIri, newIri: ElementIri): LinkModel {
    return {
        ...link,
        sourceId: link.sourceId === oldIri ? newIri : link.sourceId,
        targetId: link.targetId === oldIri ? newIri : link.targetId,
    };
}
