import { Events, EventSource } from '../coreUtils/events';
import { BufferingQueue } from '../coreUtils/scheduler';

import {
    ElementModel, ElementTypeModel, LinkModel, LinkTypeModel, PropertyTypeModel,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri,
} from '../data/model';
import { DataProvider } from '../data/provider';

import { Graph } from '../diagram/graph';

import {
    EntityElement, EntityGroup, EntityGroupItem, ElementType, LinkType, PropertyType,
} from './dataElements';
import { DataGraph } from './dataGraph';

export interface DataFetcherEvents {
    changeOperations: ChangeOperationsEvent;
}

/**
 * Event data for change current fetch operations event.
 */
export interface ChangeOperationsEvent {
    /**
     * Previous operations before the change.
     */
    readonly previous: ReadonlyArray<FetchOperation>;
    /**
     * If set, specifies the operation that failed and the fail reason (error).
     */
    readonly fail?: FetchOperationFail;
}

/**
 * Describes the failed operation with its fail reason (error).
 *
 * @see ChangeOperationsEvent
 */
export interface FetchOperationFail {
    /**
     * Operation that failed.
     */
    readonly operation: FetchOperation;
    /**
     * The reason why operation failed (the thrown exception).
     */
    readonly error: unknown;
}

/**
 * Describes a operation to fetch graph data from a data provider.
 *
 * @see DataProvider
 */
export type FetchOperation =
    | FetchOperationElement
    | FetchOperationLink
    | FetchOperationElementType
    | FetchOperationLinkType
    | FetchOperationPropertyType;

/**
 * A possible `type` value for an fetch operation with a set of targets.
 *
 * @see FetchOperation
 */
export type FetchOperationTargetType = Exclude<FetchOperation['type'], 'link'>;

/**
 * A type which maps fetch operation `type` to a target type for such operation.
 *
 * @see FetchOperation
 */
export interface FetchOperationTypeToTarget {
    'element': ElementIri;
    'elementType': ElementTypeIri;
    'linkType': LinkTypeIri;
    'propertyType': PropertyTypeIri;
}

/**
 * Fetch operation for an element (graph node) data.
 */
export interface FetchOperationElement {
    /**
     * Fetch operation type.
     */
    readonly type: 'element';
    /**
     * Fetch operation targets.
     */
    readonly targets: ReadonlySet<ElementIri>;
}

/**
 * Fetch operation for links (graph edges) between elements.
 */
export interface FetchOperationLink {
    /**
     * Fetch operation type.
     */
    readonly type: 'link';
}

/**
 * Fetch operation for an element type data.
 */
export interface FetchOperationElementType {
    /**
     * Fetch operation type.
     */
    readonly type: 'elementType';
    /**
     * Fetch operation targets.
     */
    readonly targets: ReadonlySet<ElementTypeIri>;
}

/**
 * Fetch operation for a link type data.
 */
export interface FetchOperationLinkType {
    /**
     * Fetch operation type.
     */
    readonly type: 'linkType';
    /**
     * Fetch operation targets.
     */
    readonly targets: ReadonlySet<LinkTypeIri>;
}

/**
 * Fetch operation for a property type data.
 */
export interface FetchOperationPropertyType {
    /**
     * Fetch operation type.
     */
    readonly type: 'propertyType';
    /**
     * Fetch operation targets.
     */
    readonly targets: ReadonlySet<PropertyTypeIri>;
}

export class DataFetcher {
    private readonly source = new EventSource<DataFetcherEvents>();
    readonly events: Events<DataFetcherEvents> = this.source;

    private readonly cancellation = new AbortController();

    private _operations: ReadonlyArray<FetchOperation> = [];
    private _failReasons = new Map<FetchOperationTargetType, Map<string, unknown>>();

    private elementTypeQueue = new BufferingQueue<ElementTypeIri>(classIds => {
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
        private dataGraph: DataGraph,
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

    getFailReason<T extends FetchOperationTargetType>(
        type: T,
        target: FetchOperationTypeToTarget[T]
    ): unknown {
        const reasons = this._failReasons.get(type);
        return reasons?.get(target);
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

        switch (operation.type) {
            case 'element':
            case 'elementType':
            case 'linkType':
            case 'propertyType': {
                const reasons = this.ensureFailReasons(operation.type);
                for (const target of operation.targets) {
                    // Set or clear the error for the target
                    reasons.set(target, error);
                }
            }
        }

        if (this._operations !== previous || error) {
            this.source.trigger('changeOperations', {
                previous,
                fail: error ? {operation, error} : undefined,
            });
        }
    }

    private ensureFailReasons(type: FetchOperationTargetType): Map<string, unknown> {
        let reasons = this._failReasons.get(type);
        if (!reasons) {
            reasons = new Map<string, unknown>();
            this._failReasons.set(type, reasons);
        }
        return reasons;
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
            if (element instanceof EntityElement) {
                const loadedModel = elements.get(element.iri);
                if (loadedModel) {
                    element.setData(loadedModel);
                }
            } else if (element instanceof EntityGroup) {
                let hasLoadedModel = false;
                for (const item of element.items) {
                    if (elements.has(item.data.id)) {
                        hasLoadedModel = true;
                    }
                }
                if (hasLoadedModel) {
                    const loadedItems = element.items.map((item): EntityGroupItem => {
                        const loadedData = elements.get(item.data.id);
                        return loadedData ? {...item, data: loadedData} : item;
                    });
                    element.setItems(loadedItems);
                }
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
        this.elementTypeQueue.push(model.id);
    }

    private onElementTypesLoaded = (elementTypes: Map<ElementTypeIri, ElementTypeModel>) => {
        for (const data of elementTypes.values()) {
            const model = this.dataGraph.getElementType(data.id);
            if (model) {
                model.setData(data);
            }
        }
    };

    fetchLinkType(linkType: LinkType): void {
        this.linkTypeQueue.push(linkType.id);
    }

    private onLinkTypesLoaded = (linkTypes: Map<LinkTypeIri, LinkTypeModel>) => {
        for (const data of linkTypes.values()) {
            const model = this.dataGraph.getLinkType(data.id);
            if (model) {
                model.setData(data);
            }
        }
    };

    fetchPropertyType(propertyType: PropertyType): void {
        this.propertyTypeQueue.push(propertyType.id);
    }

    private onPropertyTypesLoaded = (propertyTypes: Map<PropertyTypeIri, PropertyTypeModel>) => {
        for (const data of propertyTypes.values()) {
            const model = this.dataGraph.getPropertyType(data.id);
            if (model) {
                model.setData(data);
            }
        }
    };
}
