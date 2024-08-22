import { makeMoveComparator, MoveDirection } from '../coreUtils/collections';
import { EventSource, Events, EventObserver, AnyEvent, PropertyChange } from '../coreUtils/events';

import { LinkTypeIri, isEncodedBlank } from '../data/model';
import * as Rdf from '../data/rdf/rdfModel';
import { getUriLocalName } from '../data/utils';

import { LabelLanguageSelector } from './customization';
import {
    Element, ElementEvents, Link, LinkEvents, LinkTypeVisibility,
} from './elements';
import { Graph, CellsChangedEvent } from './graph';
import { CommandHistory, Command } from './history';

export interface DiagramModelEvents {
    changeLanguage: PropertyChange<DiagramModel, string>;
    changeSelection: PropertyChange<DiagramModel, ReadonlyArray<Element | Link>>;
    changeCells: CellsChangedEvent;
    changeCellOrder: { readonly source: DiagramModel };
    elementEvent: AnyEvent<ElementEvents>;
    linkEvent: AnyEvent<LinkEvents>;
    changeLinkVisibility: PropertyChange<LinkTypeIri, LinkTypeVisibility>;
    discardGraph: { readonly source: DiagramModel };
}

export interface GraphStructure {
    /**
     * [RDF term factory](https://rdf.js.org/data-model-spec/#datafactory-interface)
     * to create RDF terms like IRIs, literals, etc.
     */
    get factory(): Rdf.DataFactory;
    /**
     * All elements on the diagram.
     */
    get elements(): ReadonlyArray<Element>;
    /**
     * All links between elements on the diagram.
     */
    get links(): ReadonlyArray<Link>;

    getElement(elementId: string): Element | undefined;
    getElementLinks(element: Element): ReadonlyArray<Link>;
    getLink(linkId: string): Link | undefined;
    findLink(linkTypeId: LinkTypeIri, sourceId: string, targetId: string): Link | undefined;
    sourceOf(link: Link): Element | undefined;
    targetOf(link: Link): Element | undefined;
    getLinkVisibility(linkTypeId: LinkTypeIri): LinkTypeVisibility;
    /**
     * Specifies whether a link should be displayed on a canvas at all.
     *
     * Note that the result is cached, so it should stay the same
     * unless the link is removed and re-added to the model.
     *
     * By default every link is rendered but this could be overridden
     * in a derived model.
     */
    shouldRenderLink(link: Link): boolean;
}

export interface DiagramModelOptions {
    history: CommandHistory,
    selectLabelLanguage?: LabelLanguageSelector;
}

export class DiagramModel implements GraphStructure {
    protected readonly source = new EventSource<DiagramModelEvents>();
    readonly events: Events<DiagramModelEvents> = this.source;

    private _language = 'en';
    private _selection: ReadonlyArray<Element | Link> = [];

    protected graph = new Graph();
    protected graphListener = new EventObserver();

    readonly history: CommandHistory;
    readonly locale: LocaleFormatter;

    constructor(options: DiagramModelOptions) {
        const {history, selectLabelLanguage = defaultSelectLabel} = options;
        this.history = history;
        this.locale = this.createLocale(selectLabelLanguage);
    }

    protected createLocale(selectLabelLanguage: LabelLanguageSelector): this['locale'] {
        return new DiagramLocaleFormatter(this, selectLabelLanguage);
    }

    get language(): string { return this._language; }
    setLanguage(value: string): void {
        if (!value) {
            throw new Error('Cannot set empty language.');
        }
        const previous = this._language;
        if (previous === value) { return; }
        this._language = value;
        this.source.trigger('changeLanguage', {source: this, previous});
    }

    get selection() { return this._selection; }
    setSelection(value: ReadonlyArray<Element | Link>) {
        const previous = this._selection;
        if (previous === value) { return; }

        // Bring selected elements to front before new selection is observed
        const selectedElements = value.filter((cell): cell is Element => cell instanceof Element);
        this.bringElements(selectedElements, 'front');

        this._selection = value;
        this.source.trigger('changeSelection', {source: this, previous});
    }

    get factory(): Rdf.DataFactory {
        return this.getTermFactory();
    }

    get elements(): ReadonlyArray<Element> {
        return this.graph.getElements();
    }

    get links(): ReadonlyArray<Link> {
        return this.graph.getLinks();
    }

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

    setLinkVisibility(linkTypeId: LinkTypeIri, value: LinkTypeVisibility): void {
        this.graph.setLinkVisibility(linkTypeId, value);
    }

    shouldRenderLink(link: Link): boolean {
        return true;
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

    reorderElements(compare: (a: Element, b: Element) => number): void {
        this.graph.reorderElements(compare);
        this.source.trigger('changeCellOrder', {source: this});
    }

    bringElements(targets: ReadonlyArray<Element>, to: 'front' | 'back') {
        if (targets.length === 0) {
            return;
        }
        this.reorderElements(makeMoveComparator(
            this.elements,
            targets,
            to === 'front' ? MoveDirection.ToEnd : MoveDirection.ToStart,
        ));
    }

    addElement(element: Element): void {
        this.history.execute(
            new AddElementCommand(this.graph, element, [])
        );
    }

    removeElement(elementId: string): void {
        const element = this.getElement(elementId);
        if (element) {
            this.history.execute(
                new RemoveElementCommand(this.graph, element)
            );
        }
    }

    addLink(link: Link): void {
        this.history.execute(new AddLinkCommand(this.graph, link));
    }

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

export interface LocaleFormatter {
    selectLabel(
        labels: ReadonlyArray<Rdf.Literal>,
        language?: string
    ): Rdf.Literal | undefined;

    formatLabel(
        labels: ReadonlyArray<Rdf.Literal> | undefined,
        fallbackIri: string,
        language?: string
    ): string;

    formatIri(iri: string): string;
}

export class DiagramLocaleFormatter implements LocaleFormatter {
    constructor(
        protected readonly model: DiagramModel,
        protected readonly selectLabelLanguage: LabelLanguageSelector
    ) {}

    selectLabel(
        labels: ReadonlyArray<Rdf.Literal>,
        language?: string
    ): Rdf.Literal | undefined {
        const targetLanguage = language ?? this.model.language;
        const {selectLabelLanguage} = this;
        return selectLabelLanguage(labels, targetLanguage);
    }

    formatLabel(
        labels: ReadonlyArray<Rdf.Literal> | undefined,
        fallbackIri: string,
        language?: string
    ): string {
        const label = labels ? this.selectLabel(labels, language) : undefined;
        return resolveLabel(label, fallbackIri);
    }

    formatIri(iri: string): string {
        if (isEncodedBlank(iri)) {
            return '(blank node)';
        }
        return `<${iri}>`;
    }
}

function defaultSelectLabel(
    texts: ReadonlyArray<Rdf.Literal>,
    language: string
): Rdf.Literal | undefined {
    if (texts.length === 0) { return undefined; }
    let defaultValue: Rdf.Literal | undefined;
    let englishValue: Rdf.Literal | undefined;
    for (const text of texts) {
        if (text.language === language) {
            return text;
        } else if (text.language === '') {
            defaultValue = text;
        } else if (text.language === 'en') {
            englishValue = text;
        }
    }
    return (
        defaultValue !== undefined ? defaultValue :
        englishValue !== undefined ? englishValue :
        texts[0]
    );
}

function resolveLabel(label: Rdf.Literal | undefined, fallbackIri: string): string {
    if (label) { return label.value; }
    return getUriLocalName(fallbackIri) || fallbackIri;
}
