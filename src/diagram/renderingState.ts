import { HashMap } from '@reactodia/hashmap';
import * as React from 'react';

import { multimapAdd, multimapDelete } from '../coreUtils/collections';
import { Events, EventObserver, EventSource, PropertyChange } from '../coreUtils/events';
import {
    type HotkeyAst, formatHotkey, sameHotkeyAst, hashHotkeyAst, eventToHotkeyAst,
} from '../coreUtils/hotkey';
import { Debouncer } from '../coreUtils/scheduler';

import {
    ElementTemplate, ElementTemplateComponent, ElementTemplateResolver, LinkTemplateResolver,
    LinkTemplate, LinkRouter, RoutedLink, RoutedLinks,
} from './customization';

import { LinkTypeIri } from '../data/model';

import { Element, Link } from './elements';
import { Rect, ShapeGeometry, Size, SizeProvider, boundsOf, isPolylineEqual } from './geometry';
import { DefaultLinkRouter } from './linkRouter';
import { DiagramModel } from './model';
import { SharedCanvasState } from './sharedCanvasState';

/** @hidden */
export interface RenderingStateOptions {
    model: DiagramModel;
    shared: SharedCanvasState;
    elementTemplateResolver?: ElementTemplateResolver;
    linkTemplateResolver?: LinkTemplateResolver;
    linkRouter?: LinkRouter;
}

/**
 * Event data for {@link RenderingState} events.
 *
 * @see {@link RenderingState}
 */
export interface RenderingStateEvents {
    /**
     * Triggered on a request to synchronously render on a specific layer.
     */
    syncUpdate: {
        /**
         * Target layer to render on.
         */
        readonly layer: RenderingLayer;
    };
    /**
     * Triggered on {@link RenderingState.getLinkTemplates} property change.
     */
    changeLinkTemplates: {
        /**
         * Event source (rendering state).
         */
        readonly source: RenderingState;
    };
    /**
     * Triggered when an element size has changed.
     *
     * Element size changes happen when rendering on
     * {@link RenderingLayer.ElementSize ElementSize} layer.
     */
    changeElementSize: PropertyChange<Element, Size | undefined>;
    /**
     * Triggered when a primary label size for a link has changed.
     *
     * Link label size changes happen when rendering on
     * {@link RenderingLayer.LinkLabel LinkLabel} layer.
     */
    changeLinkLabelBounds: PropertyChange<Link, Rect | undefined>;
    /**
     * Triggered on {@link RenderingState.getRoutings} property change.
     */
    changeRoutings: PropertyChange<RenderingState, RoutedLinks>;
}

/**
 * Defines a rendering order which consists of multiple layers.
 *
 * The layers are organized in such way that changes from an earlier layer
 * only affect rendering on the later layers. This way the full rendering
 * could be done by rendering on each layer in order.
 */
export enum RenderingLayer {
    /**
     * Layer to render element templates.
     */
    Element = 1,
    /**
     * Layer to measure rendered elements to get their sizes.
     */
    ElementSize,
    /**
     * Layer to adjust scrollable area for the underlying canvas.
     */
    PaperArea,
    /**
     * Layer to route links (compute link geometry).
     */
    LinkRoutes,
    /**
     * Layer to render link templates.
     */
    Link,
    /**
     * Layer to measure rendered link labels to get their sizes.
     */
    LinkLabel,
    /**
     * Layer to update additional content placed on the diagram cells.
     */
    Overlay,
}

const FIRST_LAYER = RenderingLayer.Element;
const LAST_LAYER = RenderingLayer.Overlay;

const DEFAULT_ELEMENT_TEMPLATE_RESOLVER: ElementTemplateResolver = types => undefined;
const DEFAULT_LINK_TEMPLATE_RESOLVER: LinkTemplateResolver = type => undefined;

/**
 * Stores current rendering state for a single canvas.
 *
 * @category Core
 */
export interface RenderingState extends SizeProvider {
    /**
     * Events for the rendering state.
     */
    readonly events: Events<RenderingStateEvents>;
    /**
     * Shared state for all canvases rendering the same model.
     */
    readonly shared: SharedCanvasState;
    /**
     * Request to synchronously render the canvas, performing any
     * previously deferred updates.
     *
     * This method should be used before reading from the rendering state
     * after any render-impacting change was made to the diagram content.
     *
     * **Example**:
     * ```ts
     * // Add new element to the diagram
     * model.addElement(someElement);
     * // Force synchronous render
     * view.syncUpdate();
     * // Read rendered element size
     * const computedSize = view.getElementSize(someElement);
     * ```
     */
    syncUpdate(): void;
    /**
     * Returns computed element size in paper coordinates.
     */
    getElementSize(element: Element): Size | undefined;
    /**
     * Returns computed bounds for a link primary label in paper coordinates.
     */
    getLinkLabelBounds(link: Link): Rect | undefined;
    /**
     * Resolve template component for the element.
     */
    getElementTemplate(element: Element): ElementTemplate;
    /**
     * Returns link templates for all types of rendered links.
     */
    getLinkTemplates(): ReadonlyMap<LinkTypeIri, LinkTemplate>;
    /**
     * Returns route data for all links in the graph.
     */
    getRoutings(): ReadonlyMap<string, RoutedLink>;
    /**
     * Return route data for a specific link in the graph.
     */
    getRouting(linkId: string): RoutedLink | undefined;
}

export class MutableRenderingState implements RenderingState {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<RenderingStateEvents>();
    readonly events: Events<RenderingStateEvents> = this.source;

    private readonly model: DiagramModel;
    private readonly resolveElementTemplate: ElementTemplateResolver;
    private readonly resolveLinkTemplate: LinkTemplateResolver;
    private readonly mappedTemplates = new WeakMap<ElementTemplateComponent, ElementTemplate>();
    private readonly linkRouter: LinkRouter;

    private readonly decorationContainers = new WeakMap<Element | Link, HTMLDivElement>();

    private readonly elementSizes = new WeakMap<Element, Size>();
    private readonly linkLabelContainer = document.createElement('div');
    private readonly linkLabelBounds = new WeakMap<Link, Rect>();

    private readonly linkTypeIndex = new Map<LinkTypeIri, number>();
    private static nextLinkTypeIndex = 0;

    private readonly linkTemplates = new Map<LinkTypeIri, LinkTemplate>();
    private readonly delayedUpdateRoutings = new Debouncer();
    private routings: RoutedLinks = new Map<string, RoutedLink>();

    private readonly hotkeyHandlers = new HashMap<HotkeyAst, Set<() => void>>(
        hashHotkeyAst, sameHotkeyAst
    );

    readonly shared: SharedCanvasState;

    /** @hidden */
    constructor(options: RenderingStateOptions) {
        this.model = options.model;
        this.shared = options.shared;
        this.resolveElementTemplate = options.elementTemplateResolver
            ?? DEFAULT_ELEMENT_TEMPLATE_RESOLVER;
        this.resolveLinkTemplate = options.linkTemplateResolver
            ?? DEFAULT_LINK_TEMPLATE_RESOLVER;
        this.linkRouter = options.linkRouter ?? new DefaultLinkRouter();

        this.listener.listen(this.model.events, 'changeCells', () =>  this.scheduleUpdateRoutings());
        this.listener.listen(this.model.events, 'linkEvent', ({data}) => {
            if (data.changeVertices) {
                this.scheduleUpdateRoutings();
            }
        });
        this.listener.listen(this.model.events, 'elementEvent', ({data}) => {
            if (data.changePosition) {
                this.scheduleUpdateRoutings();
            }
        });
        this.listener.listen(this.model.events, 'changeLinkVisibility', e => {
            this.scheduleUpdateRoutings();
        });
        this.listener.listen(this.model.events, 'discardGraph', () => {
            this.linkTemplates.clear();

            const routings = this.routings;
            this.routings = new Map();
            this.delayedUpdateRoutings.dispose();

            this.source.trigger('changeLinkTemplates', {source: this});
            this.source.trigger('changeRoutings', {source: this, previous: routings});
        });
        this.listener.listen(this.events, 'changeElementSize', () => {
            this.scheduleUpdateRoutings();
        });
        this.listener.listen(this.events, 'syncUpdate', ({layer}) => {
            if (layer === RenderingLayer.LinkRoutes) {
                this.delayedUpdateRoutings.runSynchronously();
            }
        });

        this.updateRoutings();
    }

    /** @hidden */
    dispose() {
        this.listener.stopListening();
        this.delayedUpdateRoutings.dispose();
    }

    syncUpdate() {
        for (let layer = FIRST_LAYER; layer <= LAST_LAYER; layer++) {
            this.source.trigger('syncUpdate', {layer});
        }
    }

    ensureDecorationContainer(target: Element | Link): HTMLDivElement {
        let container = this.decorationContainers.get(target);
        if (!container) {
            container = document.createElement('div');
            this.decorationContainers.set(target, container);
        }
        return container;
    }

    getElementSize(element: Element): Size | undefined {
        return this.elementSizes.get(element);
    }

    setElementSize(element: Element, size: Size): void {
        const previous = this.elementSizes.get(element);
        const sameSize = (
            previous &&
            previous.width === size.width &&
            previous.height === size.height
        );
        if (!sameSize) {
            const decorationContainer = this.ensureDecorationContainer(element);
            decorationContainer.style = `width: ${size.width}px; height: ${size.height}px`;

            this.elementSizes.set(element, size);
            this.source.trigger('changeElementSize', {source: element, previous});
        }
    }

    attachLinkLabelContainer(parent: HTMLElement | null): void {
        if (parent) {
            if (this.linkLabelContainer.parentElement) {
                throw new Error('Cannot attach link label container to multiple parents');
            }
            parent.appendChild(this.linkLabelContainer);
        } else {
            if (this.linkLabelContainer.parentElement) {
                this.linkLabelContainer.parentElement.removeChild(this.linkLabelContainer);
            }
        }
    }

    getLinkLabelContainer(): HTMLElement {
        return this.linkLabelContainer;
    }

    getLinkLabelBounds(link: Link): Rect | undefined {
        return this.linkLabelBounds.get(link);
    }

    setLinkLabelBounds(link: Link, bounds: Rect | undefined): void {
        const previous = this.linkLabelBounds.get(link);
        const sameBounds = !previous && !bounds || (
            previous && bounds &&
            Rect.equals(previous, bounds)
        );
        if (!sameBounds) {
            if (bounds) {
                this.linkLabelBounds.set(link, bounds);
            } else {
                this.linkLabelBounds.delete(link);
            }
            this.source.trigger('changeLinkLabelBounds', {source: link, previous});
        }
    }

    getElementTemplate(element: Element): ElementTemplate {
        let resolved = this.resolveElementTemplate(element);
        if (typeof resolved === 'function') {
            let mapped = this.mappedTemplates.get(resolved);
            if (!mapped) {
                const component = resolved;
                mapped = {renderElement: props => React.createElement(component, props)};
                this.mappedTemplates.set(resolved, mapped);
            }
            resolved = mapped;
        }
        return resolved ?? this.shared.defaultElementTemplate;
    }

    getElementShape(element: Element): ShapeGeometry {
        const template = this.getElementTemplate(element);
        const bounds = boundsOf(element, this);
        return {
            type: template.shape ?? 'rect',
            bounds,
        };
    }

    ensureLinkTypeIndex(linkTypeId: LinkTypeIri): number {
        let typeIndex = this.linkTypeIndex.get(linkTypeId);
        if (typeIndex === undefined) {
            typeIndex = MutableRenderingState.nextLinkTypeIndex++;
            this.linkTypeIndex.set(linkTypeId, typeIndex);
        }
        return typeIndex;
    }

    getLinkTemplates(): ReadonlyMap<LinkTypeIri, LinkTemplate> {
        return this.linkTemplates;
    }

    createLinkTemplate(linkTypeId: LinkTypeIri): LinkTemplate {
        const existingTemplate = this.linkTemplates.get(linkTypeId);
        if (existingTemplate) {
            return existingTemplate;
        }

        const template = this.resolveLinkTemplate(linkTypeId)
            ?? this.shared.defaultLinkTemplate;
        this.linkTemplates.set(linkTypeId, template);
        this.source.trigger('changeLinkTemplates', {source: this});
        return template;
    }

    getRoutings(): ReadonlyMap<string, RoutedLink> {
        return this.routings;
    }

    getRouting(linkId: string): RoutedLink | undefined {
        return this.routings.get(linkId);
    }

    private scheduleUpdateRoutings() {
        this.delayedUpdateRoutings.call(this.updateRoutings);
    }

    private updateRoutings = () => {
        const previousRoutes = this.routings;
        const computedRoutes = this.linkRouter.route(this.model, this);
        previousRoutes.forEach((previous, linkId) => {
            const computed = computedRoutes.get(linkId);
            if (computed && sameRoutedLink(previous, computed)) {
                // replace new route with the old one if they're equal
                // so other components can use a simple reference equality checks
                computedRoutes.set(linkId, previous);
            }
        });
        this.routings = computedRoutes;
        this.source.trigger('changeRoutings', {source: this, previous: previousRoutes});
    };

    listenHotkey(ast: HotkeyAst, handler: () => void): () => void {
        multimapAdd(this.hotkeyHandlers, ast, handler);
        if (this.hotkeyHandlers.get(ast)!.size === 2) {
            console.warn(
                'Reactodia: registered multiple handlers for the same hotkey ' +
                `"${formatHotkey(ast)}" but only the first one will run if triggered.`
            );
        }
        return () => {
            multimapDelete(this.hotkeyHandlers, ast, handler);
        };
    }

    triggerHotkey(e: React.KeyboardEvent | KeyboardEvent): void {
        if (e.repeat) {
            return;
        }
        const pressAst = eventToHotkeyAst(e);
        const handlers = this.hotkeyHandlers.get(pressAst);
        if (handlers) {
            for (const handler of handlers) {
                e.preventDefault();
                handler();
                // Use only the first handler and skip the rest
                break;
            }
        }
    }
}

function sameRoutedLink(a: RoutedLink, b: RoutedLink): boolean {
    return (
        a.linkId === b.linkId &&
        a.labelTextAnchor === b.labelTextAnchor &&
        isPolylineEqual(a.vertices, b.vertices)
    );
}
