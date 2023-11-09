import { Events, EventObserver, EventSource, PropertyChange } from '../coreUtils/events';

import {
    ElementTemplateResolver, LinkTemplateResolver, ElementTemplate, LinkTemplate, LinkMarkerStyle, LinkStyle,
    LinkRouter, RoutedLink, RoutedLinks,
} from './customization';

import { ElementTypeIri, LinkTypeIri } from '../data/model';

import { StandardTemplate } from '../templates/standardTemplate';

import { Element, Link, FatLinkType } from './elements';
import { Rect, Size, SizeProvider, isPolylineEqual } from './geometry';
import { DefaultLinkRouter } from './linkRouter';
import { DiagramModel } from './model';

export interface RenderingStateOptions {
    model: DiagramModel;
    elementTemplateResolver?: ElementTemplateResolver;
    linkTemplateResolver?: LinkTemplateResolver;
    linkRouter?: LinkRouter;
}

export interface RenderingStateEvents {
    syncUpdate: { readonly layer: RenderingLayer };
    changeLinkTemplates: {};
    changeElementSize: PropertyChange<Element, Size | undefined>;
    changeLinkLabelBounds: PropertyChange<Link, Rect | undefined>;
    updateRoutings: PropertyChange<RenderingState, RoutedLinks>;
}

export enum RenderingLayer {
    Element = 1,
    ElementSize,
    PaperArea,
    Link,
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

    private readonly linkTemplates = new Map<LinkTypeIri, FilledLinkTemplate>();
    private routings: RoutedLinks = new Map<string, RoutedLink>();

    constructor(options: RenderingStateOptions) {
        this.model = options.model;
        this.resolveElementTemplate = options.elementTemplateResolver
            ?? DEFAULT_ELEMENT_TEMPLATE_RESOLVER;
        this.resolveLinkTemplate = options.linkTemplateResolver
            ?? DEFAULT_LINK_TEMPLATE_RESOLVER;
        this.linkRouter = options.linkRouter ?? new DefaultLinkRouter();

        this.listener.listen(this.model.events, 'changeCells', () =>  this.updateRoutings());
        this.listener.listen(this.model.events, 'linkEvent', ({key, data}) => {
            if (data.changeVertices) {
                this.updateRoutings();
            }
        });
        this.listener.listen(this.model.events, 'elementEvent', ({key, data}) => {
            if (data.changePosition) {
                this.updateRoutings();
            }
        });
        this.listener.listen(this.events, 'changeElementSize', () => {
            this.updateRoutings();
        });

        this.updateRoutings();
    }

    dispose() {
        this.listener.stopListening();
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
        return this.resolveElementTemplate(types) ?? StandardTemplate;
    }

    getLinkTemplates(): ReadonlyMap<LinkTypeIri, FilledLinkTemplate> {
        return this.linkTemplates;
    }

    createLinkTemplate(linkType: FatLinkType): FilledLinkTemplate {
        const existingTemplate = this.linkTemplates.get(linkType.id);
        if (existingTemplate) {
            return existingTemplate;
        }

        const rawTemplate = this.resolveLinkTemplate(linkType.id);
        const template = fillLinkTemplateDefaults(rawTemplate ?? {});
        this.linkTemplates.set(linkType.id, template);
        this.source.trigger('changeLinkTemplates', {});
        return template;
    }

    getRoutings(): ReadonlyMap<string, RoutedLink> {
        return this.routings;
    }

    getRouting(linkId: string): RoutedLink | undefined {
        return this.routings.get(linkId);
    }

    private updateRoutings() {
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
        this.source.trigger('updateRoutings', {source: this, previous: previousRoutes});
    }
}

export interface FilledLinkTemplate {
    readonly markerSource?: LinkMarkerStyle;
    readonly markerTarget: LinkMarkerStyle;
    readonly renderLink: (link: Link, model: DiagramModel) => LinkStyle;
    readonly setLinkLabel?: (link: Link, label: string) => void;
}

function fillLinkTemplateDefaults(template: LinkTemplate): FilledLinkTemplate {
    const {
        markerSource,
        markerTarget = {},
        renderLink = (): LinkStyle => ({}),
        setLinkLabel,
    } = template;
    return {
        markerSource,
        markerTarget: {
            d: markerTarget.d ?? 'M0,0 L0,8 L9,4 z',
            width: markerTarget.width ?? 9,
            height: markerTarget.height ?? 8,
            fill: markerTarget.fill ?? 'black',
        },
        renderLink,
        setLinkLabel,
    };
}

function sameRoutedLink(a: RoutedLink, b: RoutedLink) {
    return (
        a.linkId === b.linkId &&
        a.labelTextAnchor === b.labelTextAnchor &&
        isPolylineEqual(a.vertices, b.vertices)
    );
}
