import { OrderedMap } from '../coreUtils/collections';
import { EventSource, Events, AnyEvent, AnyListener } from '../coreUtils/events';

import { ElementTypeIri, LinkTypeIri, PropertyTypeIri } from '../data/model';

import {
    Element as DiagramElement, ElementEvents,
    Link as DiagramLink, LinkEvents,
    RichLinkType, RichLinkTypeEvents,
    RichElementType, RichElementTypeEvents,
    RichProperty,
} from './elements';

export interface GraphEvents {
    changeCells: CellsChangedEvent;
    elementEvent: AnyEvent<ElementEvents>;
    linkEvent: AnyEvent<LinkEvents>;
    linkTypeEvent: AnyEvent<RichLinkTypeEvents>;
    classEvent: AnyEvent<RichElementTypeEvents>;
}

export interface CellsChangedEvent {
    readonly updateAll: boolean;
    readonly changedElement?: DiagramElement;
    readonly changedLinks?: ReadonlyArray<DiagramLink>;
}

export class Graph {
    private readonly source = new EventSource<GraphEvents>();
    readonly events: Events<GraphEvents> = this.source;

    private readonly elements = new OrderedMap<DiagramElement>();
    private readonly links = new OrderedMap<DiagramLink>();
    private readonly elementLinks = new WeakMap<DiagramElement, DiagramLink[]>();

    private readonly classesById = new Map<ElementTypeIri, RichElementType>();
    private readonly propertiesById = new Map<PropertyTypeIri, RichProperty>();

    private linkTypes = new Map<LinkTypeIri, RichLinkType>();
    private static nextLinkTypeIndex = 0;

    getElements() { return this.elements.items; }
    getLinks() { return this.links.items; }

    getLink(linkId: string): DiagramLink | undefined {
        return this.links.get(linkId);
    }

    getElementLinks(element: DiagramElement): ReadonlyArray<DiagramLink> {
        return this.elementLinks.get(element) ?? [];
    }

    findLink(linkTypeId: LinkTypeIri, sourceId: string, targetId: string): DiagramLink | undefined {
        const source = this.getElement(sourceId);
        if (!source) { return undefined; }
        const links = this.elementLinks.get(source);
        if (links) {
            const index = findLinkIndex(links, linkTypeId, sourceId, targetId);
            return index >= 0 ? links[index] : undefined;
        }
    }

    sourceOf(link: DiagramLink) {
        return this.getElement(link.sourceId);
    }

    targetOf(link: DiagramLink) {
        return this.getElement(link.targetId);
    }

    reorderElements(compare: (a: DiagramElement, b: DiagramElement) => number) {
        this.elements.reorder(compare);
    }

    getElement(elementId: string): DiagramElement | undefined {
        return this.elements.get(elementId);
    }

    addElement(element: DiagramElement): void {
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

    addLink(link: DiagramLink): void {
        if (this.getLink(link.id)) {
            throw new Error(`Link '${link.id}' already exists.`);
        }
        const linkType = this.getLinkType(link.typeId);
        if (!linkType) {
            throw new Error(`Link type '${link.typeId}' not found.`);
        }
        this.registerLink(link);
    }

    private registerLink(link: DiagramLink) {
        const source = this.sourceOf(link);
        if (!source) {
            throw new Error(`Link source '${link.sourceId}' not found`);
        }
        const target = this.targetOf(link);
        if (!target) {
            throw new Error(`Link source '${link.targetId}' not found`);
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

    getLinkTypes(): RichLinkType[] {
        const result: RichLinkType[] = [];
        this.linkTypes.forEach(type => result.push(type));
        return result;
    }

    getLinkType(linkTypeId: LinkTypeIri): RichLinkType | undefined {
        return this.linkTypes.get(linkTypeId);
    }

    addLinkType(linkType: RichLinkType): void {
        if (this.getLinkType(linkType.id)) {
            throw new Error(`Link type '${linkType.id}' already exists.`);
        }
        linkType.setIndex(Graph.nextLinkTypeIndex++);
        linkType.events.onAny(this.onLinkTypeEvent);
        this.linkTypes.set(linkType.id, linkType);
    }

    private onLinkTypeEvent: AnyListener<RichLinkTypeEvents> = (data) => {
        this.source.trigger('linkTypeEvent', {data});
    };

    getProperty(propertyId: PropertyTypeIri): RichProperty | undefined {
        return this.propertiesById.get(propertyId);
    }

    addProperty(property: RichProperty): void {
        if (this.getProperty(property.id)) {
            throw new Error(`Property '${property.id}' already exists.`);
        }
        this.propertiesById.set(property.id, property);
    }

    getClass(classId: ElementTypeIri): RichElementType | undefined {
        return this.classesById.get(classId);
    }

    getClasses(): RichElementType[] {
        const classes: RichElementType[] = [];
        this.classesById.forEach(richClass => classes.push(richClass));
        return classes;
    }

    addClass(classModel: RichElementType): void {
        if (this.getClass(classModel.id)) {
            throw new Error(`Class '${classModel.id}' already exists.`);
        }
        classModel.events.onAny(this.onClassEvent);
        this.classesById.set(classModel.id, classModel);
    }

    private onClassEvent: AnyListener<RichElementTypeEvents> = (data) => {
        this.source.trigger('classEvent', {data});
    };
}

function removeLinkFrom(links: DiagramLink[], linkTypeId: LinkTypeIri, sourceId: string, targetId: string) {
    if (!links) { return; }
    while (true) {
        const index = findLinkIndex(links, linkTypeId, sourceId, targetId);
        if (index < 0) { break; }
        links.splice(index, 1);
    }
}

function findLinkIndex(haystack: DiagramLink[], linkTypeId: LinkTypeIri, sourceId: string, targetId: string) {
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
