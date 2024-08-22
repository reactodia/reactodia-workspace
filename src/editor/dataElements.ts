import { Events, EventSource, PropertyChange } from '../coreUtils/events';

import {
    ElementIri, ElementModel, ElementTypeIri, ElementTypeModel,
    LinkModel, LinkTypeIri, LinkTypeModel,
    PropertyTypeIri, PropertyTypeModel, equalLinks,
} from '../data/model';

import {
    Element, ElementEvents, ElementProps, ElementTemplateState,
    Link, LinkEvents, LinkProps,
} from '../diagram/elements';
import { Command } from '../diagram/history';
import { DiagramModel } from '../diagram/model';

export interface EntityElementEvents extends ElementEvents {
    changeData: PropertyChange<Element, ElementModel>;
}

export interface EntityElementProps extends ElementProps {
    data: ElementModel;
}

export class EntityElement extends Element {
    declare readonly events: Events<EntityElementEvents>;

    private _data: ElementModel;

    constructor(props: EntityElementProps) {
        super(props);
        this._data = props.data;
    }

    static placeholderData(iri: ElementIri): ElementModel {
        return {
            id: iri,
            types: [],
            label: [],
            properties: {},
        };
    }

    protected get entitySource(): EventSource<EntityElementEvents> {
        return this.source as EventSource<any>;
    }

    get iri() { return this._data.id; }

    get data() { return this._data; }
    setData(value: ElementModel) {
        const previous = this._data;
        if (previous === value) { return; }
        this._data = value;
        this.entitySource.trigger('changeData', {source: this, previous});
        this.entitySource.trigger('requestedRedraw', {source: this, level: 'template'});
    }
}

export interface EntityGroupEvents extends ElementEvents {
    changeItems: PropertyChange<EntityGroup, ReadonlyArray<EntityGroupItem>>;
}

export interface EntityGroupProps extends ElementProps {
    items?: ReadonlyArray<EntityGroupItem>;
}

export class EntityGroup extends Element {
    declare readonly events: Events<EntityGroupEvents>;

    private _items: ReadonlyArray<EntityGroupItem>;
    private _itemIris = new Set<ElementIri>();

    constructor(props: EntityGroupProps) {
        super(props);
        this._items = props.items ?? [];
        this.updateItemIris();
    }

    protected get entitySource(): EventSource<EntityGroupEvents> {
        return this.source as EventSource<any>;
    }

    get items(): ReadonlyArray<EntityGroupItem> {
        return this._items;
    }

    setItems(value: ReadonlyArray<EntityGroupItem>): void {
        const previous = this._items;
        if (previous === value) { return; }
        this._items = value;
        this.updateItemIris();
        this.entitySource.trigger('changeItems', {source: this, previous});
        this.entitySource.trigger('requestedRedraw', {source: this, level: 'template'});
    }

    get itemIris(): ReadonlySet<ElementIri> {
        return this._itemIris;
    }

    private updateItemIris(): void {
        this._itemIris.clear();
        for (const item of this._items) {
            this._itemIris.add(item.data.id);
        }
    }
}

export interface EntityGroupItem {
    readonly data: ElementModel;
    readonly elementState?: ElementTemplateState | undefined;
}

export function setEntityGroupItems(group: EntityGroup, items: ReadonlyArray<EntityGroupItem>): Command {
    return Command.create('Change group items', () => {
        const before = group.items;
        group.setItems(items);
        return setEntityGroupItems(group, before);
    });
}

export function* iterateEntitiesOf(element: Element): Iterable<ElementModel> {
    if (element instanceof EntityElement) {
        yield element.data;
    } else if (element instanceof EntityGroup) {
        for (const item of element.items) {
            yield item.data;
        }
    }
}

export interface RelationLinkEvents extends LinkEvents {
    changeData: PropertyChange<Link, LinkModel>;
}

export interface RelationLinkProps extends LinkProps {
    data: LinkModel;
}

export class RelationLink extends Link {
    declare readonly events: Events<RelationLinkEvents>;

    private _data: LinkModel;

    constructor(props: RelationLinkProps) {
        super(props);
        this._data = props.data;
    }

    protected get relationSource(): EventSource<RelationLinkEvents> {
        return this.source as EventSource<any>;
    }

    protected override getTypeId(): LinkTypeIri {
        return this._data.linkTypeId;
    }

    get data() { return this._data; }
    setData(value: LinkModel) {
        const previous = this._data;
        if (previous === value) { return; }
        this._data = value;
        this.relationSource.trigger('changeData', {source: this, previous});
        this.relationSource.trigger('requestedRedraw', {source: this, level: 'template'});
    }

    withDirection(data: LinkModel): RelationLink {
        if (!(data.sourceId === this.data.sourceId || data.sourceId === this.data.targetId)) {
            throw new Error('New link source IRI is unrelated to original link');
        }
        if (!(data.targetId === this.data.sourceId || data.targetId === this.data.targetId)) {
            throw new Error('New link target IRI is unrelated to original link');
        }
        const sourceId = data.sourceId === this.data.sourceId
            ? this.sourceId : this.targetId;
        const targetId = data.targetId === this.data.targetId
            ? this.targetId : this.sourceId;
        return new RelationLink({sourceId, targetId, data});
    }
}

export interface ElementTypeEvents {
    changeData: PropertyChange<ElementType, ElementTypeModel | undefined>;
}

export class ElementType {
    private readonly source = new EventSource<ElementTypeEvents>();
    readonly events: Events<ElementTypeEvents> = this.source;

    readonly id: ElementTypeIri;

    private _data: ElementTypeModel | undefined;

    constructor(props: {
        id: ElementTypeIri;
        data?: ElementTypeModel;
    }) {
        const {id, data} = props;
        this.id = id;
        this.setData(data);
    }

    get data(): ElementTypeModel | undefined {
        return this._data;
    }

    setData(value: ElementTypeModel | undefined): void {
        if (value && value.id !== this.id) {
            throw new Error('ElementTypeModel.id does not match ElementType.id');
        }
        const previous = this._data;
        if (previous === value) { return; }
        this._data = value;
        this.source.trigger('changeData', {source: this, previous});
    }
}

export interface PropertyTypeEvents {
    changeData: PropertyChange<PropertyType, PropertyTypeModel | undefined>;
}

export class PropertyType {
    private readonly source = new EventSource<PropertyTypeEvents>();
    readonly events: Events<PropertyTypeEvents> = this.source;

    readonly id: PropertyTypeIri;

    private _data: PropertyTypeModel | undefined;

    constructor(props: {
        id: PropertyTypeIri;
        data?: PropertyTypeModel;
    }) {
        const {id, data} = props;
        this.id = id;
        this.setData(data);
    }

    get data(): PropertyTypeModel | undefined {
        return this._data;
    }

    setData(value: PropertyTypeModel | undefined): void {
        if (value && value.id !== this.id) {
            throw new Error('PropertyTypeModel.id does not match PropertyType.id');
        }
        const previous = this._data;
        if (previous === value) { return; }
        this._data = value;
        this.source.trigger('changeData', {source: this, previous});
    }
}

export interface LinkTypeEvents {
    changeData: PropertyChange<LinkType, LinkTypeModel | undefined>;
}

export class LinkType {
    private readonly source = new EventSource<LinkTypeEvents>();
    readonly events: Events<LinkTypeEvents> = this.source;

    readonly id: LinkTypeIri;

    private _data: LinkTypeModel | undefined;

    constructor(props: {
        id: LinkTypeIri;
        data?: LinkTypeModel | undefined;
    }) {
        const {id, data} = props;
        this.id = id;
        this.setData(data);
    }

    get data(): LinkTypeModel | undefined {
        return this._data;
    }

    setData(value: LinkTypeModel | undefined): void {
        if (value && value.id !== this.id) {
            throw new Error('LinkTypeModel.id does not match LinkType.id');
        }
        const previous = this._data;
        if (previous === value) { return; }
        this._data = value;
        this.source.trigger('changeData', {source: this, previous});
    }
}

export function setElementData(model: DiagramModel, target: ElementIri, data: ElementModel): Command {
    const command = Command.create('Set element data', () => {
        const previousIri = target;
        const newIri = data.id;

        const previousEntities = new Map<EntityElement, ElementModel>();
        const previousGroups = new Map<EntityGroup, ReadonlyArray<EntityGroupItem>>();
        
        for (const element of model.elements) {
            if (element instanceof EntityElement) {
                if (element.iri === target) {
                    previousEntities.set(element, element.data);
                    element.setData(data);
                    updateLinksToReferByNewIri(model, element, previousIri, newIri);
                }
            } else if (element instanceof EntityGroup) {
                if (element.itemIris.has(target)) {
                    previousGroups.set(element, element.items);
                    const nextItems = element.items.map((item): EntityGroupItem =>
                        item.data.id === target ? {...item, data} : item
                    );
                    element.setItems(nextItems);
                    updateLinksToReferByNewIri(model, element, previousIri, newIri);
                }
            }
        }
        return Command.create('Revert element data', () => {
            for (const [element, previousData] of previousEntities) {
                element.setData(previousData);
                updateLinksToReferByNewIri(model, element, newIri, previousIri);
            }
            for (const [element, previousItems] of previousGroups) {
                element.setItems(previousItems);
                updateLinksToReferByNewIri(model, element, newIri, previousIri);
            }
            return command;
        });
    });
    return command;
}

function updateLinksToReferByNewIri(model: DiagramModel, element: Element, oldIri: ElementIri, newIri: ElementIri) {
    for (const link of model.getElementLinks(element)) {
        if (link instanceof RelationLink) {
            let data = link.data;
            if (data.sourceId === oldIri) {
                data = {...data, sourceId: newIri};
            }
            if (data.targetId === oldIri) {
                data = {...data, targetId: newIri};
            }
            link.setData(data);
        }
    }
}

export function setLinkData(model: DiagramModel, oldData: LinkModel, newData: LinkModel): Command {
    if (!equalLinks(oldData, newData)) {
        throw new Error('Cannot change typeId, sourceId or targetId when changing link data');
    }
    return Command.create('Set link data', () => {
        for (const link of model.links) {
            if (link instanceof RelationLink && equalLinks(link.data, oldData)) {
                link.setData(newData);
            }
        }
        return setLinkData(model, newData, oldData);
    });
}
