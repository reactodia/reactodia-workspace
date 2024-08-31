import { Events, EventSource, EventObserver, PropertyChange } from '../coreUtils/events';

import { MetadataApi } from '../data/metadataApi';
import { ValidationApi } from '../data/validationApi';
import { ElementModel, LinkModel, ElementIri, equalLinks } from '../data/model';

import { Element, Link } from '../diagram/elements';
import { Command } from '../diagram/history';
import { GraphStructure } from '../diagram/model';

import {
    AuthoringState, AuthoringKind, AuthoringEvent, TemporaryState,
} from './authoringState';
import { DataDiagramModel } from './dataDiagramModel';
import {
    EntityElement, EntityGroup, RelationLink, RelationGroup, iterateEntitiesOf, iterateRelationsOf,
    changeRelationData, changeEntityData, setEntityGroupItems, setRelationGroupItems,
} from './dataElements';
import { ValidationState, changedElementsToValidate, validateElements } from './validation';

/** @hidden */
export interface EditorProps extends EditorOptions {
    readonly model: DataDiagramModel;
}

export interface EditorOptions {
    readonly validationApi?: ValidationApi;
}

export interface EditorEvents {
    changeMode: { source: EditorController };
    changeAuthoringState: PropertyChange<EditorController, AuthoringState>;
    changeValidationState: PropertyChange<EditorController, ValidationState>;
    changeTemporaryState: PropertyChange<EditorController, TemporaryState>;
}

/**
 * Supports visual data authoring of the graph data (entities and relations).
 *
 * This controller:
 *   - stores authored changes to the graph (`authoringState`);
 *   - validates graph changes and stores the found issues (`validationState`);
 *   - exposes methods to create, change or delete entities and relations;
 *   - provides methods to remove graph elements and links with discarding
 *     relevant changes at the same time, or discarding changes directly.
 *
 * @category Core
 */
export class EditorController {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<EditorEvents>();
    readonly events: Events<EditorEvents> = this.source;

    private readonly model: DataDiagramModel;
    private readonly options: EditorOptions;

    private _metadataApi: MetadataApi | undefined;
    private _authoringState = AuthoringState.empty;
    private _validationState = ValidationState.empty;
    private _temporaryState = TemporaryState.empty;

    private readonly cancellation = new AbortController();

    /** @hidden */
    constructor(props: EditorProps) {
        const {model, ...options} = props;
        this.model = model;
        this.options = options;

        this.listener.listen(this.events, 'changeValidationState', e => {
            for (const element of this.model.elements) {
                if (!(element instanceof EntityElement)) {
                    continue;
                }
                const previous = e.previous.elements.get(element.iri);
                const current = this.validationState.elements.get(element.iri);
                if (current !== previous) {
                    element.redraw();
                }
            }
        });
        this.listener.listen(this.events, 'changeAuthoringState', e => {
            if (this.options.validationApi) {
                const changedElements = changedElementsToValidate(
                    e.previous,
                    this.authoringState,
                    this.model
                );
                validateElements(
                    changedElements,
                    this.options.validationApi,
                    this.model,
                    this,
                    this.cancellation.signal
                );
            }
        });

        document.addEventListener('keyup', this.onKeyUp);
        this.cancellation.signal.addEventListener('abort', () => {
            document.removeEventListener('keyup', this.onKeyUp);
        });
    }

    /** @hidden */
    dispose() {
        this.listener.stopListening();
        this.cancellation.abort();
    }

    get inAuthoringMode(): boolean {
        return Boolean(this._metadataApi);
    }

    get metadataApi(): MetadataApi | undefined { return this._metadataApi; }
    setMetadataApi(value: MetadataApi | undefined) {
        const previous = this._metadataApi;
        if (value === previous) { return; }
        this._metadataApi = value;
        if (Boolean(value) !== Boolean(previous)) {
            // authoring mode changed
            this.source.trigger('changeMode', {source: this});
        }
    }

    get authoringState() { return this._authoringState; }
    setAuthoringState(value: AuthoringState) {
        const previous = this._authoringState;
        if (previous === value) { return; }
        this.model.history.execute(this.updateAuthoringState(value));
    }

    private updateAuthoringState(state: AuthoringState): Command {
        const previous = this._authoringState;
        return Command.create('Create or delete entities and links', () => {
            this._authoringState = state;
            this.source.trigger('changeAuthoringState', {source: this, previous});
            return this.updateAuthoringState(previous);
        });
    }

    get validationState() { return this._validationState; }
    setValidationState(value: ValidationState) {
        const previous = this._validationState;
        if (value === previous) { return; }
        this._validationState = value;
        this.source.trigger('changeValidationState', {source: this, previous});
    }

    get temporaryState() { return this._temporaryState; }
    setTemporaryState(value: TemporaryState) {
        const previous = this._temporaryState;
        if (value === previous) { return; }
        this._temporaryState = value;
        this.source.trigger('changeTemporaryState', {source: this, previous});
    }

    private onKeyUp = (e: KeyboardEvent) => {
        if (
            e.key === 'Delete' &&
            document.activeElement &&
            document.activeElement.localName !== 'input'
        ) {
            this.removeSelectedElements();
        }
    };

    removeSelectedElements() {
        const itemsToRemove = this.model.selection;
        if (itemsToRemove.length > 0) {
            this.model.setSelection([]);
            this.removeItems(itemsToRemove);
        }
    }

    removeItems(items: ReadonlyArray<Element | Link>) {
        const batch = this.model.history.startBatch();
        const entitiesToDiscard = new Set<ElementIri>();

        for (const item of items) {
            if (item instanceof Element) {
                for (const entity of iterateEntitiesOf(item)) {
                    entitiesToDiscard.add(entity.id);
                }
                this.model.removeElement(item.id);
            } else if (item instanceof Link) {
                for (const relation of iterateRelationsOf(item)) {
                    if (AuthoringState.isNewLink(this.authoringState, relation)) {
                        this.deleteRelation(relation);
                    }
                }
            }
        }

        const discardedEntities = new Set<ElementIri>();
        for (const entityIri of entitiesToDiscard) {
            const event = this.authoringState.elements.get(entityIri);
            if (event) {
                this.discardChange(event);
            }
            discardedEntities.add(entityIri);
        }

        if (discardedEntities.size > 0) {
            const newState = AuthoringState.deleteNewLinksConnectedToElements(this.authoringState, discardedEntities);
            this.setAuthoringState(newState);
        }

        batch.store();
    }

    createEntity(data: ElementModel, options: { temporary?: boolean } = {}): EntityElement {
        const batch = this.model.history.startBatch('Create new entity');

        const element = this.model.createElement(data);
        element.setExpanded(true);

        if (options.temporary) {
            this.setTemporaryState(
                TemporaryState.addElement(this.temporaryState, element.data)
            );
            batch.discard();
        } else {
            this.setAuthoringState(
                AuthoringState.addElement(this._authoringState, element.data)
            );
            batch.store();
        }
        return element;
    }

    changeEntity(targetIri: ElementIri, newData: ElementModel): void {
        const elements = findEntities(this.model, targetIri);
        const oldData = findAnyEntityData(elements, targetIri);
        if (!oldData) {
            return;
        }

        const batch = this.model.history.startBatch('Edit entity');

        const newState = AuthoringState.changeElement(this._authoringState, oldData, newData);
        // get created authoring event by either old or new IRI (in case of new entities)
        const event = newState.elements.get(targetIri) || newState.elements.get(newData.id);
        this.model.history.execute(changeEntityData(this.model, targetIri, event!.after));
        this.setAuthoringState(newState);

        batch.store();
    }

    deleteEntity(elementIri: ElementIri): void {
        const state = this.authoringState;
        const elements = findEntities(this.model, elementIri);
        const oldData = findAnyEntityData(elements, elementIri);
        if (!oldData) {
            return;
        }

        const batch = this.model.history.startBatch('Delete entity');

        // Remove new connected links
        for (const element of elements) {
            this.removeRelationsFromLinks(
                this.model.getElementLinks(element),
                relation => AuthoringState.isNewLink(state, relation)
            );
        }

        const event = state.elements.get(elementIri);
        if (event) {
            this.discardChange(event);
        }
        this.setAuthoringState(AuthoringState.deleteElement(state, oldData));
        batch.store();
    }

    createRelation(base: RelationLink, options: { temporary?: boolean } = {}): RelationLink {
        const existingLink = this.model.findLink(base.typeId, base.sourceId, base.targetId);
        if (existingLink) {
            throw Error('The link already exists');
        }

        const batch = this.model.history.startBatch('Create new link');

        this.model.addLink(base);
        if (!options.temporary) {
            this.model.createLinks(base.data);
        }

        if (hasRelationOnDiagram(this.model, base.data)) {
            if (options.temporary) {
                this.setTemporaryState(
                    TemporaryState.addLink(this.temporaryState, base.data)
                );
                batch.discard();
            } else {
                this.setAuthoringState(
                    AuthoringState.addLink(this._authoringState, base.data)
                );
                batch.store();
            }
        } else {
            batch.discard();
        }

        return base;
    }

    changeRelation(oldData: LinkModel, newData: LinkModel) {
        const batch = this.model.history.startBatch('Change link');
        if (equalLinks(oldData, newData)) {
            this.model.history.execute(changeRelationData(this.model, oldData, newData));
            this.setAuthoringState(
                AuthoringState.changeLink(this._authoringState, oldData, newData)
            );
        } else {
            let newState = this._authoringState;
            newState = AuthoringState.deleteLink(newState, oldData);
            newState = AuthoringState.addLink(newState, newData);

            if (AuthoringState.isNewLink(this._authoringState, oldData)) {
                this.removeRelationsFromLinks(
                    this.model.links,
                    relation => equalLinks(relation, oldData)
                );
            }
            this.model.createLinks(newData);
            this.setAuthoringState(newState);
        }
        batch.store();
    }

    moveRelationSource(params: {
        link: RelationLink;
        newSource: EntityElement;
    }): RelationLink {
        const {link, newSource} = params;
        const batch = this.model.history.startBatch('Move link to another element');
        this.changeRelation(link.data, {...link.data, sourceId: newSource.iri});
        const newLink = this.model.findLink(link.typeId, newSource.id, link.targetId) as RelationLink;
        newLink.setVertices(link.vertices);
        batch.store();
        return newLink;
    }

    moveRelationTarget(params: {
        link: RelationLink;
        newTarget: EntityElement;
    }): RelationLink {
        const {link, newTarget} = params;
        const batch = this.model.history.startBatch('Move link to another element');
        this.changeRelation(link.data, {...link.data, targetId: newTarget.iri});
        const newLink = this.model.findLink(link.typeId, link.sourceId, newTarget.id) as RelationLink;
        newLink.setVertices(link.vertices);
        batch.store();
        return newLink;
    }

    deleteRelation(model: LinkModel): void {
        const state = this.authoringState;
        if (AuthoringState.isDeletedLink(state, model)) {
            return;
        }
        const batch = this.model.history.startBatch('Delete link');
        const newState = AuthoringState.deleteLink(state, model);
        if (AuthoringState.isNewLink(state, model)) {
            this.removeRelationsFromLinks(
                this.model.links,
                relation => equalLinks(relation, model)
            );
        }
        this.setAuthoringState(newState);
        batch.store();
    }

    removeAllTemporaryCells(): void {
        const {temporaryState} = this;

        const cellsToRemove: Array<Element | Link> = [];
        if (temporaryState.elements.size > 0) {
            for (const element of this.model.elements) {
                if (element instanceof EntityElement && temporaryState.elements.has(element.iri)) {
                    cellsToRemove.push(element);
                }
            }
        }
        if (temporaryState.links.size > 0) {
            for (const link of this.model.links) {
                if (link instanceof RelationLink && temporaryState.links.has(link.data)) {
                    cellsToRemove.push(link);
                }
            }
        }

        if (cellsToRemove.length > 0) {
            this.removeTemporaryCells(cellsToRemove);
        }
    }

    removeTemporaryCells(cells: ReadonlyArray<Element | Link>) {
        const {temporaryState} = this;
        let nextTemporaryState = temporaryState;
        const batch = this.model.history.startBatch();

        for (const cell of cells) {
            if (cell instanceof EntityElement) {
                if (temporaryState.elements.has(cell.iri)) {
                    nextTemporaryState = TemporaryState.deleteElement(nextTemporaryState, cell.data);
                    this.model.removeElement(cell.id);
                }
            } else if (cell instanceof RelationLink) {
                if (temporaryState.links.has(cell.data)) {
                    nextTemporaryState = TemporaryState.deleteLink(nextTemporaryState, cell.data);
                    this.model.removeLink(cell.id);
                }
            }
        }

        batch.discard();
        this.setTemporaryState(nextTemporaryState);
    }

    discardChange(event: AuthoringEvent): void {
        const newState = AuthoringState.discard(this._authoringState, event);
        if (newState === this._authoringState) { return; }

        const batch = this.model.history.startBatch('Discard change');
        if (event.type === AuthoringKind.ChangeElement) {
            if (event.deleted) {
                /* nothing */
            } else if (event.before) {
                this.model.history.execute(
                    changeEntityData(this.model, event.after.id, event.before)
                );
            } else {
                for (const element of findEntities(this.model, event.after.id)) {
                    if (element instanceof EntityElement) {
                        this.model.removeElement(element.id);
                    } else if (element instanceof EntityGroup) {
                        this.discardItemFromGroup(element, event.after.id);
                    }
                }
            }
        } else if (event.type === AuthoringKind.ChangeLink) {
            if (event.deleted) {
                /* nothing */
            } else if (event.before) {
                this.model.history.execute(
                    changeRelationData(this.model, event.after, event.before)
                );
            } else {
                this.removeRelationsFromLinks(
                    this.model.links,
                    relation => equalLinks(relation, event.after)
                );
            }
        }
        this.setAuthoringState(newState);
        batch.store();
    }

    private discardItemFromGroup(group: EntityGroup, target: ElementIri): void {
        const nextItems = group.items.filter(item => item.data.id !== target);
        this.model.history.execute(setEntityGroupItems(group, nextItems));

        this.removeRelationsFromLinks(
            this.model.getElementLinks(group),
            ({sourceId, targetId}) => sourceId === target || targetId === target
        );

        if (nextItems.length <= 1) {
            this.model.ungroupAll([group]);
        }
    }

    private removeRelationsFromLinks(
        relations: ReadonlyArray<Link>,
        match: (relation: LinkModel) => boolean
    ): void {
        const toRemove: Link[] = [];
        const toRegroup: RelationGroup[] = [];
        for (const link of relations) {
            if (link instanceof RelationLink) {
                if (match(link.data)) {
                    toRemove.push(link);
                }
            } else if (link instanceof RelationGroup) {
                if (link.items.some(item => match(item.data))) {
                    const items = link.items.filter(item => !match(item.data));
                    this.model.history.execute(setRelationGroupItems(link, items));
                    toRegroup.push(link);
                }
            }
        }
        for (const link of toRemove) {
            this.model.removeLink(link.id);
        }
        this.model.regroupLinks(toRegroup);
    }
}

function findEntities(graph: GraphStructure, iri: ElementIri): Array<EntityElement | EntityGroup> {
    return graph.elements.filter((el): el is EntityElement | EntityGroup =>
        el instanceof EntityElement && el.iri === iri ||
        el instanceof EntityGroup && el.itemIris.has(iri)
    );
}

function findAnyEntityData(
    entities: ReadonlyArray<EntityElement | EntityGroup>,
    target: ElementIri
): ElementModel | undefined {
    for (const element of entities) {
        for (const data of iterateEntitiesOf(element)) {
            if (data.id === target) {
                return data;
            }
        }
    }
    return undefined;
}

function hasRelationOnDiagram(graph: GraphStructure, target: LinkModel): boolean {
    for (const link of graph.links) {
        for (const relation of iterateRelationsOf(link)) {
            if (equalLinks(relation, target)) {
                return true;
            }
        }
    }
    return false;
}
