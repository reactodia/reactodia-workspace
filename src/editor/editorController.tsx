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
import { EntityElement, RelationLink, setElementData, setLinkData } from './dataElements';
import { ValidationState, changedElementsToValidate, validateElements } from './validation';

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
        const deletedElementIris = new Set<ElementIri>();

        for (const item of items) {
            if (item instanceof Element) {
                if (item instanceof EntityElement) {
                    const event = this.authoringState.elements.get(item.iri);
                    if (event) {
                        this.discardChange(event);
                    }
                    deletedElementIris.add(item.iri);
                }
                this.model.removeElement(item.id);
            } else if (item instanceof Link) {
                if (item instanceof RelationLink && AuthoringState.isNewLink(this.authoringState, item.data)) {
                    this.deleteRelation(item.data);
                }
            }
        }

        if (deletedElementIris.size > 0) {
            const newState = AuthoringState.deleteNewLinksConnectedToElements(this.authoringState, deletedElementIris);
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
        if (elements.length === 0) {
            return;
        }
        const oldData = elements[0].data;
        const batch = this.model.history.startBatch('Edit entity');

        const newState = AuthoringState.changeElement(this._authoringState, oldData, newData);
        // get created authoring event by either old or new IRI (in case of new entities)
        const event = newState.elements.get(targetIri) || newState.elements.get(newData.id);
        this.model.history.execute(setElementData(this.model, targetIri, event!.after));
        this.setAuthoringState(newState);

        batch.store();
    }

    deleteEntity(elementIri: ElementIri): void {
        const state = this.authoringState;
        const elements = findEntities(this.model, elementIri);
        if (elements.length === 0) {
            return;
        }

        const batch = this.model.history.startBatch('Delete entity');
        const model = elements[0].data;

        const event = state.elements.get(elementIri);
        // remove new connected links
        const linksToRemove = new Set<string>();
        for (const element of elements) {
            for (const link of this.model.getElementLinks(element)) {
                if (link instanceof RelationLink && AuthoringState.isNewLink(state, link.data)) {
                    linksToRemove.add(link.id);
                }
            }
        }
        linksToRemove.forEach(linkId => this.model.removeLink(linkId));

        if (event) {
            this.discardChange(event);
        }
        this.setAuthoringState(AuthoringState.deleteElement(state, model));
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

        const links = findRelations(this.model, base.data);
        if (links.length > 0) {
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
            this.model.history.execute(setLinkData(this.model, oldData, newData));
            this.setAuthoringState(
                AuthoringState.changeLink(this._authoringState, oldData, newData)
            );
        } else {
            let newState = this._authoringState;
            newState = AuthoringState.deleteLink(newState, oldData);
            newState = AuthoringState.addLink(newState, newData);

            if (AuthoringState.isNewLink(this._authoringState, oldData)) {
                for (const link of findRelations(this.model, oldData)) {
                    this.model.removeLink(link.id);
                }
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
            for (const link of findRelations(this.model, model)) {
                this.model.removeLink(link.id);
            }
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
                    setElementData(this.model, event.after.id, event.before)
                );
            } else {
                for (const element of findEntities(this.model, event.after.id)) {
                    this.model.removeElement(element.id);
                }
            }
        } else if (event.type === AuthoringKind.ChangeLink) {
            if (event.deleted) {
                /* nothing */
            } else if (event.before) {
                this.model.history.execute(
                    setLinkData(this.model, event.after, event.before)
                );
            } else {
                for (const link of findRelations(this.model, event.after)) {
                    this.model.removeLink(link.id);
                }
            }
        }
        this.setAuthoringState(newState);
        batch.store();
    }
}

function findEntities(graph: GraphStructure, iri: ElementIri): EntityElement[] {
    return graph.elements.filter(
        (el): el is EntityElement => el instanceof EntityElement && el.iri === iri
    );
}

function findRelations(graph: GraphStructure, target: LinkModel): RelationLink[] {
    return graph.links.filter((link): link is RelationLink =>
        link instanceof RelationLink && equalLinks(link.data, target)
    );
}
