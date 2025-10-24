import { EventSource, Events, PropertyChange } from '../coreUtils/events';

import { LinkTypeIri } from '../data/model';
import { TemplateProperties } from '../data/schema';
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
    /**
     * Unique and immutable {@link Element.id element ID}.
     *
     * If not specified, {@link Element.generateId()} is used to create one.
     */
    id?: string;
    /**
     * Initial value for the {@link Element.position element position}.
     */
    position?: Vector;
    /**
     * Initial value for the {@link Element.isExpanded} state.
     *
     * If specified as `true`, the value is added to the {@link Element.elementState}
     * with {@link TemplateProperties.Expanded} property.
     */
    expanded?: boolean;
    /**
     * Initial value for the {@link Element.elementState element template state}.
     */
    elementState?: ElementTemplateState;
}

/**
 * Abstract base class for diagram elements (graph nodes).
 *
 * @category Core
 */
export abstract class Element {
    /**
     * Event source to trigger events from derived element types.
     */
    protected readonly source = new EventSource<ElementEvents>();
    /**
     * Events for the graph element.
     */
    readonly events: Events<ElementEvents> = this.source;

    /**
     * Unique and immutable element ID on the diagram.
     */
    readonly id: string;

    private _position: Vector;
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
        this._elementState = expanded
            ? {...elementState, [TemplateProperties.Expanded]: expanded}
            : elementState;
    }

    /**
     * Generates a new unique ID for an element.
     */
    static generateId(): string {
        return `urn:reactodia:e:${generate128BitID()}`;
    }

    /**
     * Gets the element position on the canvas in paper coordinates. 
     */
    get position(): Vector {
        return this._position;
    }

    /**
     * Sets a new value for {@link position} property.
     *
     * Triggers {@link ElementEvents.changePosition} event if new value does
     * not equal to the previous one.
     *
     * @see {@link RestoreGeometry}
     */
    setPosition(value: Vector): void {
        const previous = this._position;
        const same = (
            previous.x === value.x &&
            previous.y === value.y
        );
        if (same) { return; }
        this._position = value;
        this.source.trigger('changePosition', {source: this, previous});
    }

    /**
     * Whether the element should be displayed as expanded
     * (as defined by the element template).
     *
     * Expanded state is stored in the {@link Element.elementState element state}
     * with {@link TemplateProperties.Expanded} property.
     */
    get isExpanded(): boolean {
        return Boolean(this._elementState?.[TemplateProperties.Expanded]);
    }

    /**
     * Sets a new value for {@link isExpanded} property.
     *
     * Expanded state is stored in the {@link Element.elementState element state}
     * with {@link TemplateProperties.Expanded} property.
     *
     * Triggers {@link ElementEvents.changeElementState} event if new value does
     * not equal to the previous one.
     */
    setExpanded(value: boolean): void {
        if (value && !this._elementState?.[TemplateProperties.Expanded]) {
            this.setElementState({...this._elementState, [TemplateProperties.Expanded]: true});
        } else if (!value && this._elementState?.[TemplateProperties.Expanded]) {
            const {[TemplateProperties.Expanded]: _, ...withoutExpanded} = this._elementState;
            this.setElementState(withoutExpanded);
        }
    }

    /**
     * Gets a serializable template-specific state for the element.
     */
    get elementState(): ElementTemplateState | undefined {
        return this._elementState;
    }

    /**
     * Sets a new value for {@link elementState} property.
     *
     * Triggers {@link ElementEvents.changeElementState} event if new value does
     * not equal to the previous one.
     */
    setElementState(value: ElementTemplateState | undefined): void {
        const previous = this._elementState;
        if (previous === value) { return; }
        this._elementState = value;
        this.source.trigger('changeElementState', {source: this, previous});
    }

    /**
     * Focuses on the element template on a canvas (if possible).
     */
    focus(): void {
        this.source.trigger('requestedFocus', {source: this});
    }

    /**
     * Forces a re-render of the element displayed by a template on a canvas.
     *
     * @param level specifies which cached state should be invalidated on re-render
     */
    redraw(level?: ElementRedrawLevel): void {
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
    /**
     * Unique and immutable {@link Link.id link ID}.
     *
     * If not specified, {@link Link.generateId()} is used to create one.
     */
    id?: string;
    /**
     * An immutable link {@link Link.sourceId source} ({@link Element.id element ID}).
     */
    sourceId: string;
    /**
     * An immutable link {@link Link.targetId target} ({@link Element.id element ID}).
     */
    targetId: string;
    /**
     * Initial value for the {@link Link.vertices link vertices (geometry)}.
     */
    vertices?: ReadonlyArray<Vector>;
    /**
     * Initial value for the {@link Link.linkState link template state}.
     */
    linkState?: LinkTemplateState;
}

/**
 * Abstract base class for diagram links (graph edges)
 *
 * @category Core
 */
export abstract class Link {
    /**
     * Event source to trigger events from derived link types.
     */
    protected readonly source = new EventSource<LinkEvents>();
    /**
     * Events for the graph link.
     */
    readonly events: Events<LinkEvents> = this.source;

    /**
     * Unique and immutable link ID on the diagram.
     */
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

    /**
     * Gets an immutable link source {@link Element.id element ID}.
     */
    get sourceId(): string {
        return this._sourceId;
    }

    /**
     * Gets an immutable link target {@link Element.id element ID}.
     */
    get targetId(): string {
        return this._targetId;
    }

    /**
     * Gets the link type IRI.
     */
    get typeId(): LinkTypeIri {
        return this.getTypeId();
    }

    /**
     * Should return the link type IRI.
     *
     * For derived link types without natural type IRIs the synthetic IRIs can be
     * used, e.g. `my:custom:link`.
     */
    protected abstract getTypeId(): LinkTypeIri;

    /**
     * Gets the link geometry (intermediate points in paper coordinates in order
     * from the link source to the target).
     */
    get vertices(): ReadonlyArray<Vector> {
        return this._vertices;
    }

    /**
     * Sets a new value for {@link vertices} property.
     *
     * Triggers {@link LinkEvents.changeVertices} event if new geometry
     * does not equal to the previous one.
     *
     * @see {@link RestoreGeometry}
     * @see {@link restoreCapturedLinkGeometry()}
     */
    setVertices(value: ReadonlyArray<Vector>): void {
        const previous = this._vertices;
        if (isPolylineEqual(this._vertices, value)) { return; }
        this._vertices = value;
        this.source.trigger('changeVertices', {source: this, previous});
    }

    /**
     * Gets a serializable template-specific state for the link.
     */
    get linkState(): LinkTemplateState | undefined {
        return this._linkState;
    }

    /**
     * Sets a new value for {@link linkState} property.
     *
     * Triggers {@link LinkEvents.changeLinkState} event if new value does
     * not equal to the previous one.
     */
    setLinkState(value: LinkTemplateState | undefined): void {
        const previous = this._linkState;
        if (previous === value) { return; }
        this._linkState = value;
        this.source.trigger('changeLinkState', {source: this, previous});
    }

    /**
     * Forces a re-render of the link displayed by a template on a canvas.
     */
    redraw(): void {
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
