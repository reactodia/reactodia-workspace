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

/**
 * Event data for {@link EntityElement} events.
 *
 * @see {@link EntityElement}
 */
export interface EntityElementEvents extends ElementEvents {
    /**
     * Triggered on {@link EntityElement.data} property change.
     */
    changeData: PropertyChange<EntityElement, ElementModel>;
}

/**
 * Properties for {@link EntityElement}.
 *
 * @see {@link EntityElement}
 */
export interface EntityElementProps extends ElementProps {
    data: ElementModel;
}

/**
 * Diagram element representing an graph entity referenced by an IRI.
 *
 * @category Core
 */
export class EntityElement extends Element {
    declare readonly events: Events<EntityElementEvents>;

    private _data: ElementModel;

    constructor(props: EntityElementProps) {
        super(props);
        this._data = props.data;
    }

    /**
     * Creates an empty (placeholder) data for the specified entity IRI.
     *
     * This data can be used to display an entity in the UI
     * until the actual data is loaded from a data provider.
     */
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

    get data(): ElementModel {
        return this._data;
    }
    setData(value: ElementModel) {
        const previous = this._data;
        if (previous === value) { return; }
        this._data = value;
        this.entitySource.trigger('changeData', {source: this, previous});
        this.entitySource.trigger('requestedRedraw', {source: this, level: 'template'});
    }
}

/**
 * Command to set {@link EntityElement.data entity element data}.
 *
 * @category Commands
 */
export function setEntityElementData(
    entity: EntityElement,
    data: ElementModel
): Command {
    return Command.create({titleKey: 'commands.set_entity_data.title'}, () => {
        const previous = entity.data;
        entity.setData(data);
        return setEntityElementData(entity, previous);
    });
}

/**
 * Event data for {@link EntityGroup} events.
 * 
 * @see {@link EntityGroup}
 */
export interface EntityGroupEvents extends ElementEvents {
    /**
     * Triggered on {@link EntityGroup.items} property change.
     */
    changeItems: PropertyChange<EntityGroup, ReadonlyArray<EntityGroupItem>>;
}

/**
 * Properties for {@link EntityGroup}.
 *
 * @see {@link EntityGroup}
 */
export interface EntityGroupProps extends ElementProps {
    items?: ReadonlyArray<EntityGroupItem>;
}

/**
 * Diagram element representing a group of multiple graph entities.
 *
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

/**
 * Represents a single entity contained in the entity group.
 *
 * @see {@link EntityGroup.items}
 */
export interface EntityGroupItem {
    readonly data: ElementModel;
    readonly elementState?: ElementTemplateState | undefined;
}

/**
 * Command to set {@link EntityGroup.items entity group items}.
 *
 * @category Commands
 */
export function setEntityGroupItems(group: EntityGroup, items: ReadonlyArray<EntityGroupItem>): Command {
    return Command.create({titleKey: 'commands.set_entity_group_items.title'}, () => {
        const before = group.items;
        group.setItems(items);
        return setEntityGroupItems(group, before);
    });
}

/**
 * Iterates over data for all entities of the target element.
 *
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

/**
 * Event data for {@link RelationLink} events.
 *
 * @see {@link RelationLink}
 */
export interface RelationLinkEvents extends LinkEvents {
    /**
     * Triggered on {@link RelationLink.data} property change.
     */
    changeData: PropertyChange<RelationLink, LinkModel>;
}

/**
 * Properties for {@link RelationLink}.
 *
 * @see {@link RelationLink}
 */
export interface RelationLinkProps extends LinkProps {
    data: LinkModel;
}

/**
 * Diagram link representing a graph relation, uniquely identified by
 * (source entity IRI, target entity IRI, link type IRI) tuple.
 *
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

    get data(): LinkModel {
        return this._data;
    }
    setData(value: LinkModel) {
        const previous = this._data;
        if (previous === value) { return; }
        this._data = value;
        this.relationSource.trigger('changeData', {source: this, previous});
        this.relationSource.trigger('requestedRedraw', {source: this});
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
 * Command to set relation {@link RelationLink.data relation link data}.
 *
 * @category Commands
 */
export function setRelationLinkData(
    relation: RelationLink,
    data: LinkModel
): Command {
    return Command.create({titleKey: 'commands.set_relation_data.title'}, () => {
        const previous = relation.data;
        relation.setData(data);
        return setRelationLinkData(relation, previous);
    });
}

/**
 * Event data for {@link RelationGroup} events.
 *
 * @see {@link RelationGroup}
 */
export interface RelationGroupEvents extends LinkEvents {
    /**
     * Triggered on {@link RelationGroup.items} property change.
     */
    changeItems: PropertyChange<RelationGroup, ReadonlyArray<RelationGroupItem>>;
}

/**
 * Properties for {@link RelationGroup}.
 *
 * @see {@link RelationGroup}
 */
export interface RelationGroupProps extends LinkProps {
    typeId: LinkTypeIri;
    items: ReadonlyArray<RelationGroupItem>;
}

/**
 * Diagram link representing a group of multiple graph relations.
 *
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
        this.relationSource.trigger('requestedRedraw', {source: this});
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

/**
 * Represents a single relation contained in the relation group.
 *
 * @see {@link RelationGroup.items}
 */
export interface RelationGroupItem {
    readonly data: LinkModel;
    readonly linkState?: LinkTemplateState | undefined;
}

/**
 * Command to set {@link RelationGroup.items relation group items}.
 *
 * @category Commands
 */
export function setRelationGroupItems(group: RelationGroup, items: ReadonlyArray<RelationGroupItem>): Command {
    return Command.create({titleKey: 'commands.set_relation_group_items.title'}, () => {
        const before = group.items;
        group.setItems(items);
        return setRelationGroupItems(group, before);
    });
}

/**
 * Iterates over data for all relations of the target link.
 *
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

/**
 * Event data for {@link ElementType} events.
 *
 * @see {@link ElementType}
 */
export interface ElementTypeEvents {
    /**
     * Triggered on {@link ElementType.data} property change.
     */
    changeData: PropertyChange<ElementType, ElementTypeModel | undefined>;
}

/**
 * Stores data of an entity type in the graph.
 *
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

/**
 * Event data for {@link PropertyType} events.
 *
 * @see {@link PropertyType}
 */
export interface PropertyTypeEvents {
    /**
     * Triggered on {@link PropertyType.data} property change.
     */
    changeData: PropertyChange<PropertyType, PropertyTypeModel | undefined>;
}

/**
 * Stores data of a property type in the graph.
 *
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

/**
 * Event data for {@link LinkType} events.
 *
 * @see {@link LinkType}
 */
export interface LinkTypeEvents {
    /**
     * Triggered on {@link LinkType.data} property change.
     */
    changeData: PropertyChange<LinkType, LinkTypeModel | undefined>;
}

/**
 * Stores data of a link type in the graph.
 *
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
 * Command to replace {@link EntityElement.data data} for all entities with target IRI on the diagram.
 *
 * If IRI in the new `data` is different from the `target`, the relations
 * connected to the entities will have their data changed as well to refer
 * to the same entities by the new IRI.
 *
 * @category Commands
 */
export function changeEntityData(model: DiagramModel, target: ElementIri, data: ElementModel): Command {
    const command = Command.create({titleKey: 'commands.change_entity.title'}, () => {
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
        return Command.create({titleKey: 'commands.change_entity.title'}, () => {
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
 * Command to replace {@link RelationLink.data data} for all relations with same target identity.
 *
 * The relation identity should be the same for both `oldData` and `newData`
 * otherwise an error wil be thrown.
 *
 * @category Commands
 */
export function changeRelationData(model: DiagramModel, oldData: LinkModel, newData: LinkModel): Command {
    if (!equalLinks(oldData, newData)) {
        throw new Error('Cannot change typeId, sourceId or targetId when changing link data');
    }
    return Command.create({titleKey: 'commands.change_relation.title'}, () => {
        for (const link of model.links) {
            if (link instanceof RelationLink && equalLinks(link.data, oldData)) {
                link.setData(newData);
            }
        }
        return changeRelationData(model, newData, oldData);
    });
}
