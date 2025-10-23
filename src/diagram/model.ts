import { moveComparator } from '../coreUtils/collections';
import { EventSource, Events, EventObserver, AnyEvent, PropertyChange } from '../coreUtils/events';
import { Translation } from '../coreUtils/i18n';

import { LinkTypeIri } from '../data/model';
import * as Rdf from '../data/rdf/rdfModel';

import {
    Element, ElementEvents, Link, LinkEvents, LinkTypeVisibility,
} from './elements';
import { Graph, CellsChangedEvent } from './graph';
import { CommandHistory, Command } from './history';

/**
 * Event data for {@link DiagramModel} events.
 *
 * @see {@link DiagramModel}
 */
export interface DiagramModelEvents {
    /**
     * Triggered on {@link DiagramModel.language} property change.
     */
    changeLanguage: PropertyChange<DiagramModel, string>;
    /**
     * Triggered on {@link DiagramModel.selection} property change.
     */
    changeSelection: PropertyChange<DiagramModel, ReadonlyArray<Element | Link>>;
    /**
     * Triggered when some elements and/or links were added or removed.
     */
    changeCells: CellsChangedEvent;
    /**
     * Triggered when diagram cells were re-ordered.
     */
    changeCellOrder: { readonly source: DiagramModel };
    /**
     * Triggered on any event from an element in the graph.
     */
    elementEvent: AnyEvent<ElementEvents>;
    /**
     * Triggered on any event from a link in the graph.
     */
    linkEvent: AnyEvent<LinkEvents>;
    /**
     * Triggered when visibility mode changes for a link type.
     */
    changeLinkVisibility: PropertyChange<LinkTypeIri, LinkTypeVisibility>;
    /**
     * Triggered when the graph is reset and any related state (i.e. a cache)
     * should be discarded, active operations cancelled.
     */
    discardGraph: { readonly source: DiagramModel };
}

/**
 * Provides graph content: elements and connected links.
 *
 * @category Core
 */
export interface GraphStructure {
    /**
     * Provides an [RDF term factory](https://rdf.js.org/data-model-spec/#datafactory-interface)
     * to create RDF terms for identifiers and property values.
     */
    get factory(): Rdf.DataFactory;
    /**
     * Graph content (elements and links) version number which changes on every cell change
     * (when element or link added/removed/reordered, see {@link DiagramModelEvents.changeCells}).
     */
    get cellsVersion(): number;
    /**
     * All elements (nodes) in the graph.
     */
    get elements(): ReadonlyArray<Element>;
    /**
     * All links (edges) between elements in the graph.
     */
    get links(): ReadonlyArray<Link>;
    /**
     * Gets an element by its {@link Element.id} in the graph if exists.
     */
    getElement(elementId: string): Element | undefined;
    /**
     * Gets all links connected to the specified element in the graph.
     *
     * If element is not in the graph, no links would be returned.
     */
    getElementLinks(element: Element): ReadonlyArray<Link>;
    /**
     * Gets a link by its {@link Link.id} in the graph if exists.
     */
    getLink(linkId: string): Link | undefined;
    /**
     * Searches for any link of the specified type between elements with
     * specified IDs in the graph if exists.
     *
     * If multiple links is found, any of them could be returned.
     */
    findLink(linkTypeId: LinkTypeIri, sourceId: string, targetId: string): Link | undefined;
    /**
     * Gets a source element for the specified `link` in the graph.
     *
     * If link is not in the graph, `undefined` would be returned instead.
     */
    sourceOf(link: Link): Element | undefined;
    /**
     * Gets a target element for the specified `link` in the graph.
     *
     * If link is not in the graph, `undefined` would be returned instead.
     */
    targetOf(link: Link): Element | undefined;
    /**
     * Gets current visibility mode for the specified link type.
     */
    getLinkVisibility(linkTypeId: LinkTypeIri): LinkTypeVisibility;
}

/** @hidden */
export interface DiagramModelOptions {
    history: CommandHistory;
    translation: Translation;
}

/**
 * Stores the diagram content: graph (elements, links);
 * maintains selection and the current language to display the data.
 *
 * Additionally, the diagram model provides the means to undo/redo commands
 * via {@link DiagramModel.history history}.
 *
 * @category Core
 */
export class DiagramModel implements GraphStructure {
    /**
     * Event source to trigger events.
     */
    protected readonly source = new EventSource<DiagramModelEvents>();
    /**
     * Events for the diagram model.
     */
    readonly events: Events<DiagramModelEvents> = this.source;

    private _language = 'en';
    private _selection: ReadonlyArray<Element | Link> = [];

    protected graph = new Graph();
    protected graphListener = new EventObserver();

    /**
     * Provides the mechanism to undo/redo commands on the diagram.
     */
    readonly history: CommandHistory;

    /** @hidden */
    constructor(options: DiagramModelOptions) {
        const {history} = options;
        this.history = history;
    }

    /**
     * Current language for the diagram content.
     *
     * Language code is specified as lowercase [BCP47](https://www.rfc-editor.org/rfc/rfc5646)
     * string (examples: `en`, `en-gb`, etc).
     *
     * Initial language is `en`.
     */
    get language(): string { return this._language; }
    /**
     * Sets current language for the diagram content.
     *
     * Language code is specified as lowercase [BCP47](https://www.rfc-editor.org/rfc/rfc5646)
     * string (examples: `en`, `en-gb`, etc).
     */
    setLanguage(value: string): void {
        if (!value) {
            throw new Error('Cannot set empty language.');
        }
        const previous = this._language;
        if (previous === value) { return; }
        this._language = value;
        this.source.trigger('changeLanguage', {source: this, previous});
    }

    /**
     * Current diagram selection (elements and/or links).
     */
    get selection() { return this._selection; }
    /**
     * Sets current diagram selection (elements and/or links).
     *
     * When called, selected cells will be brought to the front
     * before all other diagram cells.
     */
    setSelection(value: ReadonlyArray<Element | Link>) {
        const previous = this._selection;
        if (previous === value) { return; }

        const nextSelection = Array.from(value);
        // Bring selected elements to front before new selection is observed
        const selectedElements = nextSelection
            .filter((cell): cell is Element => cell instanceof Element);
        this.bringElements(selectedElements, 'front');

        this._selection = nextSelection;
        this.source.trigger('changeSelection', {source: this, previous});
    }

    get factory(): Rdf.DataFactory {
        return this.getTermFactory();
    }

    get cellsVersion(): number {
        return this.graph.getCellsVersion();
    }

    get elements(): ReadonlyArray<Element> {
        return this.graph.getElements();
    }

    get links(): ReadonlyArray<Link> {
        return this.graph.getLinks();
    }

    /**
     * Provides RDF term factory for the diagram model.
     */
    protected getTermFactory(): Rdf.DataFactory {
        return Rdf.DefaultDataFactory;
    }

    getElement(elementId: string): Element | undefined {
        return this.graph.getElement(elementId);
    }

    getElementLinks(element: Element): ReadonlyArray<Link> {
        return this.graph.getElementLinks(element);
    }

    getLink(linkId: string): Link | undefined {
        return this.graph.getLink(linkId);
    }

    findLink(linkTypeId: LinkTypeIri, sourceId: string, targetId: string): Link | undefined {
        for (const link of this.graph.iterateLinks(sourceId, targetId, linkTypeId)) {
            return link;
        }
        return undefined;
    }

    sourceOf(link: Link): Element | undefined {
        return this.getElement(link.sourceId);
    }

    targetOf(link: Link): Element | undefined {
        return this.getElement(link.targetId);
    }

    getLinkVisibility(linkTypeId: LinkTypeIri): LinkTypeVisibility {
        return this.graph.getLinkVisibility(linkTypeId);
    }

    /**
     * Sets current visibility mode for the specified link type.
     */
    setLinkVisibility(linkTypeId: LinkTypeIri, value: LinkTypeVisibility): void {
        this.graph.setLinkVisibility(linkTypeId, value);
    }

    protected resetGraph(): void {
        if (this.graphListener) {
            this.graphListener.stopListening();
            this.graphListener = new EventObserver();
        }
        this.graph = new Graph();
        this._selection = [];
        this.source.trigger('discardGraph', {source: this});
    }

    protected subscribeGraph(): void {
        this.graphListener.listen(this.graph.events, 'changeCells', e => {
            this.triggerChangeCells(e);
        });
        this.graphListener.listen(this.graph.events, 'elementEvent', e => {
            this.triggerElementEvent(e);
        });
        this.graphListener.listen(this.graph.events, 'linkEvent', e => {
            this.triggerLinkEvent(e);
        });
        this.graphListener.listen(this.graph.events, 'changeLinkVisibility', e => {
            this.source.trigger('changeLinkVisibility', e);
        });

        this.triggerChangeCells({updateAll: true});
    }

    protected triggerChangeCells(e: CellsChangedEvent): void {
        if (this.selection.length > 0) {
            const newSelection = this.selection.filter(item =>
                item instanceof Element ? this.getElement(item.id) :
                item instanceof Link ? this.getLink(item.id) :
                false
            );
            if (newSelection.length < this.selection.length) {
                this.setSelection(newSelection);
            }
        }

        this.source.trigger('changeCells', e);
    }

    protected triggerElementEvent(e: AnyEvent<ElementEvents>): void {
        this.source.trigger('elementEvent', e);
    }

    protected triggerLinkEvent(e: AnyEvent<LinkEvents>): void {
        this.source.trigger('linkEvent', e);
    }

    /**
     * Changes display order of elements on the diagram.
     *
     * @param compare Sort comparator to establish a particular ordering
     */
    reorderElements(compare: (a: Element, b: Element) => number): void {
        this.graph.reorderElements(compare);
        this.source.trigger('changeCellOrder', {source: this});
    }

    /**
     * Puts specified elements before or after all other in the display order.
     */
    bringElements(targets: ReadonlyArray<Element>, to: 'front' | 'back') {
        if (targets.length === 0) {
            return;
        }
        this.reorderElements(moveComparator(
            this.elements,
            targets,
            to === 'front' ? 'end' : 'start',
        ));
    }

    /**
     * Adds the element to the diagram.
     *
     * Throws an error if element with the same {@link Element.id} already exists
     * in the graph.
     *
     * The operation puts a command to the {@link DiagramModel.history command history}.
     */
    addElement(element: Element): void {
        this.history.execute(
            new AddElementCommand(this.graph, element, [])
        );
    }

    /**
     * Removes the element with specified ID from the diagram if exists.
     *
     * When element is removed, all connected links will be removed as well.
     *
     * The operation puts a command to the {@link DiagramModel.history command history}.
     */
    removeElement(elementId: string): void {
        const element = this.getElement(elementId);
        if (element) {
            this.history.execute(
                new RemoveElementCommand(this.graph, element)
            );
        }
    }

    /**
     * Adds the link to the diagram.
     *
     * Throws an error if link with the same {@link Link.id} already exists
     * in the graph or any of source or target is not in the graph.
     *
     * The operation puts a command to the {@link DiagramModel.history command history}.
     */
    addLink(link: Link): void {
        this.history.execute(new AddLinkCommand(this.graph, link));
    }

    /**
     * Removes the link with specified ID from the diagram if exists.
     *
     * The operation puts a command to the {@link DiagramModel.history command history}.
     */
    removeLink(linkId: string): void {
        const link = this.graph.getLink(linkId);
        if (link) {
            this.history.execute(new RemoveLinkCommand(this.graph, link));
        }
    }
}

class AddElementCommand implements Command {
    constructor(
        readonly graph: Graph,
        readonly element: Element,
        readonly connectedLinks: ReadonlyArray<Link>
    ) {}

    get title(): string {
        return 'Add element';
    }

    invoke(): Command {
        const {graph, element, connectedLinks} = this;
        graph.addElement(element);
        for (const link of connectedLinks) {
            const existing = graph.getLink(link.id);
            if (!existing) {
                graph.addLink(link);
            }
        }
        return new RemoveElementCommand(graph, element);
    }
}

class RemoveElementCommand implements Command {
    constructor(
        readonly graph: Graph,
        readonly element: Element
    ) {}

    get title(): string {
        return 'Remove element';
    }

    invoke(): Command {
        const {graph, element} = this;
        const connectedLinks = [...graph.getElementLinks(element)];
        graph.removeElement(element.id);
        return new AddElementCommand(graph, element, connectedLinks);
    }
}

class AddLinkCommand implements Command {
    constructor(
        readonly graph: Graph,
        readonly link: Link
    ) {}

    get title(): string {
        return 'Add link';
    }

    invoke(): Command {
        const {graph, link} = this;
        graph.addLink(link);
        return new RemoveLinkCommand(graph, link);
    }
}

class RemoveLinkCommand implements Command {
    constructor(
        readonly graph: Graph,
        readonly link: Link
    ) {}

    get title(): string {
        return 'Remove link';
    }

    invoke(): Command {
        const {graph, link} = this;
        graph.removeLink(link.id);
        return new AddLinkCommand(graph, link);
    }
}
