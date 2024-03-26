import { makeMoveComparator, MoveDirection } from '../coreUtils/collections';
import { Events, EventSource, EventObserver, PropertyChange } from '../coreUtils/events';

import { MetadataApi } from '../data/metadataApi';
import { ValidationApi } from '../data/validationApi';
import { ElementModel, LinkModel, ElementIri, equalLinks } from '../data/model';

import { setElementData, setLinkData } from '../diagram/commands';
import { Element, Link } from '../diagram/elements';
import { Command } from '../diagram/history';

import { AsyncModel } from './asyncModel';
import {
    AuthoringState, AuthoringKind, AuthoringEvent, TemporaryState,
} from './authoringState';
import { ValidationState, changedElementsToValidate, validateElements } from './validation';

export type SelectionItem = Element | Link;

export interface EditorProps extends EditorOptions {
    readonly model: AsyncModel;
}

export interface EditorOptions {
    readonly validationApi?: ValidationApi;
}

export interface EditorEvents {
    changeMode: { source: EditorController };
    changeSelection: PropertyChange<EditorController, ReadonlyArray<SelectionItem>>;
    changeAuthoringState: PropertyChange<EditorController, AuthoringState>;
    changeValidationState: PropertyChange<EditorController, ValidationState>;
    changeTemporaryState: PropertyChange<EditorController, TemporaryState>;
}

export class EditorController {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<EditorEvents>();
    readonly events: Events<EditorEvents> = this.source;

    private readonly model: AsyncModel;
    private readonly options: EditorOptions;

    private _metadataApi: MetadataApi | undefined;
    private _authoringState = AuthoringState.empty;
    private _validationState = ValidationState.empty;
    private _temporaryState = TemporaryState.empty;
    private _selection: ReadonlyArray<SelectionItem> = [];

    private readonly cancellation = new AbortController();

    /** @hidden */
    constructor(props: EditorProps) {
        const {model, ...options} = props;
        this.model = model;
        this.options = options;

        this.listener.listen(this.model.events, 'changeCells', this.onCellsChanged);

        this.listener.listen(this.events, 'changeValidationState', e => {
            for (const element of this.model.elements) {
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
        this.listener.listen(this.events, 'changeSelection', () => {
            const selectedElements = this.selection
                .filter((cell): cell is Element => cell instanceof Element);
            this.bringElements(selectedElements, 'front');
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

    get selection() { return this._selection; }
    setSelection(value: ReadonlyArray<SelectionItem>) {
        const previous = this._selection;
        if (previous === value) { return; }
        this._selection = value;
        this.source.trigger('changeSelection', {source: this, previous});
    }

    cancelSelection() {
        this.setSelection([]);
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
        const itemsToRemove = this.selection;
        if (itemsToRemove.length === 0) { return; }

        this.cancelSelection();
        this.removeItems(itemsToRemove);
    }

    removeItems(items: ReadonlyArray<SelectionItem>) {
        const batch = this.model.history.startBatch();
        const deletedElementIris = new Set<ElementIri>();

        for (const item of items) {
            if (item instanceof Element) {
                const event = this.authoringState.elements.get(item.iri);
                if (event) {
                    this.discardChange(event);
                }
                this.model.removeElement(item.id);
                deletedElementIris.add(item.iri);
            } else if (item instanceof Link) {
                if (AuthoringState.isNewLink(this.authoringState, item.data)) {
                    this.deleteLink(item.data);
                }
            }
        }

        if (deletedElementIris.size > 0) {
            const newState = AuthoringState.deleteNewLinksConnectedToElements(this.authoringState, deletedElementIris);
            this.setAuthoringState(newState);
        }

        batch.store();
    }

    private onCellsChanged = () => {
        if (this.selection.length === 0) { return; }
        const newSelection = this.selection.filter(item =>
            item instanceof Element ? this.model.getElement(item.id) :
            item instanceof Link ? this.model.getLink(item.id) :
            false
        );
        if (newSelection.length < this.selection.length) {
            this.setSelection(newSelection);
        }
    };

    bringElements(elements: ReadonlyArray<Element>, to: 'front' | 'back') {
        if (elements.length === 0) { return; }
        this.model.reorderElements(makeMoveComparator(
            this.model.elements,
            elements,
            to === 'front' ? MoveDirection.ToEnd : MoveDirection.ToStart,
        ));
    }

    createNewEntity({elementModel, temporary}: { elementModel: ElementModel; temporary?: boolean }): Element {
        const batch = this.model.history.startBatch('Create new entity');

        const element = this.model.createElement(elementModel);
        element.setExpanded(true);

        if (temporary) {
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

    changeEntityData(targetIri: ElementIri, newData: ElementModel) {
        const elements = this.model.elements.filter(el => el.iri === targetIri);
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

    deleteEntity(elementIri: ElementIri) {
        const state = this.authoringState;
        const elements = this.model.elements.filter(el => el.iri === elementIri);
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
                if (link.data && AuthoringState.isNewLink(state, link.data)) {
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

    createNewLink(params: {
        link: Link;
        temporary?: boolean;
    }): Link {
        const {link: base, temporary} = params;
        const existingLink = this.model.findLink(base.typeId, base.sourceId, base.targetId);
        if (existingLink) {
            throw Error('The link already exists');
        }

        const batch = this.model.history.startBatch('Create new link');

        this.model.addLink(base);
        if (!temporary) {
            this.model.createLinks(base.data);
        }

        const links = this.model.links.filter(link => equalLinks(link.data, base.data));
        if (links.length > 0) {
            if (temporary) {
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

    changeLink(oldData: LinkModel, newData: LinkModel) {
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
                this.model.links
                    .filter(link => equalLinks(link.data, oldData))
                    .forEach(link => this.model.removeLink(link.id));
            }
            this.model.createLinks(newData);
            this.setAuthoringState(newState);
        }
        batch.store();
    }

    moveLinkSource(params: { link: Link; newSource: Element }): Link {
        const {link, newSource} = params;
        const batch = this.model.history.startBatch('Move link to another element');
        this.changeLink(link.data, {...link.data, sourceId: newSource.iri});
        const newLink = this.model.findLink(link.typeId, newSource.id, link.targetId)!;
        newLink.setVertices(link.vertices);
        batch.store();
        return newLink;
    }

    moveLinkTarget(params: { link: Link; newTarget: Element }): Link {
        const {link, newTarget} = params;
        const batch = this.model.history.startBatch('Move link to another element');
        this.changeLink(link.data, {...link.data, targetId: newTarget.iri});
        const newLink = this.model.findLink(link.typeId, link.sourceId, newTarget.id)!;
        newLink.setVertices(link.vertices);
        batch.store();
        return newLink;
    }

    deleteLink(model: LinkModel) {
        const state = this.authoringState;
        if (AuthoringState.isDeletedLink(state, model)) {
            return;
        }
        const batch = this.model.history.startBatch('Delete link');
        const newState = AuthoringState.deleteLink(state, model);
        if (AuthoringState.isNewLink(state, model)) {
            this.model.links
                .filter(({data}) => equalLinks(data, model))
                .forEach(link => this.model.removeLink(link.id));
        }
        this.setAuthoringState(newState);
        batch.store();
    }

    removeAllTemporaryCells() {
        const {temporaryState} = this;

        const cellsToRemove: Array<Element | Link> = [];
        if (temporaryState.elements.size > 0) {
            for (const element of this.model.elements) {
                if (temporaryState.elements.has(element.iri)) {
                    cellsToRemove.push(element);
                }
            }
        }
        if (temporaryState.links.size > 0) {
            for (const link of this.model.links) {
                if (temporaryState.links.has(link.data)) {
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
            if (cell instanceof Element) {
                if (temporaryState.elements.has(cell.iri)) {
                    nextTemporaryState = TemporaryState.deleteElement(nextTemporaryState, cell.data);
                    this.model.removeElement(cell.id);
                }
            } else if (cell instanceof Link) {
                if (temporaryState.links.has(cell.data)) {
                    nextTemporaryState = TemporaryState.deleteLink(nextTemporaryState, cell.data);
                    this.model.removeLink(cell.id);
                }
            }
        }

        batch.discard();
        this.setTemporaryState(nextTemporaryState);
    }

    discardChange(event: AuthoringEvent) {
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
                this.model.elements
                    .filter(el => el.iri === event.after.id)
                    .forEach(el => this.model.removeElement(el.id));
            }
        } else if (event.type === AuthoringKind.ChangeLink) {
            if (event.deleted) {
                /* nothing */
            } else if (event.before) {
                this.model.history.execute(
                    setLinkData(this.model, event.after, event.before)
                );
            } else {
                this.model.links
                    .filter(({data}) => equalLinks(data, event.after))
                    .forEach(link => this.model.removeLink(link.id));
            }
        }
        this.setAuthoringState(newState);
        batch.store();
    }
}
