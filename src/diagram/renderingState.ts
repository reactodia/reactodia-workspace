import { Events, EventObserver, EventSource, PropertyChange } from '../coreUtils/events';
import { Debouncer } from '../coreUtils/scheduler';

import {
    ElementTemplateResolver, LinkTemplateResolver, ElementTemplate, LinkTemplate,
    LinkRouter, RoutedLink, RoutedLinks,
} from './customization';

import { ElementTypeIri, LinkTypeIri } from '../data/model';

import { Element, Link, RichLinkType } from './elements';
import { Rect, Size, SizeProvider, isPolylineEqual } from './geometry';
import { DefaultLinkRouter } from './linkRouter';
import { DiagramModel } from './model';
import { SharedCanvasState } from './sharedCanvasState';

export interface RenderingStateOptions {
    model: DiagramModel;
    shared: SharedCanvasState;
    elementTemplateResolver?: ElementTemplateResolver;
    linkTemplateResolver?: LinkTemplateResolver;
    linkRouter?: LinkRouter;
}

export interface RenderingStateEvents {
    syncUpdate: { readonly layer: RenderingLayer };
    changeLinkTemplates: { readonly source: RenderingState };
    changeElementSize: PropertyChange<Element, Size | undefined>;
    changeLinkLabelBounds: PropertyChange<Link, Rect | undefined>;
    changeRoutings: PropertyChange<RenderingState, RoutedLinks>;
}

export enum RenderingLayer {
    Element = 1,
    ElementSize,
    PaperArea,
    LinkRoutes,
    Link,
    LinkLabel,
    Editor,

    FirstToUpdate = Element,
    LastToUpdate = Editor,
}

const DEFAULT_ELEMENT_TEMPLATE_RESOLVER: ElementTemplateResolver = types => undefined;
const DEFAULT_LINK_TEMPLATE_RESOLVER: LinkTemplateResolver = type => undefined;

export class RenderingState implements SizeProvider {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<RenderingStateEvents>();
    readonly events: Events<RenderingStateEvents> = this.source;

    private readonly model: DiagramModel;
    private readonly resolveElementTemplate: ElementTemplateResolver;
    private readonly resolveLinkTemplate: LinkTemplateResolver;
    private readonly linkRouter: LinkRouter;

    private readonly elementSizes = new WeakMap<Element, Size>();
    private readonly linkLabelBounds = new WeakMap<Link, Rect>();

    private readonly linkTemplates = new Map<LinkTypeIri, LinkTemplate>();
    private readonly delayedUpdateRoutings = new Debouncer();
    private routings: RoutedLinks = new Map<string, RoutedLink>();

    readonly shared: SharedCanvasState;

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
        this.listener.listen(this.model.events, 'linkTypeEvent', ({data}) => {
            if (data.changeVisibility) {
                this.scheduleUpdateRoutings();
            }
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

    dispose() {
        this.listener.stopListening();
        this.delayedUpdateRoutings.dispose();
    }

    syncUpdate() {
        for (let layer = RenderingLayer.FirstToUpdate; layer <= RenderingLayer.LastToUpdate; layer++) {
            this.source.trigger('syncUpdate', {layer});
        }
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
            this.elementSizes.set(element, size);
            this.source.trigger('changeElementSize', {source: element, previous});
        }
    }

    /**
     * Returns bounds for link primary label in paper coordinates.
     */
    getLinkLabelBounds(link: Link): Rect | undefined {
        return this.linkLabelBounds.get(link);
    }

    setLinkLabelBounds(link: Link, bounds: Rect | undefined): void {
        const previous = this.linkLabelBounds.get(link);
        const sameBounds = !previous && !bounds || (
            previous && bounds &&
            previous.x === bounds.x &&
            previous.y === bounds.y &&
            previous.width === bounds.width &&
            previous.height === bounds.height
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

    getElementTemplate(types: ReadonlyArray<ElementTypeIri>): ElementTemplate {
        return this.resolveElementTemplate(types) ?? this.shared.defaultElementTemplate;
    }

    getLinkTemplates(): ReadonlyMap<LinkTypeIri, LinkTemplate> {
        return this.linkTemplates;
    }

    createLinkTemplate(linkType: RichLinkType): LinkTemplate {
        const existingTemplate = this.linkTemplates.get(linkType.id);
        if (existingTemplate) {
            return existingTemplate;
        }

        const template = this.resolveLinkTemplate(linkType.id)
            ?? this.shared.defaultLinkTemplate;
        this.linkTemplates.set(linkType.id, template);
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
}

function sameRoutedLink(a: RoutedLink, b: RoutedLink) {
    return (
        a.linkId === b.linkId &&
        a.labelTextAnchor === b.labelTextAnchor &&
        isPolylineEqual(a.vertices, b.vertices)
    );
}
