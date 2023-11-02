import { ReactNode } from 'react';
import { hcl } from 'd3-color';
import { ReactElement, MouseEvent } from 'react';

import {
    LinkRouter, TypeStyleResolver, LinkTemplateResolver, TemplateResolver, ElementTemplate,
    LinkTemplate, LinkMarkerStyle, LinkStyle, RoutedLink, RoutedLinks, FormattedProperty, LinkLabelStyle,
} from '../customization/props';
import { DefaultTypeStyleBundle } from '../customization/defaultTypeStyles';
import { DefaultLinkTemplateBundle } from '../customization/defaultLinkStyles';
import { DefaultElementTemplateBundle } from '../customization/templates/bundle';
import { StandardTemplate } from '../customization/templates/standard';

import { ElementModel, ElementTypeIri, LinkTypeIri, PropertyTypeIri } from '../data/model';
import * as Rdf from '../data/rdf/rdfModel';
import { isEncodedBlank } from '../data/sparql/blankNodes';
import { hashFnv32a, getUriLocalName } from '../data/utils';

import { Events, EventSource, EventObserver, PropertyChange } from '../viewUtils/events';

import { Element, Link, FatLinkType } from './elements';
import { Vector, isPolylineEqual } from './geometry';
import { DefaultLinkRouter } from './linkRouter';
import { DiagramModel } from './model';

export enum IriClickIntent {
    JumpToEntity = 'jumpToEntity',
    OpenEntityIri = 'openEntityIri',
    OpenOtherIri = 'openOtherIri',
}
export interface IriClickEvent {
    iri: string;
    element: Element;
    clickIntent: IriClickIntent;
    originalEvent: MouseEvent<any>;
}
export type IriClickHandler = (event: IriClickEvent) => void;

export type LabelLanguageSelector =
    (labels: ReadonlyArray<Rdf.Literal>, language: string) => Rdf.Literal | undefined;

export interface ViewOptions {
    typeStyleResolver?: TypeStyleResolver;
    linkTemplateResolver?: LinkTemplateResolver;
    elementTemplateResolver?: TemplateResolver;
    selectLabelLanguage?: LabelLanguageSelector;
    linkRouter?: LinkRouter;
    onIriClick?: IriClickHandler;
}

export interface TypeStyle {
    color: { h: number; c: number; l: number };
    icon?: string;
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

export interface DiagramViewEvents {
    changeLanguage: PropertyChange<DiagramView, string>;
    changeLinkTemplates: {};
    syncUpdate: { layer: RenderingLayer };
    updateWidgets: UpdateWidgetsEvent;
    dispose: {};
    changeHighlight: PropertyChange<DiagramView, Highlighter>;
    updateRoutings: PropertyChange<DiagramView, RoutedLinks>;
}

export interface UpdateWidgetsEvent {
    widgets: { [key: string]: WidgetDescription | undefined };
}

export enum WidgetAttachment {
    Viewport = 1,
    OverElements,
    OverLinks,
}

export interface WidgetDescription {
    element: ReactElement<any>;
    attachment: WidgetAttachment;
}

export interface DropOnPaperEvent {
    dragEvent: DragEvent;
    paperPosition: Vector;
}

export type Highlighter = ((item: Element | Link) => boolean) | undefined;

export type ElementDecoratorResolver = (element: Element) => ReactNode | undefined;

export class DiagramView {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<DiagramViewEvents>();
    readonly events: Events<DiagramViewEvents> = this.source;

    private disposed = false;

    private readonly colorSeed = 0x0BADBEEF;

    private readonly resolveTypeStyle: TypeStyleResolver;
    private readonly resolveLinkTemplate: LinkTemplateResolver;
    private readonly resolveElementTemplate: TemplateResolver;

    private _language = 'en';

    private linkTemplates = new Map<LinkTypeIri, FilledLinkTemplate>();
    private router: LinkRouter;
    private routings: RoutedLinks = new Map<string, RoutedLink>();
    private dropOnPaperHandler: ((e: DropOnPaperEvent) => void) | undefined;

    private _highlighter: Highlighter;

    private _elementDecorator: ElementDecoratorResolver | undefined;

    constructor(
        public readonly model: DiagramModel,
        public readonly options: ViewOptions = {},
    ) {
        this.resolveTypeStyle = options.typeStyleResolver || DefaultTypeStyleBundle;
        this.resolveLinkTemplate = options.linkTemplateResolver || DefaultLinkTemplateBundle;
        this.resolveElementTemplate = options.elementTemplateResolver || DefaultElementTemplateBundle;

        this.router = this.options.linkRouter || new DefaultLinkRouter();
        this.initRouting();
    }

    private initRouting() {
        this.updateRoutings();

        this.listener.listen(this.model.events, 'changeCells', () =>  this.updateRoutings());
        this.listener.listen(this.model.events, 'linkEvent', ({key, data}) => {
            if (data.changeVertices) {
                this.updateRoutings();
            }
        });
        this.listener.listen(this.model.events, 'elementEvent', ({key, data}) => {
            if (data.changePosition || data.changeSize) {
                this.updateRoutings();
            }
        });
    }

    private updateRoutings() {
        const previousRoutes = this.routings;
        const computedRoutes = this.router.route(this.model);
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

    getRoutings() {
        return this.routings;
    }

    getRouting(linkId: string): RoutedLink | undefined {
        return this.routings.get(linkId);
    }

    getLanguage(): string { return this._language; }
    setLanguage(value: string) {
        if (!value) {
            throw new Error('Cannot set empty language.');
        }
        const previous = this._language;
        if (previous === value) { return; }
        this._language = value;
        this.source.trigger('changeLanguage', {source: this, previous});
    }

    getLinkTemplates(): ReadonlyMap<LinkTypeIri, FilledLinkTemplate> {
        return this.linkTemplates;
    }

    performSyncUpdate() {
        for (let layer = RenderingLayer.FirstToUpdate; layer <= RenderingLayer.LastToUpdate; layer++) {
            this.source.trigger('syncUpdate', {layer});
        }
    }

    onIriClick(iri: string, element: Element, clickIntent: IriClickIntent, event: React.MouseEvent<any>) {
        event.persist();
        event.preventDefault();
        const {onIriClick} = this.options;
        if (onIriClick) {
            onIriClick({iri, element, clickIntent, originalEvent: event});
        }
    }

    setPaperWidget(widget: {
        key: string;
        widget: ReactElement<any> | undefined;
        attachment: WidgetAttachment;
    }) {
        const {key, widget: element, attachment} = widget;
        const widgets = {[key]: element ? {element, attachment} : undefined};
        this.source.trigger('updateWidgets', {widgets});
    }

    setHandlerForNextDropOnPaper(handler: (e: DropOnPaperEvent) => void) {
        this.dropOnPaperHandler = handler;
    }

    _tryHandleDropOnPaper(e: DropOnPaperEvent): boolean {
        const {dropOnPaperHandler} = this;
        if (dropOnPaperHandler) {
            this.dropOnPaperHandler = undefined;
            dropOnPaperHandler(e);
            return true;
        }
        return false;
    }

    selectLabel(
        labels: ReadonlyArray<Rdf.Literal>,
        language?: string
    ): Rdf.Literal | undefined {
        const targetLanguage = typeof language === 'undefined' ? this.getLanguage() : language;
        const {selectLabelLanguage = defaultSelectLabel} = this.options;
        return selectLabelLanguage(labels, targetLanguage);
    }

    formatLabel(
        labels: ReadonlyArray<Rdf.Literal>,
        fallbackIri: string,
        language?: string
    ): string {
        const label = this.selectLabel(labels, language);
        return resolveLabel(label, fallbackIri);
    }

    getElementTypeString(elementModel: ElementModel): string {
        return elementModel.types.map(typeId => {
            const type = this.model.createClass(typeId);
            return this.formatLabel(type.label, type.id);
        }).sort().join(', ');
    }

    formatPropertyList(
        properties: { readonly [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> }
    ): FormattedProperty[] {
        const propertyIris = Object.keys(properties) as PropertyTypeIri[];
        const propertyList = propertyIris.map((key): FormattedProperty => {
            const property = this.model.createProperty(key);
            const label = this.formatLabel(property.label, key);
            return {
                propertyId: key,
                label,
                values: properties[key],
            };
        });
        propertyList.sort((a, b) => a.label.localeCompare(b.label));
        return propertyList;
    }

    getTypeStyle(types: ReadonlyArray<ElementTypeIri>): TypeStyle {
        const customStyle = this.resolveTypeStyle(types);

        const icon = customStyle ? customStyle.icon : undefined;
        let color: { h: number; c: number; l: number };
        if (customStyle && customStyle.color) {
            color = hcl(customStyle.color);
        } else {
            const hue = getHueFromClasses(types, this.colorSeed);
            color = {h: hue, c: 40, l: 75};
        }
        return {icon, color};
    }

    formatIri(iri: string): string {
        if (isEncodedBlank(iri)) {
            return '(blank node)';
        }
        return `<${iri}>`;
    }

    public getElementTemplate(types: ReadonlyArray<ElementTypeIri>): ElementTemplate {
        return this.resolveElementTemplate(types) || StandardTemplate;
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

    dispose() {
        if (this.disposed) { return; }
        this.source.trigger('dispose', {});
        this.listener.stopListening();
        this.disposed = true;
    }

    get highlighter() { return this._highlighter; }
    setHighlighter(value: Highlighter) {
        const previous = this._highlighter;
        if (previous === value) { return; }
        this._highlighter = value;
        this.source.trigger('changeHighlight', {source: this, previous});
    }

    _setElementDecorator(decorator: ElementDecoratorResolver) {
        this._elementDecorator = decorator;
    }

    _decorateElement(element: Element): ReactNode | undefined {
        return this._elementDecorator?.(element);
    }
}

function sameRoutedLink(a: RoutedLink, b: RoutedLink) {
    return (
        a.linkId === b.linkId &&
        a.labelTextAnchor === b.labelTextAnchor &&
        isPolylineEqual(a.vertices, b.vertices)
    );
}

function getHueFromClasses(classes: ReadonlyArray<ElementTypeIri>, seed?: number): number {
    let hash = seed;
    for (const name of classes) {
        hash = hashFnv32a(name, hash);
    }
    const MAX_INT32 = 0x7fffffff;
    return 360 * ((hash === undefined ? 0 : hash) / MAX_INT32);
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

function defaultSelectLabel(
    texts: ReadonlyArray<Rdf.Literal>,
    language: string
): Rdf.Literal | undefined {
    if (texts.length === 0) { return undefined; }
    let defaultValue: Rdf.Literal | undefined;
    let englishValue: Rdf.Literal | undefined;
    for (const text of texts) {
        if (text.language === language) {
            return text;
        } else if (text.language === '') {
            defaultValue = text;
        } else if (text.language === 'en') {
            englishValue = text;
        }
    }
    return (
        defaultValue !== undefined ? defaultValue :
        englishValue !== undefined ? englishValue :
        texts[0]
    );
}

function resolveLabel(label: Rdf.Literal | undefined, fallbackIri: string): string {
    if (label) { return label.value; }
    return getUriLocalName(fallbackIri) || fallbackIri;
}
