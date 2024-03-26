import { OrderedMap } from '../coreUtils/collections';
import { EventSource, Events, AnyEvent, AnyListener } from '../coreUtils/events';

import { ElementTypeIri, LinkTypeIri, PropertyTypeIri } from '../data/model';

import {
    Element, ElementEvents, Link, LinkEvents, LinkType, LinkTypeEvents,
    ElementType, ElementTypeEvents, PropertyType, PropertyTypeEvents,
} from './elements';

export interface GraphEvents {
    changeCells: CellsChangedEvent;
    elementEvent: AnyEvent<ElementEvents>;
    linkEvent: AnyEvent<LinkEvents>;
    elementTypeEvent: AnyEvent<ElementTypeEvents>;
    linkTypeEvent: AnyEvent<LinkTypeEvents>;
    propertyTypeEvent: AnyEvent<PropertyTypeEvents>;
}

export interface CellsChangedEvent {
    readonly updateAll: boolean;
    readonly changedElement?: Element;
    readonly changedLinks?: ReadonlyArray<Link>;
}

export class Graph {
    private readonly source = new EventSource<GraphEvents>();
    readonly events: Events<GraphEvents> = this.source;

    private readonly elements = new OrderedMap<Element>();
    private readonly links = new OrderedMap<Link>();
    private readonly elementLinks = new WeakMap<Element, Link[]>();

    private readonly classesById = new Map<ElementTypeIri, ElementType>();
    private readonly propertiesById = new Map<PropertyTypeIri, PropertyType>();

    private linkTypes = new Map<LinkTypeIri, LinkType>();
    private static nextLinkTypeIndex = 0;

    getElements() { return this.elements.items; }
    getLinks() { return this.links.items; }

    getLink(linkId: string): Link | undefined {
        return this.links.get(linkId);
    }

    getElementLinks(element: Element): ReadonlyArray<Link> {
        return this.elementLinks.get(element) ?? [];
    }

    findLink(linkTypeId: LinkTypeIri, sourceId: string, targetId: string): Link | undefined {
        const source = this.getElement(sourceId);
        if (!source) { return undefined; }
        const links = this.elementLinks.get(source);
        if (links) {
            const index = findLinkIndex(links, linkTypeId, sourceId, targetId);
            return index >= 0 ? links[index] : undefined;
        }
    }

    sourceOf(link: Link) {
        return this.getElement(link.sourceId);
    }

    targetOf(link: Link) {
        return this.getElement(link.targetId);
    }

    reorderElements(compare: (a: Element, b: Element) => number) {
        this.elements.reorder(compare);
    }

    getElement(elementId: string): Element | undefined {
        return this.elements.get(elementId);
    }

    addElement(element: Element): void {
        if (this.getElement(element.id)) {
            throw new Error(`Element '${element.id}' already exists.`);
        }
        element.events.onAny(this.onElementEvent);
        this.elements.push(element.id, element);
        this.source.trigger('changeCells', {updateAll: false, changedElement: element});
    }

    private onElementEvent: AnyListener<ElementEvents> = (data) => {
        this.source.trigger('elementEvent', {data});
    };

    removeElement(elementId: string): void {
        const element = this.elements.get(elementId);
        if (element) {
            const options = {silent: true};
            // clone links to prevent modifications during iteration
            const changedLinks = [...this.getElementLinks(element)];
            for (const link of changedLinks) {
                this.removeLink(link.id, options);
            }
            this.elements.delete(elementId);
            element.events.offAny(this.onElementEvent);
            this.source.trigger('changeCells', {updateAll: false, changedElement: element, changedLinks});
        }
    }

    addLink(link: Link): void {
        if (this.getLink(link.id)) {
            throw new Error(`Link already exists: ${link.id}`);
        }
        const linkType = this.getLinkType(link.typeId);
        if (!linkType) {
            throw new Error(`Link type not found: ${link.typeId}`);
        }
        this.registerLink(link);
    }

    private registerLink(link: Link) {
        const source = this.sourceOf(link);
        if (!source) {
            throw new Error(`Link source not found: ${link.sourceId}`);
        }
        const target = this.targetOf(link);
        if (!target) {
            throw new Error(`Link target not found: ${link.targetId}`);
        }

        let sourceLinks = this.elementLinks.get(source);
        if (!sourceLinks) {
            sourceLinks = [];
            this.elementLinks.set(source, sourceLinks);
        }
        sourceLinks.push(link);

        if (link.sourceId !== link.targetId) {
            let targetLinks = this.elementLinks.get(target);
            if (!targetLinks) {
                targetLinks = [];
                this.elementLinks.set(target, targetLinks);
            }
            targetLinks.push(link);
        }

        link.events.onAny(this.onLinkEvent);
        this.links.push(link.id, link);
        this.source.trigger('changeCells', {updateAll: false, changedLinks: [link]});
    }

    private onLinkEvent: AnyListener<LinkEvents> = (data) => {
        this.source.trigger('linkEvent', {data});
    };

    removeLink(linkId: string, options?: { silent?: boolean }) {
        const link = this.links.delete(linkId);
        if (link) {
            const {typeId, sourceId, targetId} = link;
            link.events.offAny(this.onLinkEvent);
            this.removeLinkReferences(typeId, sourceId, targetId);
            if (!(options && options.silent)) {
                this.source.trigger('changeCells', {updateAll: false, changedLinks: [link]});
            }
        }
    }

    private removeLinkReferences(linkTypeId: LinkTypeIri, sourceId: string, targetId: string) {
        const source = this.getElement(sourceId);
        if (source) {
            const sourceLinks = this.elementLinks.get(source);
            if (sourceLinks) {
                removeLinkFrom(sourceLinks, linkTypeId, sourceId, targetId);
                if (sourceLinks.length === 0) {
                    this.elementLinks.delete(source);
                }
            }
        }

        const target = this.getElement(targetId);
        if (target) {
            const targetLinks = this.elementLinks.get(target);
            if (targetLinks) {
                removeLinkFrom(targetLinks, linkTypeId, sourceId, targetId);
                if (targetLinks.length === 0) {
                    this.elementLinks.delete(target);
                }
            }
        }
    }

    getLinkTypes(): LinkType[] {
        const result: LinkType[] = [];
        this.linkTypes.forEach(type => result.push(type));
        return result;
    }

    getLinkType(linkTypeId: LinkTypeIri): LinkType | undefined {
        return this.linkTypes.get(linkTypeId);
    }

    addLinkType(linkType: LinkType): void {
        if (this.getLinkType(linkType.id)) {
            throw new Error(`Link type already exists: ${linkType.id}`);
        }
        linkType.setIndex(Graph.nextLinkTypeIndex++);
        linkType.events.onAny(this.onLinkTypeEvent);
        this.linkTypes.set(linkType.id, linkType);
    }

    private onLinkTypeEvent: AnyListener<LinkTypeEvents> = (data) => {
        this.source.trigger('linkTypeEvent', {data});
    };

    getPropertyType(propertyId: PropertyTypeIri): PropertyType | undefined {
        return this.propertiesById.get(propertyId);
    }

    addPropertyType(propertyType: PropertyType): void {
        if (this.getPropertyType(propertyType.id)) {
            throw new Error(`Property type already exists: ${propertyType.id}`);
        }
        propertyType.events.onAny(this.onPropertyTypeEvent);
        this.propertiesById.set(propertyType.id, propertyType);
    }

    private onPropertyTypeEvent: AnyListener<PropertyTypeEvents> = (data) => {
        this.source.trigger('propertyTypeEvent', {data});
    };

    getElementType(elementTypeId: ElementTypeIri): ElementType | undefined {
        return this.classesById.get(elementTypeId);
    }

    getElementTypes(): ElementType[] {
        const classes: ElementType[] = [];
        this.classesById.forEach(richClass => classes.push(richClass));
        return classes;
    }

    addElementType(elementType: ElementType): void {
        if (this.getElementType(elementType.id)) {
            throw new Error(`Element type already exists: ${elementType.id}`);
        }
        elementType.events.onAny(this.onElementTypeEvent);
        this.classesById.set(elementType.id, elementType);
    }

    private onElementTypeEvent: AnyListener<ElementTypeEvents> = (data) => {
        this.source.trigger('elementTypeEvent', {data});
    };
}

function removeLinkFrom(links: Link[], linkTypeId: LinkTypeIri, sourceId: string, targetId: string) {
    if (!links) { return; }
    while (true) {
        const index = findLinkIndex(links, linkTypeId, sourceId, targetId);
        if (index < 0) { break; }
        links.splice(index, 1);
    }
}

function findLinkIndex(haystack: Link[], linkTypeId: LinkTypeIri, sourceId: string, targetId: string) {
    for (let i = 0; i < haystack.length; i++) {
        const link = haystack[i];
        if (link.sourceId === sourceId &&
            link.targetId === targetId &&
            link.typeId === linkTypeId
        ) {
            return i;
        }
    }
    return -1;
}
