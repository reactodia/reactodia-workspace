import { Events, EventSource, PropertyChange } from '../coreUtils/events';

import {
    ElementIri, ElementModel, ElementTypeIri, LinkModel, LinkTypeIri, PropertyTypeIri,
    equalLinks,
} from '../data/model';
import * as Rdf from '../data/rdf/rdfModel';

import {
    Element, ElementEvents, ElementProps,
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
    changeLabel: PropertyChange<ElementType, ReadonlyArray<Rdf.Literal>>;
    changeCount: PropertyChange<ElementType, number | undefined>;
}

export class ElementType {
    private readonly source = new EventSource<ElementTypeEvents>();
    readonly events: Events<ElementTypeEvents> = this.source;

    readonly id: ElementTypeIri;

    private _label: ReadonlyArray<Rdf.Literal>;
    private _count: number | undefined;

    constructor(props: {
        id: ElementTypeIri;
        label?: ReadonlyArray<Rdf.Literal>;
        count?: number;
    }) {
        const {id, label = [], count} = props;
        this.id = id;
        this._label = label;
        this._count = count;
    }

    get label() { return this._label; }
    setLabel(value: ReadonlyArray<Rdf.Literal>) {
        const previous = this._label;
        if (previous === value) { return; }
        this._label = value;
        this.source.trigger('changeLabel', {source: this, previous});
    }

    get count() { return this._count; }
    setCount(value: number | undefined) {
        const previous = this._count;
        if (previous === value) { return; }
        this._count = value;
        this.source.trigger('changeCount', {source: this, previous});
    }
}

export interface PropertyTypeEvents {
    changeLabel: PropertyChange<PropertyType, ReadonlyArray<Rdf.Literal>>;
}

export class PropertyType {
    private readonly source = new EventSource<PropertyTypeEvents>();
    readonly events: Events<PropertyTypeEvents> = this.source;

    readonly id: PropertyTypeIri;

    private _label: ReadonlyArray<Rdf.Literal>;

    constructor(props: {
        id: PropertyTypeIri;
        label?: ReadonlyArray<Rdf.Literal>;
    }) {
        const {id, label = []} = props;
        this.id = id;
        this._label = label;
    }

    get label(): ReadonlyArray<Rdf.Literal> { return this._label; }
    setLabel(value: ReadonlyArray<Rdf.Literal>) {
        const previous = this._label;
        if (previous === value) { return; }
        this._label = value;
        this.source.trigger('changeLabel', {source: this, previous});
    }
}

export interface LinkTypeEvents {
    changeLabel: PropertyChange<LinkType, ReadonlyArray<Rdf.Literal>>;
}

export class LinkType {
    private readonly source = new EventSource<LinkTypeEvents>();
    readonly events: Events<LinkTypeEvents> = this.source;

    readonly id: LinkTypeIri;

    private _label: ReadonlyArray<Rdf.Literal>;

    constructor(props: {
        id: LinkTypeIri;
        label?: ReadonlyArray<Rdf.Literal>;
    }) {
        const {id, label = []} = props;
        this.id = id;
        this._label = label;
    }

    get label() { return this._label; }
    setLabel(value: ReadonlyArray<Rdf.Literal>) {
        const previous = this._label;
        if (previous === value) { return; }
        this._label = value;
        this.source.trigger('changeLabel', {source: this, previous});
    }
}

export function setElementData(model: DiagramModel, target: ElementIri, data: ElementModel): Command {
    const command = Command.create('Set element data', () => {
        const previous = new Map<EntityElement, ElementModel>();
        for (const element of model.elements.filter(
            (el): el is EntityElement => el instanceof EntityElement && el.iri === target)
        ) {
            const previousIri = element.iri;
            previous.set(element, element.data);
            element.setData(data);
            updateLinksToReferByNewIri(model, element, previousIri, data.id);
        }
        return Command.create('Revert element data', () => {
            for (const [element, previousData] of previous) {
                const newIri = element.iri;
                element.setData(previousData);
                updateLinksToReferByNewIri(model, element, newIri, previousData.id);
            }
            return command;
        });
    });
    return command;
}

function updateLinksToReferByNewIri(model: DiagramModel, element: EntityElement, oldIri: ElementIri, newIri: ElementIri) {
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
