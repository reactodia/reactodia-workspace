import { Events, EventSource, PropertyChange } from '../coreUtils/events';
import { ReadonlyHashSet, HashSet } from '../coreUtils/hashMap';

import {
    ElementIri, ElementModel, ElementTypeIri, ElementTypeModel,
    LinkKey, LinkModel, LinkTypeIri, LinkTypeModel,
    PropertyTypeIri, PropertyTypeModel,
    equalLinks, hashLink,
} from '../data/model';

import {
    Element, ElementEvents, ElementProps, ElementTemplateState,
    Link, LinkEvents, LinkProps,
    LinkTemplateState,
} from '../diagram/elements';
import { Command } from '../diagram/history';
import { DiagramModel } from '../diagram/model';

export interface EntityElementEvents extends ElementEvents {
    changeData: PropertyChange<Element, ElementModel>;
}

export interface EntityElementProps extends ElementProps {
    data: ElementModel;
}

/**
 * @category Core
 */
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

/**
 * @category Commands
 */
export function setEntityElementData(
    entity: EntityElement,
    data: ElementModel
): Command {
    return Command.create('Set entity element data', () => {
        const previous = entity.data;
        entity.setData(data);
        return setEntityElementData(entity, previous);
    });
}

export interface EntityGroupEvents extends ElementEvents {
    changeItems: PropertyChange<EntityGroup, ReadonlyArray<EntityGroupItem>>;
}

export interface EntityGroupProps extends ElementProps {
    items?: ReadonlyArray<EntityGroupItem>;
}

/**
 * @category Core
 */
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

/**
 * @category Commands
 */
export function setEntityGroupItems(group: EntityGroup, items: ReadonlyArray<EntityGroupItem>): Command {
    return Command.create('Set entity group items', () => {
        const before = group.items;
        group.setItems(items);
        return setEntityGroupItems(group, before);
    });
}

/**
 * @category Core
 */
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

/**
 * @category Core
 */
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

/**
 * @category Commands
 */
export function setRelationLinkData(
    relation: RelationLink,
    data: LinkModel
): Command {
    return Command.create('Set relation link data', () => {
        const previous = relation.data;
        relation.setData(data);
        return setRelationLinkData(relation, previous);
    });
}

export interface RelationGroupEvents extends LinkEvents {
    changeItems: PropertyChange<RelationGroup, ReadonlyArray<RelationGroupItem>>;
}

export interface RelationGroupProps extends LinkProps {
    typeId: LinkTypeIri;
    items: ReadonlyArray<RelationGroupItem>;
}

/**
 * @category Core
 */
export class RelationGroup extends Link {
    declare readonly events: Events<RelationGroupEvents>;

    private readonly _typeId: LinkTypeIri;
    private _items: ReadonlyArray<RelationGroupItem>;

    private readonly _itemKeys = new HashSet<LinkKey>(hashLink, equalLinks);
    private readonly _sources = new Set<ElementIri>();
    private readonly _targets = new Set<ElementIri>();

    constructor(props: RelationGroupProps) {
        super(props);
        this._typeId = props.typeId;
        this._items = props.items ?? [];
        this.updateItemKeys();
    }

    protected get relationSource(): EventSource<RelationGroupEvents> {
        return this.source as EventSource<any>;
    }

    protected override getTypeId(): LinkTypeIri {
        return this._typeId;
    }

    get items(): ReadonlyArray<RelationGroupItem> {
        return this._items;
    }

    setItems(value: ReadonlyArray<RelationGroupItem>): void {
        for (const item of value) {
            if (item.data.linkTypeId !== this._typeId) {
                throw new Error('RelationGroup should have only items with same type IRI');
            }
        }
        const previous = this._items;
        if (previous === value) { return; }
        this._items = value;
        this.updateItemKeys();
        this.relationSource.trigger('changeItems', {source: this, previous});
        this.relationSource.trigger('requestedRedraw', {source: this, level: 'template'});
    }

    get itemKeys(): ReadonlyHashSet<LinkKey> {
        return this._itemKeys;
    }

    get itemSources(): ReadonlySet<ElementIri> {
        return this._sources;
    }

    get itemTargets(): ReadonlySet<ElementIri> {
        return this._targets;
    }

    private updateItemKeys(): void {
        this._itemKeys.clear();
        this._sources.clear();
        this._targets.clear();
        for (const item of this._items) {
            this._itemKeys.add(item.data);
            this._sources.add(item.data.sourceId);
            this._targets.add(item.data.targetId);
        }
    }
}

export interface RelationGroupItem {
    readonly data: LinkModel;
    readonly linkState?: LinkTemplateState | undefined;
}

/**
 * @category Commands
 */
export function setRelationGroupItems(group: RelationGroup, items: ReadonlyArray<RelationGroupItem>): Command {
    return Command.create('Set relation group items', () => {
        const before = group.items;
        group.setItems(items);
        return setRelationGroupItems(group, before);
    });
}

/**
 * @category Core
 */
export function* iterateRelationsOf(link: Link): Iterable<LinkModel> {
    if (link instanceof RelationLink) {
        yield link.data;
    } else if (link instanceof RelationGroup) {
        for (const item of link.items) {
            yield item.data;
        }
    }
}

export interface ElementTypeEvents {
    changeData: PropertyChange<ElementType, ElementTypeModel | undefined>;
}

/**
 * @category Core
 */
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

/**
 * @category Core
 */
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

/**
 * @category Core
 */
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

/**
 * @category Commands
 */
export function changeEntityData(model: DiagramModel, target: ElementIri, data: ElementModel): Command {
    const command = Command.create('Change entity data', () => {
        const previousIri = target;
        const newIri = data.id;

        const previousEntities = new Map<EntityElement, ElementModel>();
        const previousEntityGroups = new Map<EntityGroup, ReadonlyArray<EntityGroupItem>>();
        const previousRelations = new Map<RelationLink, LinkModel>();
        const previousRelationGroups = new Map<RelationGroup, ReadonlyArray<RelationGroupItem>>();
        
        const updateLinksToReferByNewIri = (element: Element) => {
            for (const link of model.getElementLinks(element)) {
                if (link instanceof RelationLink) {
                    previousRelations.set(link, link.data);
                    link.setData(mapRelationEndpoint(link.data, previousIri, newIri));
                } else if (link instanceof RelationGroup) {
                    if (link.itemSources.has(previousIri) || link.itemTargets.has(previousIri)) {
                        previousRelationGroups.set(link, link.items);
                        const items = link.items.map((item): RelationGroupItem => ({
                            ...item,
                            data: mapRelationEndpoint(item.data, previousIri, newIri),
                        }));
                        link.setItems(items);
                    }
                }
            }
        };
        
        for (const element of model.elements) {
            if (element instanceof EntityElement) {
                if (element.iri === target) {
                    previousEntities.set(element, element.data);
                    element.setData(data);
                    updateLinksToReferByNewIri(element);
                }
            } else if (element instanceof EntityGroup) {
                if (element.itemIris.has(target)) {
                    previousEntityGroups.set(element, element.items);
                    const nextItems = element.items.map((item): EntityGroupItem =>
                        item.data.id === target ? {...item, data} : item
                    );
                    element.setItems(nextItems);
                    updateLinksToReferByNewIri(element);
                }
            }
        }
        return Command.create('Revert element data', () => {
            for (const [element, previousData] of previousEntities) {
                element.setData(previousData);
            }
            for (const [element, previousItems] of previousEntityGroups) {
                element.setItems(previousItems);
            }
            for (const [link, previousData] of previousRelations) {
                link.setData(previousData);
            }
            for (const [link, previousItems] of previousRelationGroups) {
                link.setItems(previousItems);
            }
            return command;
        });
    });
    return command;
}

function mapRelationEndpoint(relation: LinkModel, oldIri: ElementIri, newIri: ElementIri): LinkModel {
    let data = relation;
    if (data.sourceId === oldIri) {
        data = {...data, sourceId: newIri};
    }
    if (data.targetId === oldIri) {
        data = {...data, targetId: newIri};
    }
    return data;
}

/**
 * @category Commands
 */
export function changeRelationData(model: DiagramModel, oldData: LinkModel, newData: LinkModel): Command {
    if (!equalLinks(oldData, newData)) {
        throw new Error('Cannot change typeId, sourceId or targetId when changing link data');
    }
    return Command.create('Change relation data', () => {
        for (const link of model.links) {
            if (link instanceof RelationLink && equalLinks(link.data, oldData)) {
                link.setData(newData);
            }
        }
        return changeRelationData(model, newData, oldData);
    });
}
