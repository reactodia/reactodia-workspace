import { EventSource, Events, EventObserver, AnyEvent, PropertyChange } from '../coreUtils/events';

import {
    ElementModel, ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri, isEncodedBlank,
} from '../data/model';
import * as Rdf from '../data/rdf/rdfModel';
import { getUriLocalName } from '../data/utils';

import { LabelLanguageSelector, FormattedProperty } from './customization';
import {
    Element, ElementEvents, Link, LinkEvents, LinkType, LinkTypeEvents,
    ElementType, ElementTypeEvents, PropertyType, PropertyTypeEvents,
} from './elements';
import { Graph, CellsChangedEvent } from './graph';
import { CommandHistory, Command } from './history';

export interface DiagramModelEvents {
    changeLanguage: PropertyChange<DiagramModel, string>;
    changeCells: CellsChangedEvent;
    changeCellOrder: { readonly source: DiagramModel };
    elementEvent: AnyEvent<ElementEvents>;
    linkEvent: AnyEvent<LinkEvents>;
    elementTypeEvent: AnyEvent<ElementTypeEvents>;
    linkTypeEvent: AnyEvent<LinkTypeEvents>;
    propertyTypeEvent: AnyEvent<PropertyTypeEvents>;
    discardGraph: { readonly source: DiagramModel };
}

export interface GraphStructure {
    get factory(): Rdf.DataFactory;
    get elements(): ReadonlyArray<Element>;
    get links(): ReadonlyArray<Link>;

    getElement(elementId: string): Element | undefined;
    getElementLinks(element: Element): ReadonlyArray<Link>;
    getLink(linkId: string): Link | undefined;
    findLink(linkTypeId: LinkTypeIri, sourceId: string, targetId: string): Link | undefined;
    sourceOf(link: Link): Element | undefined;
    targetOf(link: Link): Element | undefined;

    getElementType(elementTypeIri: ElementTypeIri): ElementType | undefined;
    getLinkType(linkTypeIri: LinkTypeIri): LinkType | undefined;
    getPropertyType(propertyTypeIri: PropertyTypeIri): PropertyType | undefined;
}

export interface DiagramModelOptions {
    history: CommandHistory,
    selectLabelLanguage?: LabelLanguageSelector;
}

export class DiagramModel implements GraphStructure {
    protected readonly source = new EventSource<DiagramModelEvents>();
    readonly events: Events<DiagramModelEvents> = this.source;

    private _language = 'en';

    protected graph = new Graph();
    protected graphListener = new EventObserver();

    readonly history: CommandHistory;
    readonly locale: LocaleFormatter;

    constructor(options: DiagramModelOptions) {
        const {history, selectLabelLanguage = defaultSelectLabel} = options;
        this.history = history;
        this.locale = new ModelLocalFormatter(this, selectLabelLanguage);
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

    get factory(): Rdf.DataFactory {
        return this.getTermFactory();
    }

    get elements() { return this.graph.getElements(); }
    get links() { return this.graph.getLinks(); }

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
        return this.graph.findLink(linkTypeId, sourceId, targetId);
    }

    sourceOf(link: Link): Element | undefined {
        return this.getElement(link.sourceId);
    }

    targetOf(link: Link): Element | undefined {
        return this.getElement(link.targetId);
    }

    protected resetGraph(): void {
        if (this.graphListener) {
            this.graphListener.stopListening();
            this.graphListener = new EventObserver();
        }
        this.graph = new Graph();
        this.source.trigger('discardGraph', {source: this});
    }

    protected subscribeGraph(): void {
        this.graphListener.listen(this.graph.events, 'changeCells', e => {
            this.source.trigger('changeCells', e);
        });
        this.graphListener.listen(this.graph.events, 'elementEvent', e => {
            this.source.trigger('elementEvent', e);
        });
        this.graphListener.listen(this.graph.events, 'linkEvent', e => {
            this.source.trigger('linkEvent', e);
        });
        this.graphListener.listen(this.graph.events, 'elementTypeEvent', e => {
            this.source.trigger('elementTypeEvent', e);
        });
        this.graphListener.listen(this.graph.events, 'linkTypeEvent', e => {
            this.source.trigger('linkTypeEvent', e);
        });
        this.graphListener.listen(this.graph.events, 'propertyTypeEvent', e => {
            this.source.trigger('propertyTypeEvent', e);
        });

        this.source.trigger('changeCells', {updateAll: true});
    }

    reorderElements(compare: (a: Element, b: Element) => number): void {
        this.graph.reorderElements(compare);
        this.source.trigger('changeCellOrder', {source: this});
    }

    createElement(elementIriOrModel: ElementIri | ElementModel): Element {
        const elementIri = typeof elementIriOrModel === 'string'
            ? elementIriOrModel : (elementIriOrModel as ElementModel).id;

        const elements = this.elements.filter(el => el.iri === elementIri);
        if (elements.length > 0) {
            // usually there should be only one element
            return elements[0];
        }

        let data = typeof elementIriOrModel === 'string'
            ? Element.placeholderData(elementIri)
            : elementIriOrModel as ElementModel;
        data = {...data, id: data.id};
        const element = new Element({data});
        this.addElement(element);
        return element;
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

    createLink(link: Link): Link {
        const {typeId, sourceId, targetId, data} = link;
        const existingLink = this.findLink(typeId, sourceId, targetId);
        if (existingLink) {
            if (link.data) {
                existingLink.setLayoutOnly(false);
                existingLink.setData(data);
            }
            return existingLink;
        }

        this.addLink(link);
        return link;
    }

    addLink(link: Link): void {
        if (link.data.linkTypeId !== link.typeId) {
            throw new Error('link.data.linkTypeId must match link.typeId');
        }
        this.createLinkType(link.typeId);
        this.history.execute(new AddLinkCommand(this.graph, link));
    }

    removeLink(linkId: string): void {
        const link = this.graph.getLink(linkId);
        if (link) {
            this.history.execute(new RemoveLinkCommand(this.graph, link));
        }
    }

    getElementType(elementTypeIri: ElementTypeIri): ElementType | undefined {
        return this.graph.getElementType(elementTypeIri);
    }

    createElementType(elementTypeIri: ElementTypeIri): ElementType {
        const existing = this.graph.getElementType(elementTypeIri);
        if (existing) {
            return existing;
        }
        const classModel = new ElementType({id: elementTypeIri});
        this.addElementType(classModel);
        return classModel;
    }

    addElementType(model: ElementType): void {
        this.graph.addElementType(model);
    }

    getLinkType(linkTypeIri: LinkTypeIri): LinkType | undefined {
        return this.graph.getLinkType(linkTypeIri);
    }

    createLinkType(linkTypeIri: LinkTypeIri): LinkType {
        const existing = this.graph.getLinkType(linkTypeIri);
        if (existing) {
            return existing;
        }
        const linkType = new LinkType({id: linkTypeIri});
        this.graph.addLinkType(linkType);
        return linkType;
    }

    getPropertyType(propertyTypeIri: PropertyTypeIri): PropertyType | undefined {
        return this.graph.getPropertyType(propertyTypeIri);
    }

    createPropertyType(propertyIri: PropertyTypeIri): PropertyType {
        const existing = this.graph.getPropertyType(propertyIri);
        if (existing) {
            return existing;
        }
        const property = new PropertyType({id: propertyIri});
        this.graph.addPropertyType(property);
        return property;
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
            const existing = graph.getLink(link.id) || graph.findLink(link.typeId, link.sourceId, link.targetId);
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
        labels: ReadonlyArray<Rdf.Literal>,
        fallbackIri: string,
        language?: string
    ): string;

    formatIri(iri: string): string;

    formatElementTypes(
        types: ReadonlyArray<ElementTypeIri>,
        language?: string
    ): string[];

    formatPropertyList(
        properties: { readonly [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> },
        language?: string
    ): FormattedProperty[];
}

class ModelLocalFormatter implements LocaleFormatter {
    constructor(
        private readonly model: DiagramModel,
        private readonly selectLabelLanguage: LabelLanguageSelector
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
        labels: ReadonlyArray<Rdf.Literal>,
        fallbackIri: string,
        language?: string
    ): string {
        const label = this.selectLabel(labels, language);
        return resolveLabel(label, fallbackIri);
    }

    formatIri(iri: string): string {
        if (isEncodedBlank(iri)) {
            return '(blank node)';
        }
        return `<${iri}>`;
    }

    formatElementTypes(
        types: ReadonlyArray<ElementTypeIri>,
        language?: string
    ): string[] {
        return types.map(typeId => {
            const type = this.model.createElementType(typeId);
            return this.formatLabel(type.label, type.id, language);
        }).sort();
    }

    formatPropertyList(
        properties: { readonly [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> },
        language?: string
    ): FormattedProperty[] {
        const targetLanguage = language ?? this.model.language;
        const propertyIris = Object.keys(properties) as PropertyTypeIri[];
        const propertyList = propertyIris.map((key): FormattedProperty => {
            const property = this.model.createPropertyType(key);
            const label = this.formatLabel(property.label, key);
            const allValues = properties[key];
            const localizedValues = allValues.filter(v =>
                v.termType === 'NamedNode' ||
                v.language === '' ||
                v.language === targetLanguage
            );
            return {
                propertyId: key,
                label,
                values: localizedValues.length === 0 ? allValues : localizedValues,
            };
        });
        propertyList.sort((a, b) => a.label.localeCompare(b.label));
        return propertyList;
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
