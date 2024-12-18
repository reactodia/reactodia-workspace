import { EventSource, Events, PropertyChange } from '../coreUtils/events';

import { LinkTypeIri } from '../data/model';
import { generate128BitID } from '../data/utils';

import { Vector, isPolylineEqual } from './geometry';

/**
 * Represents a diagram content object that can be interacted with.
 *
 * @category Core
 */
export type Cell = Element | Link | LinkVertex;

/**
 * Event data for{@link Element} events.
 */
export interface ElementEvents {
    /**
     * Triggered on {@link Element.position} property change.
     */
    changePosition: PropertyChange<Element, Vector>;
    /**
     * Triggered on {@link Element.isExpanded} property change.
     */
    changeExpanded: PropertyChange<Element, boolean>;
    /**
     * Triggered on {@link Element.elementState} property change.
     */
    changeElementState: PropertyChange<Element, ElementTemplateState | undefined>;
    /**
     * Triggered on a request to set DOM focus on the element.
     */
    requestedFocus: {
        /**
         * Event source (element).
         */
        readonly source: Element;
    };
    /**
     * Triggered on a request to re-render element on a canvas.
     *
     * @see {@link Element.redraw}
     */
    requestedRedraw: {
        /**
         * Event source (element).
         */
        readonly source: Element;
        /**
         * Element re-render level: which cached state should be invalidated
         * when redrawing it on a canvas.
         *
         * @default "render"
         */
        readonly level?: ElementRedrawLevel;
    };
}

/**
 * Specifies which cached state should be invalidated
 * when redrawing an element on a canvas:
 *   - `render` - force render only on a wrapping component,
 *     skipping element template render if template type has not changed;
 *   - `template` - full element render including its template component.
 *
 * @see {@link Element.redraw}
 */
export type ElementRedrawLevel = 'render' | 'template';

/**
 * Properties for {@link Element}.
 */
export interface ElementProps {
    id?: string;
    position?: Vector;
    expanded?: boolean;
    elementState?: ElementTemplateState;
}

/**
 * Abstract base class for diagram elements (graph nodes).
 *
 * @category Core
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
            id = Element.generateId(),
            position = {x: 0, y: 0},
            expanded = false,
            elementState,
        } = props;

        this.id = id;
        this._position = position;
        this._expanded = expanded;
        this._elementState = elementState;
    }

    /**
     * Generates a new unique ID for an element.
     */
    static generateId(): string {
        return `urn:reactodia:e:${generate128BitID()}`;
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
 * Contains a template-specific state for an element.
 *
 * Each property value should be JSON-serializable to be able
 * to export and import it as part of the serialized diagram layout.
 */
export interface ElementTemplateState {
    [propertyIri: string]: unknown;
}

/**
 * Diagram element represented by an invisible single point.
 *
 * @category Core
 */
export class VoidElement extends Element {
    constructor(props: Pick<ElementProps, 'id' | 'position'>) {
        super(props);
    }
}

/**
 * Event data for {@link Link} events.
 */
export interface LinkEvents {
    /**
     * Triggered on {@link Link.vertices} property change.
     */
    changeVertices: PropertyChange<Link, ReadonlyArray<Vector>>;
    /**
     * Triggered on {@link Link.linkState} property change.
     */
    changeLinkState: PropertyChange<Link, LinkTemplateState | undefined>;
    /**
     * Triggered on a request to re-render link on a canvas.
     *
     * @see {@link Link.redraw}
     */
    requestedRedraw: {
        /**
         * Event source (link).
         */
        readonly source: Link;
    };
}

/**
 * Properties for {@link Link}.
 */
export interface LinkProps {
    id?: string;
    sourceId: string;
    targetId: string;
    vertices?: ReadonlyArray<Vector>;
    linkState?: LinkTemplateState;
}

/**
 * Abstract base class for diagram links (graph edges)
 *
 * @category Core
 */
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
            id = Link.generateId(),
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

    /**
     * Generates a new unique ID for an link.
     */
    static generateId(): string {
        return `urn:reactodia:l:${generate128BitID()}`;
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

    redraw() {
        this.source.trigger('requestedRedraw', {source: this});
    }
}

/**
 * Contains a template-specific state for a link.
 *
 * Each property value should be JSON-serializable to be able
 * to export and import it as part of the serialized diagram layout.
 */
export interface LinkTemplateState {
    [propertyIri: string]: unknown;
}

/**
 * Visibility mode for all links of a type:
 *   - `hidden` - completely skip rendering the links;
 *   - `visible` - display the links normally;
 *   - `withoutLabel` - display only the link path without any labels.
 */
export type LinkTypeVisibility = 'hidden' | 'visible' | 'withoutLabel';

/**
 * Represents a convenient way to refer to a particular vertex of a diagram link.
 *
 * @category Core
 */
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
