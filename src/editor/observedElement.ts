import * as React from 'react';

import { Listener } from '../coreUtils/events';
import { KeyedObserver } from '../coreUtils/keyedObserver';

import { ElementTypeIri, PropertyTypeIri } from '../data/model';

import { Element } from '../diagram/elements';

import { useWorkspace } from '../workspace/workspaceContext';

import { DataDiagramModel } from './dataDiagramModel';
import { EntityElement, ElementTypeEvents, PropertyTypeEvents } from './dataElements';

export function useObservedElement(element: Element): void {
    const data = element instanceof EntityElement ? element.data : undefined;
    const {model} = useWorkspace();

    interface ObservedState {
        readonly typeObserver: KeyedObserver<ElementTypeIri>;
        readonly propertyObserver: KeyedObserver<PropertyTypeIri>;
    }
    const observedStateRef = React.useRef<ObservedState | undefined>();
    const [, setVersion] = React.useState(0);

    React.useEffect(() => {
        if (!data) {
            return;
        }
        let observedState = observedStateRef.current;
        if (!observedState) {
            const updateVersion = () => setVersion(version => version + 1);
            const typeObserver = observeElementTypes(
                model, 'changeData', updateVersion
            );
            const propertyObserver = observeProperties(
                model, 'changeData', updateVersion
            );
            observedState = {typeObserver, propertyObserver};
        }
        observedState.typeObserver.observe(data.types);
        observedState.propertyObserver.observe(Object.keys(data.properties) as PropertyTypeIri[]);
    }, [data?.types, data?.properties]);

    React.useEffect(() => {
        return () => {
            const observedState = observedStateRef.current;
            if (observedState) {
                observedState.typeObserver.stopListening();
                observedState.propertyObserver.stopListening();
            }
        };
    }, []);
}

function observeElementTypes<Event extends keyof ElementTypeEvents>(
    model: DataDiagramModel, event: Event, listener: Listener<ElementTypeEvents, Event>
) {
    return new KeyedObserver<ElementTypeIri>(key => {
        const type = model.getElementType(key);
        if (type) {
            type.events.on(event, listener);
            return () => type.events.off(event, listener);
        }
        return undefined;
    });
}

function observeProperties<Event extends keyof PropertyTypeEvents>(
    model: DataDiagramModel, event: Event, listener: Listener<PropertyTypeEvents, Event>
) {
    return new KeyedObserver<PropertyTypeIri>(key => {
        const property = model.getPropertyType(key);
        if (property) {
            property.events.on(event, listener);
            return () => property.events.off(event, listener);
        }
        return undefined;
    });
}
