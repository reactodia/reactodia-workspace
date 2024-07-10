import { EventSource, Events, AnyEvent, AnyListener } from '../coreUtils/events';

import { ElementTypeIri, LinkTypeIri, PropertyTypeIri } from '../data/model';

import {
    ElementType, ElementTypeEvents,
    PropertyType, PropertyTypeEvents,
    LinkType, LinkTypeEvents,
} from './dataElements';

export interface DataGraphEvents {
    elementTypeEvent: AnyEvent<ElementTypeEvents>;
    linkTypeEvent: AnyEvent<LinkTypeEvents>;
    propertyTypeEvent: AnyEvent<PropertyTypeEvents>;
}

export class DataGraph {
    private readonly source = new EventSource<DataGraphEvents>();
    readonly events: Events<DataGraphEvents> = this.source;

    private readonly classesById = new Map<ElementTypeIri, ElementType>();
    private readonly propertiesById = new Map<PropertyTypeIri, PropertyType>();
    private readonly linkTypes = new Map<LinkTypeIri, LinkType>();

    getLinkType(linkTypeId: LinkTypeIri): LinkType | undefined {
        return this.linkTypes.get(linkTypeId);
    }

    addLinkType(linkType: LinkType): void {
        if (this.getLinkType(linkType.id)) {
            throw new Error(`Link type already exists: ${linkType.id}`);
        }
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
