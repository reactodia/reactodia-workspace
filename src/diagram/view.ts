import * as React from 'react';
import { hcl } from 'd3-color';

import { Events, EventSource, EventObserver, PropertyChange } from '../coreUtils/events';

import { ElementModel, ElementTypeIri, PropertyTypeIri } from '../data/model';
import * as Rdf from '../data/rdf/rdfModel';
import { isEncodedBlank } from '../data/sparql/blankNodes';
import { hashFnv32a, getUriLocalName } from '../data/utils';

import type {
    CanvasApi, CanvasDropEvent, CanvasWidgetDescription, CanvasWidgetAttachment,
} from './canvasApi';
import { TypeStyleResolver, FormattedProperty } from './customization';
import { Element, Link } from './elements';
import { DiagramModel } from './model';

export interface DiagramViewOptions {
    model: DiagramModel;
    typeStyleResolver?: TypeStyleResolver;
    selectLabelLanguage?: LabelLanguageSelector;
}

export type LabelLanguageSelector =
    (labels: ReadonlyArray<Rdf.Literal>, language: string) => Rdf.Literal | undefined;

export interface DiagramViewEvents {
    requestSyncUpdate: {};
    changeLanguage: PropertyChange<DiagramView, string>;
    changeHighlight: PropertyChange<DiagramView, CellHighlighter | undefined>;
    changeCanvasWidgets: PropertyChange<
        DiagramView,
        ReadonlyMap<string, CanvasWidgetDescription>
    >;
    findCanvas: FindCanvasEvent;
    iriClick: IriClickEvent;
    dispose: {};
}

export interface FindCanvasEvent {
    canvases: CanvasApi[];
}

export type IriClickIntent = 'jumpToEntity' | 'openEntityIri' | 'openOtherIri';
export interface IriClickEvent {
    iri: string;
    element: Element;
    clickIntent: IriClickIntent;
    originalEvent: React.MouseEvent<any>;
}

export interface ProcessedTypeStyle {
    readonly color: {
        readonly h: number;
        readonly c: number;
        readonly l: number;
    };
    readonly icon: string | undefined;
}

export type CellHighlighter = (item: Element | Link) => boolean;

export type ElementDecoratorResolver = (element: Element) => React.ReactNode | undefined;

const DEFAULT_TYPE_STYLE_RESOLVER: TypeStyleResolver = types => undefined;

export class DiagramView {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<DiagramViewEvents>();
    readonly events: Events<DiagramViewEvents> = this.source;

    private disposed = false;

    readonly model: DiagramModel;
    private readonly colorSeed = 0x0BADBEEF;
    private readonly resolveTypeStyle: TypeStyleResolver;
    private readonly selectLabelLanguage: LabelLanguageSelector;

    private _language = 'en';

    private _canvasWidgets: ReadonlyMap<string, CanvasWidgetDescription> = new Map();
    private dropOnPaperHandler: ((e: CanvasDropEvent) => void) | undefined;
    private _highlighter: CellHighlighter | undefined;
    private _elementDecorator: ElementDecoratorResolver | undefined;

    constructor(options: DiagramViewOptions) {
        this.model = options.model;
        this.resolveTypeStyle = options.typeStyleResolver ?? DEFAULT_TYPE_STYLE_RESOLVER;
        this.selectLabelLanguage = options.selectLabelLanguage ?? defaultSelectLabel;
    }

    dispose() {
        if (this.disposed) { return; }
        this.source.trigger('dispose', {});
        this.listener.stopListening();
        this.disposed = true;
    }

    findAllCanvases(): CanvasApi[] {
        const event: FindCanvasEvent = {canvases: []};
        this.source.trigger('findCanvas', event);
        return event.canvases;
    }

    findAnyCanvas(): CanvasApi | undefined {
        const canvases = this.findAllCanvases();
        return canvases.length > 0 ? canvases[0] : undefined;
    }

    syncUpdateAllCanvases() {
        for (const canvas of this.findAllCanvases()) {
            canvas.renderingState.syncUpdate();
        }
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

    onIriClick(iri: string, element: Element, clickIntent: IriClickIntent, event: React.MouseEvent<any>) {
        event.persist();
        event.preventDefault();
        this.source.trigger('iriClick', {iri, element, clickIntent, originalEvent: event});
    }

    get canvasWidgets(): ReadonlyMap<string, CanvasWidgetDescription> {
        return this._canvasWidgets;
    }

    setCanvasWidget(key: string, widget: {
        element: React.ReactElement;
        attachment: CanvasWidgetAttachment;
    } | null) {
        const previous = this._canvasWidgets;
        const nextWidgets = new Map(previous);
        if (widget) {
            const description: CanvasWidgetDescription = {
                element: React.cloneElement(widget.element, {key}),
                attachment: widget.attachment,
            };
            nextWidgets.set(key, description);
        } else {
            nextWidgets.delete(key);
        }
        this._canvasWidgets = nextWidgets;
        this.source.trigger('changeCanvasWidgets', {source: this, previous});
    }

    setHandlerForNextDropOnPaper(handler: ((e: CanvasDropEvent) => void) | undefined) {
        this.dropOnPaperHandler = handler;
    }

    tryHandleDropOnPaper(e: CanvasDropEvent): boolean {
        const {dropOnPaperHandler} = this;
        if (dropOnPaperHandler) {
            this.dropOnPaperHandler = undefined;
            e.sourceEvent.preventDefault();
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
        const {selectLabelLanguage} = this;
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

    getTypeStyle(types: ReadonlyArray<ElementTypeIri>): ProcessedTypeStyle {
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

    get highlighter(): CellHighlighter | undefined { return this._highlighter; }
    setHighlighter(value: CellHighlighter | undefined) {
        const previous = this._highlighter;
        if (previous === value) { return; }
        this._highlighter = value;
        this.source.trigger('changeHighlight', {source: this, previous});
    }

    _setElementDecorator(decorator: ElementDecoratorResolver | undefined) {
        this._elementDecorator = decorator;
    }

    _decorateElement(element: Element): React.ReactNode | undefined {
        return this._elementDecorator?.(element);
    }
}

function getHueFromClasses(classes: ReadonlyArray<ElementTypeIri>, seed?: number): number {
    let hash = seed;
    for (const name of classes) {
        hash = hashFnv32a(name, hash);
    }
    const MAX_INT32 = 0x7fffffff;
    return 360 * ((hash === undefined ? 0 : hash) / MAX_INT32);
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
