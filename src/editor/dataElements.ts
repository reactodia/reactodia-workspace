import { HashSet, type ReadonlyHashSet } from '@reactodia/hashmap';

import { Events, EventSource, PropertyChange } from '../coreUtils/events';
import { TranslatedText } from '../coreUtils/i18n';

import {
    ElementIri, ElementModel, ElementTypeIri, ElementTypeModel,
    LinkKey, LinkModel, LinkTypeIri, LinkTypeModel,
    PropertyTypeIri, PropertyTypeModel,
    equalLinks, hashLink,
} from '../data/model';
import {
    PlaceholderDataProperty, TemplateState, type SerializedTemplateState,
} from '../data/schema';

import {
    Element, ElementEvents, ElementProps,
    Link, LinkEvents, LinkProps,
} from '../diagram/elements';
import { Command } from '../diagram/history';
import { DiagramModel } from '../diagram/model';

import type {
    SerializedElement, SerializableElementCell, ElementFromJsonOptions,
    SerializedLink, SerializableLinkCell, LinkFromJsonOptions,
} from './serializedDiagram';

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
     * 
     * @see {@link PlaceholderDataProperty}
     */
    static placeholderData(iri: ElementIri): ElementModel {
        return {
            id: iri,
            types: [],
            properties: {
                [PlaceholderDataProperty]: [],
            },
        };
    }

    /**
     * Returns `true` if the `data` is an empty placeholder (not yet loaded) data,
     * otherwise `false`.
     *
     * The entity data is considered to be a placeholder data if `data.properties`
     * contains `PlaceholderDataProperty` key with a empty or non-empty values.
     *
     * @see {@link PlaceholderDataProperty}
     */
    static isPlaceholderData(data: ElementModel): boolean {
        return (
            Object.prototype.hasOwnProperty.call(data.properties, PlaceholderDataProperty) &&
            data.properties[PlaceholderDataProperty] !== undefined
        );
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

    static readonly fromJSONType = 'Element';

    static fromJSON(
        state: SerializedEntityElement,
        options: ElementFromJsonOptions
    ): EntityElement | undefined {
        const {'@id': id, iri, position, isExpanded, elementState} = state;
        if (iri) {
            const initialData = options.getInitialData(iri);
            return new EntityElement({
                id,
                data: initialData ?? EntityElement.placeholderData(iri),
                position,
                expanded: isExpanded,
                elementState: options.mapTemplateState(
                    TemplateState.fromJSON(elementState)
                ),
            });
        }
        return undefined;
    }

    toJSON(): SerializedEntityElement {
        return {
            '@type': 'Element',
            '@id': this.id,
            iri: this.iri,
            position: this.position,
            elementState: this.elementState.toJSON(),
        };
    }
}

EntityElement satisfies SerializableElementCell<EntityElement>;

/**
 * Serialized entity element state.
 */
export interface SerializedEntityElement extends SerializedElement {
    '@type': 'Element';
    iri?: ElementIri;
    /**
     * @deprecated only deserialized to {@link TemplateProperties.Expanded}
     * in {@link elementState} for compatibility
     */
    isExpanded?: boolean;
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
    return Command.create(TranslatedText.text('commands.set_entity_data.title'), () => {
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

    static readonly fromJSONType = 'ElementGroup';

    static fromJSON(
        state: SerializedEntityGroup,
        options: ElementFromJsonOptions
    ): EntityGroup | undefined {
        const {'@id': id, items, position, elementState} = state;
        const groupItems: EntityGroupItem[] = [];
        for (const item of items) {
            const initialData = options.getInitialData(item.iri);
            groupItems.push({
                data: initialData ?? EntityElement.placeholderData(item.iri),
                elementState: options.mapTemplateState(
                    TemplateState.fromJSON(item.elementState)
                ),
            });
        }
        return new EntityGroup({
            id,
            items: groupItems,
            position,
            elementState: TemplateState.fromJSON(elementState),
        });
    }

    toJSON(): SerializedEntityGroup {
        return {
            '@type': 'ElementGroup',
            '@id': this.id,
            items: this.items.map((item): SerializedEntityGroupItem => ({
                '@type': 'ElementItem',
                iri: item.data.id,
                elementState: item.elementState?.toJSON(),
            })),
            position: this.position,
            elementState: this.elementState.toJSON(),
        };
    }
}

EntityGroup satisfies SerializableElementCell<EntityGroup>;

/**
 * Represents a single entity contained in the entity group.
 *
 * @see {@link EntityGroup.items}
 */
export interface EntityGroupItem {
    readonly data: ElementModel;
    readonly elementState?: TemplateState | undefined;
}

/**
 * Serialized entity group state. 
 */
export interface SerializedEntityGroup extends SerializedElement {
    '@type': 'ElementGroup';
    items: ReadonlyArray<SerializedEntityGroupItem>;
}

/**
 * Serialized entity group item state.
 */
export interface SerializedEntityGroupItem {
    '@type': 'ElementItem';
    iri: ElementIri;
    elementState?: SerializedTemplateState;
}

/**
 * Command to set {@link EntityGroup.items entity group items}.
 *
 * @category Commands
 */
export function setEntityGroupItems(group: EntityGroup, items: ReadonlyArray<EntityGroupItem>): Command {
    return Command.create(TranslatedText.text('commands.set_entity_group_items.title'), () => {
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

    static readonly fromJSONType = 'Link';

    static fromJSON(
        state: SerializedRelationLink,
        options: LinkFromJsonOptions
    ): RelationLink | undefined {
        const {'@id': id, property, vertices, linkState} = state;
        const {source, target} = options;

        const sourceIri = state.sourceIri ?? (
            source instanceof EntityElement ? source.data.id : undefined
        );
        const targetIri = state.targetIri ?? (
            target instanceof EntityElement ? target.data.id : undefined
        );
        if (sourceIri && targetIri) {
            const key: LinkModel = {
                linkTypeId: property,
                sourceId: sourceIri,
                targetId: targetIri,
                properties: {},
            };
            const initialData = options.getInitialData(key);
            return new RelationLink({
                id,
                sourceId: source.id,
                targetId: target.id,
                data: initialData ?? key,
                vertices,
                linkState: options.mapTemplateState(
                    TemplateState.fromJSON(linkState)
                ),
            });
        }

        return undefined;
    }

    toJSON(): SerializedRelationLink {
        return {
            '@type': 'Link',
            '@id': this.id,
            property: this.typeId,
            source: {'@id': this.sourceId},
            target: {'@id': this.targetId},
            sourceIri: this.data.sourceId,
            targetIri: this.data.targetId,
            vertices: [...this.vertices],
            linkState: this.linkState.toJSON(),
        };
    }
}

RelationLink satisfies SerializableLinkCell<RelationLink>;

/**
 * Serialized relation link state.
 */
export interface SerializedRelationLink extends SerializedLink {
    '@type': 'Link';
    property: LinkTypeIri;
    targetIri?: ElementIri;
    sourceIri?: ElementIri;
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
    return Command.create(TranslatedText.text('commands.set_relation_data.title'), () => {
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

    static readonly fromJSONType = 'LinkGroup';

    static fromJSON(
        state: SerializedRelationGroup,
        options: LinkFromJsonOptions
    ): RelationGroup | undefined {
        const {'@id': id, property, vertices, linkState} = state;
        const {source, target} = options;
        const groupItems: RelationGroupItem[] = [];
        for (const item of state.items) {
            const key: LinkModel = {
                linkTypeId: state.property,
                sourceId: item.sourceIri,
                targetId: item.targetIri,
                properties: {},
            };
            const initialData = options.getInitialData(key);
            groupItems.push({
                data: initialData ?? key,
                linkState: options.mapTemplateState(
                    TemplateState.fromJSON(item.linkState)
                ),
            });
        }
        return new RelationGroup({
            id,
            typeId: property,
            sourceId: source.id,
            targetId: target.id,
            items: groupItems,
            vertices,
            linkState: options.mapTemplateState(
                TemplateState.fromJSON(linkState)
            ),
        });
    }

    toJSON(): SerializedRelationGroup {
        return {
            '@type': 'LinkGroup',
            '@id': this.id,
            property: this.typeId,
            source: {'@id': this.sourceId},
            target: {'@id': this.targetId},
            items: this.items.map((item): SerializedRelationGroupItem => ({
                '@type': 'LinkItem',
                sourceIri: item.data.sourceId,
                targetIri: item.data.targetId,
                linkState: item.linkState?.toJSON(),
            })),
            vertices: [...this.vertices],
            linkState: this.linkState.toJSON(),
        };
    }
}

RelationGroup satisfies SerializableLinkCell<RelationGroup>;

/**
 * Represents a single relation contained in the relation group.
 *
 * @see {@link RelationGroup.items}
 */
export interface RelationGroupItem {
    readonly data: LinkModel;
    readonly linkState?: TemplateState | undefined;
}

/**
 * Serialized relation group state.
 */
export interface SerializedRelationGroup extends SerializedLink {
    '@type': 'LinkGroup';
    property: LinkTypeIri;
    items: ReadonlyArray<SerializedRelationGroupItem>;
}

/**
 * Serialized relation group item state.
 */
export interface SerializedRelationGroupItem {
    '@type': 'LinkItem';
    targetIri: ElementIri;
    sourceIri: ElementIri;
    linkState?: SerializedTemplateState;
}

/**
 * Command to set {@link RelationGroup.items relation group items}.
 *
 * @category Commands
 */
export function setRelationGroupItems(group: RelationGroup, items: ReadonlyArray<RelationGroupItem>): Command {
    return Command.create(TranslatedText.text('commands.set_relation_group_items.title'), () => {
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
    const command = Command.create(TranslatedText.text('commands.change_entity.title'), () => {
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
        return Command.create(TranslatedText.text('commands.change_entity.title'), () => {
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
    return Command.create(TranslatedText.text('commands.change_relation.title'), () => {
        for (const link of model.links) {
            if (link instanceof RelationLink && equalLinks(link.data, oldData)) {
                link.setData(newData);
            }
        }
        return changeRelationData(model, newData, oldData);
    });
}
