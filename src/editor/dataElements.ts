import { Events, EventSource, PropertyChange } from '../coreUtils/events';
import { ElementIri, ElementModel, ElementTypeIri, LinkModel, LinkTypeIri, equalLinks } from '../data/model';
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

    static is(element: Element): element is EntityElement {
        return element instanceof EntityElement;
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

    protected override getTypes(): ReadonlyArray<ElementTypeIri> {
        return this.data.types;
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

    static is(link: Link): link is RelationLink {
        return link instanceof RelationLink;
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
