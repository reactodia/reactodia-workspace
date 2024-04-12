import { EventSource, Events, PropertyChange } from '../coreUtils/events';

import * as Rdf from '../data/rdf/rdfModel';
import { ElementTypeIri, LinkTypeIri, PropertyTypeIri } from '../data/model';
import { GenerateID } from '../data/schema';

import { Vector, isPolylineEqual } from './geometry';

export type Cell = Element | Link | LinkVertex;

export interface ElementEvents {
    changePosition: PropertyChange<Element, Vector>;
    changeExpanded: PropertyChange<Element, boolean>;
    changeElementState: PropertyChange<Element, ElementTemplateState | undefined>;
    requestedFocus: { source: Element };
    requestedRedraw: {
        source: Element;
        /** @default "render" */
        level?: ElementRedrawLevel;
    };
}

export type ElementRedrawLevel = 'render' | 'template';

export interface ElementProps {
    id?: string;
    position?: Vector;
    expanded?: boolean;
    elementState?: ElementTemplateState;
}

/**
 * Abstract base class for diagram elements (nodes).
 */
export abstract class Element {
    protected readonly source = new EventSource<ElementEvents>();
    readonly events: Events<ElementEvents> = this.source;

    readonly id: string;

    private _position: Vector;
    private _expanded: boolean;
    private _elementState: ElementTemplateState | undefined;

    constructor(props: ElementProps) {
        const {
            id = GenerateID.forElement(),
            position = {x: 0, y: 0},
            expanded = false,
            elementState,
        } = props;

        this.id = id;
        this._position = position;
        this._expanded = expanded;
        this._elementState = elementState;
    }

    get types(): ReadonlyArray<ElementTypeIri> {
        return this.getTypes();
    }

    protected abstract getTypes(): ReadonlyArray<ElementTypeIri>;

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

    get elementState(): ElementTemplateState | undefined { return this._elementState; }
    setElementState(value: ElementTemplateState | undefined) {
        const previous = this._elementState;
        if (previous === value) { return; }
        this._elementState = value;
        this.source.trigger('changeElementState', {source: this, previous});
    }

    focus() {
        this.source.trigger('requestedFocus', {source: this});
    }

    redraw(level?: ElementRedrawLevel) {
        this.source.trigger('requestedRedraw', {source: this, level});
    }
}

/**
 * Diagram element represented by an invisible single point.
 */
export class VoidElement extends Element {
    static readonly TYPE = 'urn:reactodia:VoidElement' as ElementTypeIri;

    private static readonly TYPES = [VoidElement.TYPE];

    constructor(props: Pick<ElementProps, 'id' | 'position'>) {
        super(props);
    }

    protected override getTypes(): ReadonlyArray<ElementTypeIri> {
        return VoidElement.TYPES;
    }
}

export interface ElementTemplateState {
    [propertyIri: string]: unknown;
}

export interface LinkEvents {
    changeVertices: PropertyChange<Link, ReadonlyArray<Vector>>;
    changeLinkState: PropertyChange<Link, LinkTemplateState | undefined>;
    requestedRedraw: {
        source: Link;
        /** @default "render" */
        level?: ElementRedrawLevel;
    };
}

export type LinkRedrawLevel = 'render' | 'template';

export interface LinkProps {
    id?: string;
    sourceId: string;
    targetId: string;
    vertices?: ReadonlyArray<Vector>;
    linkState?: LinkTemplateState;
}

export abstract class Link {
    protected readonly source = new EventSource<LinkEvents>();
    readonly events: Events<LinkEvents> = this.source;

    readonly id: string;

    private _sourceId: string;
    private _targetId: string;

    private _vertices: ReadonlyArray<Vector>;

    private _linkState: LinkTemplateState | undefined;

    constructor(props: LinkProps) {
        const {
            id = GenerateID.forLink(),
            sourceId,
            targetId,
            vertices = [],
            linkState,
        } = props;
        this.id = id;
        this._sourceId = sourceId;
        this._targetId = targetId;
        this._vertices = vertices;
        this._linkState = linkState;
    }

    get sourceId(): string { return this._sourceId; }
    get targetId(): string { return this._targetId; }
    get typeId(): LinkTypeIri {
        return this.getTypeId();
    }

    protected abstract getTypeId(): LinkTypeIri;

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

    redraw(level?: LinkRedrawLevel) {
        this.source.trigger('requestedRedraw', {source: this, level});
    }
}

export interface LinkTemplateState {
    [propertyIri: string]: unknown;
}

export function linkMarkerKey(linkTypeIndex: number, startMarker: boolean) {
    return `ramp-marker-${startMarker ? 'start' : 'end'}-${linkTypeIndex}`;
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
    changeIsNew: PropertyChange<LinkType, boolean>;
    changeVisibility: PropertyChange<LinkType, LinkTypeVisibility>;
}

export type LinkTypeVisibility = 'hidden' | 'withoutLabel' | 'visible';

export class LinkType {
    private readonly source = new EventSource<LinkTypeEvents>();
    readonly events: Events<LinkTypeEvents> = this.source;

    readonly id: LinkTypeIri;

    private _index: number | undefined;

    private _label: ReadonlyArray<Rdf.Literal>;

    private _visibility: LinkTypeVisibility = 'visible';

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

    get visibility() {
        return this._visibility;
    }
    setVisibility(value: LinkTypeVisibility) {
        const previous = this._visibility;
        if (previous === value) { return; }
        this._visibility = value;
        this.source.trigger('changeVisibility', {source: this, previous});
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
