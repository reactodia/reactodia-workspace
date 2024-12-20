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
    readonly elements: ReadonlyMap<ElementIri, AuthoredEntity>;
    /**
     * Authoring state for the graph relations.
     */
    readonly links: ReadonlyHashMap<LinkKey, AuthoredRelation>;
}

/**
 * Represents a modification to an entity or relation
 * in graph authoring (add, change or delete).
 *
 * @category Core
 */
export type AuthoringEvent = AuthoredEntity | AuthoredRelation;

/**
 * Graph authoring state for an entity.
 */
export type AuthoredEntity =
    | AuthoredEntityAdd
    | AuthoredEntityChange
    | AuthoredEntityDelete;

/**
 * Graph authoring state for a relation.
 */
export type AuthoredRelation =
    | AuthoredRelationAdd
    | AuthoredRelationChange
    | AuthoredRelationDelete;

/**
 * Represents added entity in the graph authoring state.
 *
 * @see {@link AuthoredEntity}
 */
export interface AuthoredEntityAdd {
    /**
     * Authoring event type.
     */
    readonly type: 'entityAdd';
    /**
     * Added entity data.
     */
    readonly data: ElementModel;
}

/**
 * Represents changed entity in the graph authoring state.
 *
 * @see {@link AuthoredEntity}
 */
export interface AuthoredEntityChange {
    /**
     * Authoring event type.
     */
    readonly type: 'entityChange';
    /**
     * Original entity data before the change.
     */
    readonly before: ElementModel;
    /**
     * Modified entity data after the change.
     */
    readonly data: ElementModel;
    /**
     * Specifies that the entity has a modified IRI.
     */
    readonly newIri?: ElementIri;
}

/**
 * Represents deleted entity in the graph authoring state.
 *
 * @see {@link AuthoredEntity}
 */
export interface AuthoredEntityDelete {
    /**
     * Authoring event type.
     */
    readonly type: 'entityDelete';
    /**
     * Data of the deleted entity (unchanged).
     */
    readonly data: ElementModel;
}

/**
 * Represents added relation in the graph authoring state.
 *
 * @see {@link AuthoredRelation}
 */
export interface AuthoredRelationAdd {
    /**
     * Authoring event type.
     */
    readonly type: 'relationAdd';
    /**
     * Added relation data.
     */
    readonly data: LinkModel;
}

/**
 * Represents changed relation in the graph authoring state.
 *
 * @see {@link AuthoredRelation}
 */
export interface AuthoredRelationChange {
    /**
     * Authoring event type.
     */
    readonly type: 'relationChange';
    /**
     * Original relation data before the change.
     */
    readonly before: LinkModel;
    /**
     * Modified relation data after the change.
     *
     * Note: only property changes are supported by the graph authoring,
     * so if relation identity changes it should be deleted and re-created
     * as separate relation.
     */
    readonly data: LinkModel;
}

/**
 * Represents deleted relation in the graph authoring state.
 *
 * @see {@link AuthoredRelation}
 */
export interface AuthoredRelationDelete {
    /**
     * Authoring event type.
     */
    readonly type: 'relationDelete';
    /**
     * Data of the deleted relation (unchanged).
     */
    readonly data: LinkModel;
}

/**
 * A mutable clone of the graph authoring state.
 *
 * @see {@link AuthoringState.clone}
 */
export interface MutableAuthoringState extends AuthoringState {
    readonly elements: Map<ElementIri, AuthoredEntity>;
    readonly links: HashMap<LinkKey, AuthoredRelation>;
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
        elements: new Map<ElementIri, AuthoredEntity>(),
        links: new HashMap<LinkKey, AuthoredRelation>(hashLink, equalLinks),
    };

    /**
     * Returns `true` is specified graph authoring state is empty;
     * otherwise `false`.
     */
    export function isEmpty(state: AuthoringState): boolean {
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
     * Returns `true` if `event` is an entity authoring event; otherwise `false`.
     */
    export function isEntityEvent(event: AuthoringEvent): event is AuthoredEntity {
        switch (event.type) {
            case 'entityAdd':
            case 'entityChange':
            case 'entityDelete': {
                return true;
            }
            default: {
                return false;
            }
        }
    }

    /**
     * Returns `true` if `event` is an relation authoring event; otherwise `false`.
     */
    export function isLinkEvent(event: AuthoringEvent): event is AuthoredRelation {
        return !isEntityEvent(event);
    }

    /**
     * Returns `true` if a graph authoring state contains specified `event`;
     * otherwise `false`.
     */
    export function has(state: AuthoringState, event: AuthoringEvent): boolean {
        return isEntityEvent(event)
            ? state.elements.get(event.data.id) === event
            : state.links.get(event.data) === event;
    }

    /**
     * Discards the specified event from the graph authoring state if the state contains it.
     */
    export function discard(state: AuthoringState, discarded: AuthoringEvent): AuthoringState {
        if (!has(state, discarded)) {
            return state;
        }
        const newState = clone(state);
        if (isEntityEvent(discarded)) {
            newState.elements.delete(discarded.data.id);
            if (discarded.type === 'entityAdd') {
                for (const {data: link} of state.links.values()) {
                    if (isLinkConnectedToElement(link, discarded.data.id)) {
                        newState.links.delete(link);
                    }
                }
            }
        } else {
            newState.links.delete(discarded.data);
        }
        return newState;
    }

    /**
     * Marks the entity as added in the graph authored state.
     */
    export function addEntity(state: AuthoringState, data: ElementModel): AuthoringState {
        const newState = clone(state);
        newState.elements.set(data.id, {type: 'entityAdd', data});
        return newState;
    }

    /**
     * Marks the relation as added in the graph authored state.
     */
    export function addRelation(state: AuthoringState, data: LinkModel): AuthoringState {
        const newState = clone(state);
        newState.links.set(data, {type: 'relationAdd', data});
        return newState;
    }

    /**
     * Marks the entity as changed in the graph authored state.
     */
    export function changeEntity(state: AuthoringState, before: ElementModel, after: ElementModel): AuthoringState {
        const newState = clone(state);
        // delete previous state for an entity
        newState.elements.delete(before.id);

        const previous = state.elements.get(before.id);
        if (!previous || previous.type === 'entityChange' || previous.type === 'entityDelete') {
            // changing existing entity
            const iriChanged = after.id !== before.id;
            newState.elements.set(before.id, {
                type: 'entityChange',
                before: previous && previous.type === 'entityChange' ? previous.before : before,
                data: iriChanged ? {...after, id: before.id} : after,
                newIri: iriChanged ? after.id : undefined,
            });
        } else {
            // adding or changing new entity
            newState.elements.set(after.id, {type: 'entityAdd', data: after});
            if (before.id !== after.id) {
                for (const e of state.links.values()) {
                    if (e.type !== 'relationChange' && isLinkConnectedToElement(e.data, before.id)) {
                        const updatedLink = updateLinkToReferByNewIri(e.data, before.id, after.id);
                        newState.links.delete(e.data);
                        newState.links.set(updatedLink, {type: 'relationAdd', data: updatedLink});
                    }
                }
            }
        }

        return newState;
    }

    /**
     * Marks the relation as changed in the graph authored state.
     */
    export function changeRelation(state: AuthoringState, before: LinkModel, after: LinkModel): AuthoringState {
        if (!equalLinks(before, after)) {
            throw new Error('Cannot move link to another element or change its type');
        }
        const newState = clone(state);
        const previous = state.links.get(before);
        newState.links.set(before, {
            type: 'relationChange',
            before: (previous && previous.type === 'relationChange') ? previous.before : before,
            data: after,
        });
        return newState;
    }

    /**
     * Marks the entity as deleted in the graph authored state.
     */
    export function deleteEntity(state: AuthoringState, data: ElementModel): AuthoringState {
        const newState = clone(state);
        newState.elements.delete(data.id);
        for (const {data: link} of state.links.values()) {
            if (isLinkConnectedToElement(link, data.id)) {
                newState.links.delete(link);
            }
        }
        if (!isAddedEntity(state, data.id)) {
            newState.elements.set(data.id, {type: 'entityDelete', data});
        }
        return newState;
    }

    /**
     * Marks the relation as deleted in the graph authored state.
     */
    export function deleteRelation(state: AuthoringState, data: LinkModel): AuthoringState {
        const newState = clone(state);
        newState.links.delete(data);
        if (!isAddedRelation(state, data)) {
            newState.links.set(data, {type: 'relationDelete', data});
        }
        return newState;
    }

    /**
     * Discards marked as added relations connected to the specified entities.
     */
    export function discardAddedRelations(
        state: AuthoringState,
        connectedEntities: ReadonlySet<ElementIri>
    ): AuthoringState {
        const newState = clone(state);
        for (const e of state.links.values()) {
            if (e.type === 'relationAdd') {
                const target = e.data;
                if (connectedEntities.has(target.sourceId) || connectedEntities.has(target.targetId)) {
                    newState.links.delete(target);
                }
            }
        }
        return newState;
    }

    /**
     * Returns `true` if target entity is marked as added in the graph authoring state;
     * otherwise `false`.
     */
    export function isAddedEntity(state: AuthoringState, target: ElementIri): boolean {
        const event = state.elements.get(target);
        return Boolean(event && event.type === 'entityAdd');
    }

    /**
     * Returns `true` if target entity is marked as deleted in the graph authoring state;
     * otherwise `false`.
     */
    export function isDeletedEntity(state: AuthoringState, target: ElementIri): boolean {
        const event = state.elements.get(target);
        return Boolean(event && event.type === 'entityDelete');
    }

    /**
     * Returns `true` if target entity is marked as changed and have modified IRI
     * in the graph authoring state; otherwise `false`.
     */
    export function hasEntityChangedIri(state: AuthoringState, target: ElementIri): boolean {
        const event = state.elements.get(target);
        return Boolean(event && event.type === 'entityChange' && event.newIri);
    }

    /**
     * Returns `true` if target relation is marked as added in the graph authoring state;
     * otherwise `false`.
     */
    export function isAddedRelation(state: AuthoringState, key: LinkKey): boolean {
        const event = state.links.get(key);
        return Boolean(event && event.type === 'relationAdd');
    }

    /**
     * Returns `true` if target relation is marked as deleted in the graph authoring state;
     * otherwise `false`.
     */
    export function isDeletedRelation(state: AuthoringState, key: LinkKey): boolean {
        const event = state.links.get(key);
        return (
            event && event.type === 'relationDelete' ||
            isDeletedEntity(state, key.sourceId) ||
            isDeletedEntity(state, key.targetId)
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

    /**
     * Marks the entity as temporary.
     */
    export function addEntity(state: TemporaryState, element: ElementModel): TemporaryState {
        if (state.elements.has(element.id)) {
            return state;
        }
        const elements = new Set(state.elements);
        elements.add(element.id);
        return {...state, elements};
    }

    /**
     * Discards the entity from temporary state.
     */
    export function removeEntity(state: TemporaryState, element: ElementModel): TemporaryState {
        if (!state.elements.has(element.id)) {
            return state;
        }
        const elements = new Set(state.elements);
        elements.delete(element.id);
        return {...state, elements};
    }

    /**
     * Marks the relation as temporary.
     */
    export function addRelation(state: TemporaryState, link: LinkKey): TemporaryState {
        if (state.links.has(link)) {
            return state;
        }
        const links = state.links.clone();
        links.add(link);
        return {...state, links};
    }

    /**
     * Discards the relation from temporary state.
     */
    export function removeRelation(state: TemporaryState, link: LinkKey): TemporaryState {
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
