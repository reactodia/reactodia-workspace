import * as React from 'react';

import { ElementTypeIri, PropertyTypeIri, ElementModel } from '../data/model';

import { CanvasContext } from './canvasApi';
import { RichElementTypeEvents, RichPropertyEvents } from './elements';
import { DiagramModel } from './model';

import { Unsubscribe, Listener } from '../coreUtils/events';

export class KeyedObserver<Key extends string> {
    private observedKeys = new Map<string, Unsubscribe>();

    constructor(readonly subscribe: (key: Key) => Unsubscribe | undefined) {}

    observe(keys: ReadonlyArray<Key>) {
        if (keys.length === 0 && this.observedKeys.size === 0) {
            return;
        }
        const newObservedKeys = new Map<string, Unsubscribe>();

        for (const key of keys) {
            if (newObservedKeys.has(key)) { continue; }
            let unsubscribe = this.observedKeys.get(key);
            if (!unsubscribe) {
                unsubscribe = this.subscribe(key);
            }
            if (unsubscribe) {
                newObservedKeys.set(key, unsubscribe);
            }
        }

        this.observedKeys.forEach((unsubscribe, key) => {
            if (!newObservedKeys.has(key)) {
                unsubscribe();
            }
        });

        this.observedKeys = newObservedKeys;
    }

    stopListening() {
        this.observe([]);
    }
}

export function useObservedElementData(data: ElementModel): void {
    const {model} = React.useContext(CanvasContext)!;

    interface ObservedState {
        readonly typeObserver: KeyedObserver<ElementTypeIri>;
        readonly propertyObserver: KeyedObserver<PropertyTypeIri>;
    }
    const observedStateRef = React.useRef<ObservedState | undefined>();
    const [, setVersion] = React.useState(0);

    React.useEffect(() => {
        let observedState = observedStateRef.current;
        if (!observedState) {
            const updateVersion = () => setVersion(version => version + 1);
            const typeObserver = observeElementTypes(
                model, 'changeLabel', updateVersion
            );
            const propertyObserver = observeProperties(
                model, 'changeLabel', updateVersion
            );
            observedState = {typeObserver, propertyObserver};
        }
        observedState.typeObserver.observe(data.types);
        observedState.propertyObserver.observe(Object.keys(data.properties) as PropertyTypeIri[]);
    }, [data.types, data.properties]);

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

export function observeElementTypes<Event extends keyof RichElementTypeEvents>(
    model: DiagramModel, event: Event, listener: Listener<RichElementTypeEvents, Event>
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

export function observeProperties<Event extends keyof RichPropertyEvents>(
    model: DiagramModel, event: Event, listener: Listener<RichPropertyEvents, Event>
) {
    return new KeyedObserver<PropertyTypeIri>(key => {
        const property = model.getProperty(key);
        if (property) {
            property.events.on(event, listener);
            return () => property.events.off(event, listener);
        }
        return undefined;
    });
}
