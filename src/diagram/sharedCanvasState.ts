import * as React from 'react';

import { Events, EventSource, EventObserver, PropertyChange } from '../coreUtils/events';

import type {
    CanvasApi, CanvasDropEvent, CanvasWidgetDescription, CanvasWidgetAttachment,
} from './canvasApi';
import { Element, Link } from './elements';

export interface SharedCanvasStateEvents {
    changeHighlight: PropertyChange<
        SharedCanvasState,
        CellHighlighter | undefined
    >;
    changeWidgets: PropertyChange<
        SharedCanvasState,
        ReadonlyMap<string, CanvasWidgetDescription>
    >;
    findCanvas: FindCanvasEvent;
    iriClick: IriClickEvent;
    dispose: { readonly source: SharedCanvasState };
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

export type CellHighlighter = (item: Element | Link) => boolean;

export type ElementDecoratorResolver = (element: Element) => React.ReactNode | undefined;

export class SharedCanvasState {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<SharedCanvasStateEvents>();
    readonly events: Events<SharedCanvasStateEvents> = this.source;

    private disposed = false;

    private _canvasWidgets: ReadonlyMap<string, CanvasWidgetDescription>;
    private dropOnPaperHandler: ((e: CanvasDropEvent) => void) | undefined;
    private _highlighter: CellHighlighter | undefined;
    private _elementDecorator: ElementDecoratorResolver | undefined;

    constructor() {
        this._canvasWidgets = new Map();
    }

    dispose() {
        if (this.disposed) { return; }
        this.source.trigger('dispose', {source: this});
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

    onIriClick(iri: string, element: Element, clickIntent: IriClickIntent, event: React.MouseEvent<any>) {
        event.persist();
        event.preventDefault();
        this.source.trigger('iriClick', {iri, element, clickIntent, originalEvent: event});
    }

    get widgets(): ReadonlyMap<string, CanvasWidgetDescription> {
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
        this.source.trigger('changeWidgets', {source: this, previous});
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
