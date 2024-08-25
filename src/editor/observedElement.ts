import type { KeyedSyncStore } from '../coreUtils/keyedObserver';

import type { ElementTypeIri, LinkTypeIri, PropertyTypeIri } from '../data/model';

import type { DataDiagramModel } from './dataDiagramModel';

/**
 * Allows to subscribe to the changes to the data of multiple element types via `useKeyedSyncStore()`.
 */
export const subscribeElementTypes: KeyedSyncStore<ElementTypeIri, DataDiagramModel> =
    (key, model, onStoreChange) => {
        const elementType = model.createElementType(key);
        elementType.events.on('changeData', onStoreChange);
        return () => elementType.events.off('changeData', onStoreChange);
    };

/**
 * Allows to subscribe to the changes to the data of multiple property types via `useKeyedSyncStore()`.
 */
export const subscribePropertyTypes: KeyedSyncStore<PropertyTypeIri, DataDiagramModel> =
    (key, model, onStoreChange) => {
        const propertyType = model.createPropertyType(key);
        propertyType.events.on('changeData', onStoreChange);
        return () => propertyType.events.off('changeData', onStoreChange);
    };

/**
 * Allows to subscribe to the changes to the data of multiple link types via `useKeyedSyncStore()`.
 */
export const subscribeLinkTypes: KeyedSyncStore<LinkTypeIri, DataDiagramModel> =
    (key, model, onStoreChange) => {
        const linkType = model.createLinkType(key);
        linkType.events.on('changeData', onStoreChange);
        return () => linkType.events.off('changeData', onStoreChange);
    };
