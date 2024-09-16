import * as React from 'react';

import { Events, EventSource, EventObserver, PropertyChange } from '../coreUtils/events';

import { TemplateProperties } from '../data/schema';

import type {
    CanvasApi, CanvasDropEvent, CanvasWidgetDescription,
} from './canvasApi';
import type { ElementTemplate, LinkTemplate, RenameLinkHandler } from './customization';
import { Element, Link } from './elements';
import type { LayoutFunction } from './layout';

/**
 * Event data for `SharedCanvasState` events.
 *
 * @see SharedCanvasState
 */
export interface SharedCanvasStateEvents {
    /**
     * Triggered on `highlighter` property change.
     */
    changeHighlight: PropertyChange<
        SharedCanvasState,
        CellHighlighter | undefined
    >;
    /**
     * Triggered on `widgets` property change.
     */
    changeWidgets: PropertyChange<
        SharedCanvasState,
        ReadonlyMap<string, CanvasWidgetDescription>
    >;
    /**
     * Triggered on a request to find all canvases using this state.
     */
    findCanvas: FindCanvasEvent;
    /**
     * Triggered on request to navigate to a specific IRI.
     *
     * @deprecated Use element templates to change how IRIs should be opened.
     */
    iriClick: IriClickEvent;
    /**
     * Triggered when all rendering-related state should be disposed.
     */
    dispose: {
        /**
         * Event source (shared canvas state).
         */
        readonly source: SharedCanvasState;
    };
}

/**
 * Event data for a request to find all canvases using this state.
 */
export interface FindCanvasEvent {
    /**
     * Collects found canvas instances.
     */
    readonly canvases: CanvasApi[];
}

/** @deprecated */
export type IriClickIntent = 'jumpToEntity' | 'openEntityIri' | 'openOtherIri';
/** @deprecated */
export interface IriClickEvent {
    iri: string;
    element: Element;
    clickIntent: IriClickIntent;
    originalEvent: React.MouseEvent<any>;
}

/**
 * For a each diagram cell tells whether it should be highlighted or blurred.
 */
export type CellHighlighter = (item: Element | Link) => boolean;

/** @hidden */
export type ElementDecoratorResolver = (element: Element) => React.ReactNode | undefined;

/** @hidden */
export interface SharedCanvasStateOptions {
    defaultElementTemplate: ElementTemplate;
    defaultLinkTemplate: LinkTemplate;
    defaultLayout: LayoutFunction;
    renameLinkHandler?: RenameLinkHandler;
}

/**
 * Stores common state and settings for multiple canvases.
 *
 * @category Core
 */
export class SharedCanvasState {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<SharedCanvasStateEvents>();
    /**
     * Event for the shared canvas state.
     */
    readonly events: Events<SharedCanvasStateEvents> = this.source;

    private disposed = false;

    private _canvasWidgets: ReadonlyMap<string, CanvasWidgetDescription>;
    private dropOnPaperHandler: ((e: CanvasDropEvent) => void) | undefined;
    private _highlighter: CellHighlighter | undefined;
    private _elementDecorator: ElementDecoratorResolver | undefined;

    /**
     * Default element template to use as a fallback.
     */
    readonly defaultElementTemplate: ElementTemplate;
    /**
     * Default link template to use as a fallback.
     */
    readonly defaultLinkTemplate: LinkTemplate;
    /**
     * Default layout algorithm function to use if it's not specified explicitly.
     */
    readonly defaultLayout: LayoutFunction;
    /**
     * A strategy to rename diagram links (change labels).
     */
    readonly renameLinkHandler: RenameLinkHandler | undefined;

    /** @hidden */
    constructor(options: SharedCanvasStateOptions) {
        const {
            defaultElementTemplate, defaultLinkTemplate, defaultLayout, renameLinkHandler,
        } = options;
        this._canvasWidgets = new Map();
        this.defaultElementTemplate = defaultElementTemplate;
        this.defaultLinkTemplate = defaultLinkTemplate;
        this.defaultLayout = defaultLayout;
        this.renameLinkHandler = renameLinkHandler;
    }

    /** @hidden */
    dispose(): void {
        if (this.disposed) { return; }
        this.source.trigger('dispose', {source: this});
        this.listener.stopListening();
        this.disposed = true;
    }

    /**
     * Returns all canvases that use this shared state.
     */
    findAllCanvases(): CanvasApi[] {
        const event: FindCanvasEvent = {canvases: []};
        this.source.trigger('findCanvas', event);
        return event.canvases;
    }

    /**
     * Returns any canvas that uses this shared state or `undefined` if none found.
     */
    findAnyCanvas(): CanvasApi | undefined {
        const canvases = this.findAllCanvases();
        return canvases.length > 0 ? canvases[0] : undefined;
    }

    /**
     * Requests to navigate to a specific IRI.
     *
     * @deprecated
     */
    onIriClick(
        iri: string,
        element: Element,
        clickIntent: IriClickIntent,
        event: React.MouseEvent<any>
    ): void {
        event.persist();
        event.preventDefault();
        this.source.trigger('iriClick', {iri, element, clickIntent, originalEvent: event});
    }

    /**
     * Live collection of canvas widgets rendered on each canvas.
     */
    get widgets(): ReadonlyMap<string, CanvasWidgetDescription> {
        return this._canvasWidgets;
    }

    /**
     * Adds, changes or removes a canvas widget from being rendered on the canvases.
     *
     * @param key unique key for a widget
     * @param widget widget description with a target widget layer to render on
     *        or `null` to remove the widget
     */
    setCanvasWidget(key: string, widget: CanvasWidgetDescription | null): void {
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

    /**
     * Sets the handler for the next drop event from drag-and-drop operation on a canvas.
     *
     * **Experimental**: this feature will likely change in the future.
     */
    setHandlerForNextDropOnPaper(handler: ((e: CanvasDropEvent) => void) | undefined): void {
        this.dropOnPaperHandler = handler;
    }

    /**
     * Tries to run previously set drop handler on a canvas,
     * then removes the handler if it was set.
     *
     * **Experimental**: this feature will likely change in the future.
     *
     * @returns `true` if a handler was set, otherwise `false`
     */
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

    /**
     * Returns active highlight for the diagram cells.
     *
     * **Experimental**: this feature will likely change in the future.
     */
    get highlighter(): CellHighlighter | undefined { return this._highlighter; }
    /**
     * Sets or removes an active highlight for the diagram cells.
     *
     * **Experimental**: this feature will likely change in the future.
     */
    setHighlighter(value: CellHighlighter | undefined): void {
        const previous = this._highlighter;
        if (previous === value) { return; }
        this._highlighter = value;
        this.source.trigger('changeHighlight', {source: this, previous});
    }

    /** @hidden */
    _setElementDecorator(decorator: ElementDecoratorResolver | undefined): void {
        this._elementDecorator = decorator;
    }

    /** @hidden */
    _decorateElement(element: Element): React.ReactNode | undefined {
        return this._elementDecorator?.(element);
    }
}

export class RenameLinkToLinkStateHandler implements RenameLinkHandler {
    canRename(link: Link): boolean {
        return true;
    }

    getLabel(link: Link): string | undefined {
        const {linkState} = link;
        if (
            linkState &&
            Object.prototype.hasOwnProperty.call(linkState, TemplateProperties.CustomLabel)
        ) {
            const customLabel = linkState[TemplateProperties.CustomLabel];
            if (typeof customLabel === 'string') {
                return customLabel;
            }
        }
        return undefined;
    }

    setLabel(link: Link, label: string): void {
        link.setLinkState({
            ...link.linkState,
            [TemplateProperties.CustomLabel]: label.length === 0 ? undefined : label,
        });
    }
}
