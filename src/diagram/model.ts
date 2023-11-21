import { EventSource, Events, EventObserver, AnyEvent } from '../coreUtils/events';

import {
    ElementModel, ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri,
} from '../data/model';
import * as Rdf from '../data/rdf/rdfModel';
import { GenerateID } from '../data/schema';

import {
    Element, ElementEvents, Link, LinkEvents, RichLinkType, RichLinkTypeEvents,
    RichElementType, RichElementTypeEvents, RichProperty,
} from './elements';
import { Graph, CellsChangedEvent } from './graph';
import { CommandHistory, Command } from './history';

export interface DiagramModelEvents {
    changeCells: CellsChangedEvent;
    changeCellOrder: { readonly source: DiagramModel };
    elementEvent: AnyEvent<ElementEvents>;
    linkEvent: AnyEvent<LinkEvents>;
    linkTypeEvent: AnyEvent<RichLinkTypeEvents>;
    classEvent: AnyEvent<RichElementTypeEvents>;
    changeGroupContent: {
        readonly group: string;
        readonly layoutComplete: boolean;
    };
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

    getElementType(elementTypeIri: ElementTypeIri): RichElementType | undefined;
    getLinkType(linkTypeIri: LinkTypeIri): RichLinkType | undefined;
    getProperty(propertyTypeIri: PropertyTypeIri): RichProperty | undefined;
}

/**
 * Model of diagram.
 */
export class DiagramModel implements GraphStructure {
    protected readonly source = new EventSource<DiagramModelEvents>();
    readonly events: Events<DiagramModelEvents> = this.source;

    protected graph = new Graph();
    protected graphListener = new EventObserver();

    constructor(
        readonly history: CommandHistory,
    ) {}

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

    sourceOf(link: Link) {
        return this.getElement(link.sourceId);
    }

    targetOf(link: Link) {
        return this.getElement(link.targetId);
    }

    resetGraph() {
        if (this.graphListener) {
            this.graphListener.stopListening();
            this.graphListener = new EventObserver();
        }
        this.graph = new Graph();
    }

    subscribeGraph() {
        this.graphListener.listen(this.graph.events, 'changeCells', e => {
            this.source.trigger('changeCells', e);
        });
        this.graphListener.listen(this.graph.events, 'elementEvent', e => {
            this.source.trigger('elementEvent', e);
        });
        this.graphListener.listen(this.graph.events, 'linkEvent', e => {
            this.source.trigger('linkEvent', e);
        });
        this.graphListener.listen(this.graph.events, 'linkTypeEvent', e => {
            this.source.trigger('linkTypeEvent', e);
        });
        this.graphListener.listen(this.graph.events, 'classEvent', e => {
            this.source.trigger('classEvent', e);
        });

        this.source.trigger('changeCells', {updateAll: true});
    }

    reorderElements(compare: (a: Element, b: Element) => number) {
        this.graph.reorderElements(compare);
        this.source.trigger('changeCellOrder', {source: this});
    }

    createElement(elementIriOrModel: ElementIri | ElementModel, group?: string): Element {
        const elementIri = typeof elementIriOrModel === 'string'
            ? elementIriOrModel : (elementIriOrModel as ElementModel).id;

        const elements = this.elements.filter(el => el.iri === elementIri && el.group === group);
        if (elements.length > 0) {
            // usually there should be only one element
            return elements[0];
        }

        let data = typeof elementIriOrModel === 'string'
            ? placeholderDataFromIri(elementIri)
            : elementIriOrModel as ElementModel;
        data = {...data, id: data.id};
        const element = new Element({id: GenerateID.forElement(), data, group});
        this.addElement(element);
        return element;
    }

    addElement(element: Element): void {
        this.history.execute(
            new AddElementCommand(this.graph, element, [])
        );
    }

    removeElement(elementId: string) {
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

    removeLink(linkId: string) {
        const link = this.graph.getLink(linkId);
        if (link) {
            this.history.execute(new RemoveLinkCommand(this.graph, link));
        }
    }

    getElementType(elementTypeIri: ElementTypeIri): RichElementType | undefined {
        return this.graph.getClass(elementTypeIri);
    }

    createElementType(elementTypeIri: ElementTypeIri): RichElementType {
        const existing = this.graph.getClass(elementTypeIri);
        if (existing) {
            return existing;
        }
        const classModel = new RichElementType({id: elementTypeIri});
        this.addElementType(classModel);
        return classModel;
    }

    addElementType(model: RichElementType) {
        this.graph.addClass(model);
    }

    getLinkType(linkTypeIri: LinkTypeIri): RichLinkType | undefined {
        return this.graph.getLinkType(linkTypeIri);
    }

    createLinkType(linkTypeIri: LinkTypeIri): RichLinkType {
        const existing = this.graph.getLinkType(linkTypeIri);
        if (existing) {
            return existing;
        }
        const linkType = new RichLinkType({id: linkTypeIri});
        this.graph.addLinkType(linkType);
        return linkType;
    }

    getProperty(propertyTypeIri: PropertyTypeIri): RichProperty | undefined {
        return this.graph.getProperty(propertyTypeIri);
    }

    createProperty(propertyIri: PropertyTypeIri): RichProperty {
        const existing = this.graph.getProperty(propertyIri);
        if (existing) {
            return existing;
        }
        const property = new RichProperty({id: propertyIri});
        this.graph.addProperty(property);
        return property;
    }

    triggerChangeGroupContent(group: string, options: { layoutComplete: boolean }) {
        const {layoutComplete} = options;
        this.source.trigger('changeGroupContent', {group, layoutComplete});
    }

    createTemporaryElement(): Element {
        const target = new Element({
            id: GenerateID.forElement(),
            data: placeholderDataFromIri('' as ElementIri),
            temporary: true,
        });

        this.graph.addElement(target);

        return target;
    }
}

export function placeholderDataFromIri(iri: ElementIri): ElementModel {
    return {
        id: iri,
        types: [],
        label: [],
        properties: {},
    };
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
