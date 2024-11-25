import { OrderedMap } from '../coreUtils/collections';
import { EventSource, Events, AnyEvent, AnyListener, PropertyChange } from '../coreUtils/events';

import { LinkTypeIri } from '../data/model';

import {
    Element, ElementEvents, Link, LinkEvents, LinkTypeVisibility,
} from './elements';

export interface GraphEvents {
    changeCells: CellsChangedEvent;
    elementEvent: AnyEvent<ElementEvents>;
    linkEvent: AnyEvent<LinkEvents>;
    changeLinkVisibility: PropertyChange<LinkTypeIri, LinkTypeVisibility>;
}

/**
 * Event data for diagram cells changed event.
 */
export interface CellsChangedEvent {
    /**
     * If `true`, it should be assumed that many elements or links
     * were added or removed at the same time, and any caches based
     * on the diagram content should be completely re-computed.
     */
    readonly updateAll: boolean;
    /**
     * Specific element was added or removed.
     */
    readonly changedElement?: Element;
    /**
     * Specific links were added or removed.
     */
    readonly changedLinks?: ReadonlyArray<Link>;
}

export class Graph {
    private readonly source = new EventSource<GraphEvents>();
    readonly events: Events<GraphEvents> = this.source;

    private readonly elements = new OrderedMap<Element>();
    private readonly links = new OrderedMap<Link>();
    private readonly elementLinks = new WeakMap<Element, Link[]>();
    private readonly EMPTY_LINKS: Link[] = [];

    private readonly linkTypeVisibility = new Map<LinkTypeIri, LinkTypeVisibility>();

    getElements() { return this.elements.items; }
    getLinks() { return this.links.items; }

    getLink(linkId: string): Link | undefined {
        return this.links.get(linkId);
    }

    getElementLinks(element: Element): ReadonlyArray<Link> {
        return this.elementLinks.get(element) ?? [];
    }

    *iterateLinks(sourceId: string, targetId: string, linkTypeId?: LinkTypeIri): Iterable<Link> {
        const source = this.getElement(sourceId);
        const target = this.getElement(targetId);
        if (!(source && target)) {
            return;
        }
        const sourceLinks = this.elementLinks.get(source) ?? this.EMPTY_LINKS;
        const targetLinks = this.elementLinks.get(target) ?? this.EMPTY_LINKS;
        const linksToIterate = sourceLinks.length <= targetLinks.length ? sourceLinks : targetLinks;
        for (const link of linksToIterate) {
            if (
                link.sourceId === sourceId &&
                link.targetId === targetId &&
                (!linkTypeId || link.typeId === linkTypeId)
            ) {
                yield link;
            }
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
            link.events.offAny(this.onLinkEvent);
            this.removeLinkReferences(link);
            if (!(options && options.silent)) {
                this.source.trigger('changeCells', {updateAll: false, changedLinks: [link]});
            }
        }
    }

    private removeLinkReferences(link: Link): void {
        const source = this.getElement(link.sourceId);
        if (source) {
            const sourceLinks = this.elementLinks.get(source);
            if (sourceLinks) {
                removeLinkFrom(sourceLinks, link);
                if (sourceLinks.length === 0) {
                    this.elementLinks.delete(source);
                }
            }
        }

        const target = this.getElement(link.targetId);
        if (target) {
            const targetLinks = this.elementLinks.get(target);
            if (targetLinks) {
                removeLinkFrom(targetLinks, link);
                if (targetLinks.length === 0) {
                    this.elementLinks.delete(target);
                }
            }
        }
    }

    get linkVisibility(): ReadonlyMap<LinkTypeIri, LinkTypeVisibility> {
        return this.linkTypeVisibility;
    }

    getLinkVisibility(linkTypeId: LinkTypeIri): LinkTypeVisibility {
        return this.linkTypeVisibility.get(linkTypeId) ?? 'visible';
    }

    setLinkVisibility(linkTypeId: LinkTypeIri, value: LinkTypeVisibility): void {
        const previous = this.getLinkVisibility(linkTypeId);
        if (value === previous) {
            return;
        }
        this.linkTypeVisibility.set(linkTypeId, value);
        this.source.trigger('changeLinkVisibility', {source: linkTypeId, previous});
    }
}

function removeLinkFrom(links: Link[], link: Link): void {
    const index = links.indexOf(link);
    if (index >= 0) {
        links.splice(index, 1);
    }
}
