import { EventSource, Events, PropertyChange } from '../coreUtils/events';

import * as Rdf from '../data/rdf/rdfModel';
import {
    ElementModel, LinkModel, ElementTypeIri, LinkTypeIri, PropertyTypeIri,
} from '../data/model';
import { GenerateID } from '../data/schema';

import { Vector, isPolylineEqual } from './geometry';

export type Cell = Element | Link | LinkVertex;

export enum LinkDirection {
    in = 'in',
    out = 'out',
}

export interface ElementEvents {
    changeData: PropertyChange<Element, ElementModel>;
    changePosition: PropertyChange<Element, Vector>;
    changeExpanded: PropertyChange<Element, boolean>;
    changeGroup: PropertyChange<Element, string | undefined>;
    changeElementState: PropertyChange<Element, ElementTemplateState | undefined>;
    requestedFocus: { source: Element };
    requestedRedraw: { source: Element };
    requestedGroupContent: { source: Element };
}

export class Element {
    private readonly source = new EventSource<ElementEvents>();
    readonly events: Events<ElementEvents> = this.source;

    readonly id: string;

    private _data: ElementModel;
    private _position: Vector;
    private _expanded: boolean;
    private _group: string | undefined;
    private _elementState: ElementTemplateState | undefined;
    private _temporary: boolean;

    constructor(props: {
        id: string;
        data: ElementModel;
        position?: Vector;
        expanded?: boolean;
        group?: string;
        elementState?: ElementTemplateState;
        temporary?: boolean;
    }) {
        const {
            id,
            data,
            position = {x: 0, y: 0},
            expanded = false,
            group,
            elementState,
            temporary = false,
        } = props;

        this.id = id;
        this._data = data;
        this._position = position;
        this._expanded = expanded;
        this._group = group;
        this._elementState = elementState;
        this._temporary = temporary;
    }

    get iri() { return this._data.id; }

    get data() { return this._data; }
    setData(value: ElementModel) {
        const previous = this._data;
        if (previous === value) { return; }
        this._data = value;
        this.source.trigger('changeData', {source: this, previous});
    }

    get position(): Vector { return this._position; }
    setPosition(value: Vector) {
        const previous = this._position;
        const same = (
            previous.x === value.x &&
            previous.y === value.y
        );
        if (same) { return; }
        this._position = value;
        this.source.trigger('changePosition', {source: this, previous});
    }

    get isExpanded(): boolean { return this._expanded; }
    setExpanded(value: boolean) {
        const previous = this._expanded;
        if (previous === value) { return; }
        this._expanded = value;
        this.source.trigger('changeExpanded', {source: this, previous});
    }

    get group(): string | undefined { return this._group; }
    setGroup(value: string | undefined) {
        const previous = this._group;
        if (previous === value) { return; }
        this._group = value;
        this.source.trigger('changeGroup', {source: this, previous});
    }

    get elementState(): ElementTemplateState | undefined { return this._elementState; }
    setElementState(value: ElementTemplateState | undefined) {
        const previous = this._elementState;
        if (previous === value) { return; }
        this._elementState = value;
        this.source.trigger('changeElementState', {source: this, previous});
    }

    get temporary(): boolean { return this._temporary; }

    focus() {
        this.source.trigger('requestedFocus', {source: this});
    }

    redraw() {
        this.source.trigger('requestedRedraw', {source: this});
    }

    requestGroupContent() {
        this.source.trigger('requestedGroupContent', {source: this});
    }
}

export interface ElementTemplateState {
    [propertyIri: string]: unknown;
}

export interface AddToFilterRequest {
    element: Element;
    linkType?: RichLinkType;
    direction?: 'in' | 'out';
}

export interface LinkEvents {
    changeData: PropertyChange<Link, LinkModel>;
    changeLayoutOnly: PropertyChange<Link, boolean>;
    changeVertices: PropertyChange<Link, ReadonlyArray<Vector>>;
    changeLinkState: PropertyChange<Link, LinkTemplateState | undefined>;
}

export class Link {
    private readonly source = new EventSource<LinkEvents>();
    readonly events: Events<LinkEvents> = this.source;

    readonly id: string;

    private _sourceId: string;
    private _targetId: string;

    private _data: LinkModel;
    private _layoutOnly = false;
    private _vertices: ReadonlyArray<Vector>;

    private _linkState: LinkTemplateState | undefined;

    constructor(props: {
        id?: string;
        sourceId: string;
        targetId: string;
        data: LinkModel;
        vertices?: ReadonlyArray<Vector>;
        linkState?: LinkTemplateState;
    }) {
        const {id = GenerateID.forLink(), sourceId, targetId, data, vertices = [], linkState} = props;
        this.id = id;
        this._sourceId = sourceId;
        this._targetId = targetId;
        this._data = data;
        this._vertices = vertices;
        this._linkState = linkState;
    }

    get typeId() { return this._data?.linkTypeId; }
    get sourceId(): string { return this._sourceId; }
    get targetId(): string { return this._targetId; }

    get data() { return this._data; }
    setData(value: LinkModel) {
        const previous = this._data;
        if (previous === value) { return; }
        this._data = value;
        this.source.trigger('changeData', {source: this, previous});
    }

    get layoutOnly(): boolean { return this._layoutOnly; }
    setLayoutOnly(value: boolean) {
        const previous = this._layoutOnly;
        if (previous === value) { return; }
        this._layoutOnly = value;
        this.source.trigger('changeLayoutOnly', {source: this, previous});
    }

    get vertices(): ReadonlyArray<Vector> { return this._vertices; }
    setVertices(value: ReadonlyArray<Vector>) {
        const previous = this._vertices;
        if (isPolylineEqual(this._vertices, value)) { return; }
        this._vertices = value;
        this.source.trigger('changeVertices', {source: this, previous});
    }

    get linkState(): LinkTemplateState | undefined { return this._linkState; }
    setLinkState(value: LinkTemplateState | undefined) {
        const previous = this._linkState;
        if (previous === value) { return; }
        this._linkState = value;
        this.source.trigger('changeLinkState', {source: this, previous});
    }
}

export interface LinkTemplateState {
    [propertyIri: string]: unknown;
}

export function linkMarkerKey(linkTypeIndex: number, startMarker: boolean) {
    return `ramp-marker-${startMarker ? 'start' : 'end'}-${linkTypeIndex}`;
}

export function makeLinkWithDirection(original: Link, data: LinkModel): Link {
    if (!(data.sourceId === original.data.sourceId || data.sourceId === original.data.targetId)) {
        throw new Error('New link source IRI is unrelated to original link');
    }
    if (!(data.targetId === original.data.sourceId || data.targetId === original.data.targetId)) {
        throw new Error('New link target IRI is unrelated to original link');
    }
    const sourceId = data.sourceId === original.data.sourceId
        ? original.sourceId : original.targetId;
    const targetId = data.targetId === original.data.targetId
        ? original.targetId : original.sourceId;
    return new Link({sourceId, targetId, data});
}

export interface RichElementTypeEvents {
    changeLabel: PropertyChange<RichElementType, ReadonlyArray<Rdf.Literal>>;
    changeCount: PropertyChange<RichElementType, number | undefined>;
}

export class RichElementType {
    private readonly source = new EventSource<RichElementTypeEvents>();
    readonly events: Events<RichElementTypeEvents> = this.source;

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

export interface RichPropertyEvents {
    changeLabel: PropertyChange<RichProperty, ReadonlyArray<Rdf.Literal>>;
}

export class RichProperty {
    private readonly source = new EventSource<RichPropertyEvents>();
    readonly events: Events<RichPropertyEvents> = this.source;

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

export interface RichLinkTypeEvents {
    changeLabel: PropertyChange<RichLinkType, ReadonlyArray<Rdf.Literal>>;
    changeIsNew: PropertyChange<RichLinkType, boolean>;
    changeVisibility: { source: RichLinkType };
}

export class RichLinkType {
    private readonly source = new EventSource<RichLinkTypeEvents>();
    readonly events: Events<RichLinkTypeEvents> = this.source;

    readonly id: LinkTypeIri;

    private _index: number | undefined;

    private _label: ReadonlyArray<Rdf.Literal>;
    private _isNew = false;

    private _visible = true;
    private _showLabel = true;

    constructor(props: {
        id: LinkTypeIri;
        index?: number;
        label?: ReadonlyArray<Rdf.Literal>;
    }) {
        const {id, index, label = []} = props;
        this.id = id;
        this._index = index;
        this._label = label;
    }

    get index() { return this._index; }
    setIndex(value: number) {
        if (typeof this._index === 'number') {
            throw new Error('Cannot set index for link type more than once.');
        }
        this._index = value;
    }

    get label() { return this._label; }
    setLabel(value: ReadonlyArray<Rdf.Literal>) {
        const previous = this._label;
        if (previous === value) { return; }
        this._label = value;
        this.source.trigger('changeLabel', {source: this, previous});
    }

    get visible() { return this._visible; }
    get showLabel() { return this._showLabel; }
    setVisibility(params: {
        visible: boolean;
        showLabel: boolean;
    }) {
        const same = (
            this._visible === params.visible &&
            this._showLabel === params.showLabel
        );
        if (same) { return; }
        this._visible = params.visible;
        this._showLabel = params.showLabel;
        this.source.trigger('changeVisibility', {source: this});
    }

    get isNew() { return this._isNew; }
    setIsNew(value: boolean) {
        const previous = this._isNew;
        if (previous === value) { return; }
        this._isNew = value;
        this.source.trigger('changeIsNew', {source: this, previous});
    }
}

export class LinkVertex {
    constructor(
        readonly link: Link,
        readonly vertexIndex: number,
    ) {}

    createAt(location: Vector) {
        const vertices = [...this.link.vertices];
        vertices.splice(this.vertexIndex, 0, location);
        this.link.setVertices(vertices);
    }

    moveTo(location: Vector) {
        const vertices = [...this.link.vertices];
        vertices.splice(this.vertexIndex, 1, location);
        this.link.setVertices(vertices);
    }

    remove() {
        const vertices = [...this.link.vertices];
        const [location] = vertices.splice(this.vertexIndex, 1);
        this.link.setVertices(vertices);
    }
}
