import { EventSource, Events, PropertyChange } from '../coreUtils/events';

import { LinkTypeIri } from '../data/model';
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
    constructor(props: Pick<ElementProps, 'id' | 'position'>) {
        super(props);
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

export type LinkTypeVisibility = 'hidden' | 'withoutLabel' | 'visible';

export function linkMarkerKey(linkTypeIndex: number, startMarker: boolean) {
    return `ramp-marker-${startMarker ? 'start' : 'end'}-${linkTypeIndex}`;
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
