import { Events, EventSource, PropertyChange } from '../coreUtils/events';
import { BufferingQueue } from '../coreUtils/scheduler';

import {
    ElementModel, ElementTypeModel, LinkModel, LinkTypeModel, PropertyTypeModel,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri,
} from '../data/model';
import { DataProvider } from '../data/provider';

import { ElementType, LinkType, PropertyType } from '../diagram/elements';
import { Graph } from '../diagram/graph';

export interface DataFetcherEvents {
    changeOperations: ChangeOperationsEvent;
}

export interface ChangeOperationsEvent {
    readonly previous: ReadonlyArray<FetchOperation>;
    readonly fail?: FetchOperationFail;
}

export interface FetchOperationFail {
    readonly operation: FetchOperation;
    readonly error: unknown;
}

export type FetchOperation =
    | FetchOperationElement
    | FetchOperationLink
    | FetchOperationElementType
    | FetchOperationLinkType
    | FetchOperationPropertyType;

export interface FetchOperationElement {
    readonly type: 'element';
    readonly targets: ReadonlySet<ElementIri>;
}

export interface FetchOperationLink {
    readonly type: 'link';
}

export interface FetchOperationElementType {
    readonly type: 'elementType';
    readonly targets: ReadonlySet<ElementTypeIri>;
}

export interface FetchOperationLinkType {
    readonly type: 'linkType';
    readonly targets: ReadonlySet<LinkTypeIri>;
}

export interface FetchOperationPropertyType {
    readonly type: 'propertyType';
    readonly targets: ReadonlySet<PropertyTypeIri>;
}

export class DataFetcher {
    private readonly source = new EventSource<DataFetcherEvents>();
    readonly events: Events<DataFetcherEvents> = this.source;

    private readonly cancellation = new AbortController();

    private _operations: ReadonlyArray<FetchOperation> = [];

    private classQueue = new BufferingQueue<ElementTypeIri>(classIds => {
        const operation: FetchOperationElementType = {
            type: 'elementType',
            targets: new Set(classIds),
        };
        const task = this.dataProvider
            .elementTypes({classIds, signal: this.signal})
            .then(this.onElementTypesLoaded);
        this.addOperation(operation, task);
    });
    private linkTypeQueue = new BufferingQueue<LinkTypeIri>(linkTypeIds => {
        const operation: FetchOperationLinkType = {
            type: 'linkType',
            targets: new Set(linkTypeIds),
        };
        const task = this.dataProvider
            .linkTypes({linkTypeIds, signal: this.signal})
            .then(this.onLinkTypesLoaded);
        this.addOperation(operation, task);
    });
    private propertyTypeQueue = new BufferingQueue<PropertyTypeIri>(propertyIds => {
        const operation: FetchOperationPropertyType = {
            type: 'propertyType',
            targets: new Set(propertyIds),
        };
        const task = this.dataProvider
            .propertyTypes({propertyIds, signal: this.signal})
            .then(this.onPropertyTypesLoaded);
        this.addOperation(operation, task);
    });

    constructor(
        private graph: Graph,
        private dataProvider: DataProvider,
    ) {}

    get signal(): AbortSignal {
        return this.cancellation.signal;
    }

    dispose() {
        this.cancellation.abort();
    }

    get operations(): ReadonlyArray<FetchOperation> {
        return this._operations;
    }

    private addOperation(
        operation: FetchOperation,
        task: Promise<unknown>
    ): void {
        const previous = this._operations;
        const next = [...previous, operation];
        task.then(
            () => this.onOperationComplete(operation),
            error => this.onOperationComplete(operation, error)
        );
        this._operations = next;
        this.source.trigger('changeOperations', {previous});
    }

    private onOperationComplete(operation: FetchOperation, error?: unknown): void {
        const previous = this._operations;
        const index = previous.indexOf(operation);
        if (index >= 0) {
            const next = [...previous];
            next.splice(index, 1);
            this._operations = next;
        }
        if (this._operations !== previous || error) {
            this.source.trigger('changeOperations', {
                previous,
                fail: error ? {operation, error} : undefined,
            });
        }
    }

    fetchElementData(elementIris: ReadonlyArray<ElementIri>): Promise<void> {
        if (elementIris.length === 0) {
            return Promise.resolve();
        }
        const operation: FetchOperationElement = {
            type: 'element',
            targets: new Set(elementIris),
        };
        const task = this.dataProvider
            .elements({elementIds: [...elementIris], signal: this.signal})
            .then(this.onElementInfoLoaded);
        this.addOperation(operation, task);
        return task;
    }

    private onElementInfoLoaded = (elements: Map<ElementIri, ElementModel>) => {
        for (const element of this.graph.getElements()) {
            const loadedModel = elements.get(element.iri);
            if (loadedModel) {
                element.setData(loadedModel);
            }
        }
    };

    fetchLinks(
        elementIris: ReadonlyArray<ElementIri>,
        linkTypeIris?: ReadonlyArray<LinkTypeIri>
    ): Promise<LinkModel[]> {
        const operation: FetchOperationLink = {
            type: 'link',
        };
        const task = this.dataProvider.links({
            elementIds: elementIris,
            linkTypeIds: linkTypeIris,
        });
        this.addOperation(operation, task);
        return task;
    }

    fetchElementType(model: ElementType): void {
        this.classQueue.push(model.id);
    }

    private onElementTypesLoaded = (elementTypes: Map<ElementTypeIri, ElementTypeModel>) => {
        for (const {id, label, count} of elementTypes.values()) {
            const model = this.graph.getElementType(id);
            if (!model) { continue; }
            model.setLabel(label);
            if (typeof count === 'number') {
                model.setCount(count);
            }
        }
    };

    fetchLinkType(linkType: LinkType): void {
        this.linkTypeQueue.push(linkType.id);
    }

    private onLinkTypesLoaded = (linkTypes: Map<LinkTypeIri, LinkTypeModel>) => {
        for (const {id, label} of linkTypes.values()) {
            const model = this.graph.getLinkType(id);
            if (!model) { continue; }
            model.setLabel(label);
        }
    };

    fetchPropertyType(propertyType: PropertyType): void {
        this.propertyTypeQueue.push(propertyType.id);
    }

    private onPropertyTypesLoaded = (propertyTypes: Map<PropertyTypeIri, PropertyTypeModel>) => {
        for (const {id, label} of propertyTypes.values()) {
            const targetProperty = this.graph.getPropertyType(id);
            if (targetProperty) {
                targetProperty.setLabel(label);
            }
        }
    };
}
