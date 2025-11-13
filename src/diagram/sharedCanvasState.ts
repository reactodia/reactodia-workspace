import * as React from 'react';

import { Events, EventSource, EventObserver, PropertyChange } from '../coreUtils/events';

import { TemplateProperties } from '../data/schema';

import type { CanvasApi, CanvasDropEvent } from './canvasApi';
import type { ElementTemplate, LinkTemplate, RenameLinkProvider } from './customization';
import { Element, Link } from './elements';
import type { LayoutFunction } from './layout';

/**
 * Event data for {@link SharedCanvasState} events.
 *
 * @see {@link SharedCanvasState}
 */
export interface SharedCanvasStateEvents {
    /**
     * Triggered on {@link SharedCanvasState.highlighter} property change.
     */
    changeHighlight: PropertyChange<
        SharedCanvasState,
        CellHighlighter | undefined
    >;
    /**
     * Triggered on a request to find all canvases using this state.
     */
    findCanvas: FindCanvasEvent;
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
 *
 * @see {@link SharedCanvasStateEvents.findCanvas}
 */
export interface FindCanvasEvent {
    /**
     * Collects found canvas instances.
     */
    readonly canvases: CanvasApi[];
}

/**
 * For a each diagram cell tells whether it should be highlighted or blurred.
 */
export type CellHighlighter = (item: Element | Link) => boolean;

/** @hidden */
export interface SharedCanvasStateOptions {
    defaultElementResolver: (element: Element) => ElementTemplate;
    defaultLinkResolver: (link: Link) => LinkTemplate;
    defaultLayout: LayoutFunction;
    renameLinkProvider?: RenameLinkProvider;
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

    private dropOnPaperHandler: ((e: CanvasDropEvent) => void) | undefined;
    private _highlighter: CellHighlighter | undefined;

    /**
     * Default element template resolver to use as a fallback
     * (returns a default template for any element).
     */
    readonly defaultElementResolver: (element: Element) => ElementTemplate;
    /**
     * Default link template resolver to use as a fallback
     * (returns a default template for any link).
     */
    readonly defaultLinkResolver: (link: Link) => LinkTemplate;
    /**
     * Default layout algorithm function to use if it's not specified explicitly.
     */
    readonly defaultLayout: LayoutFunction;
    /**
     * A strategy to rename diagram links (change labels).
     */
    readonly renameLinkProvider: RenameLinkProvider | undefined;

    /** @hidden */
    constructor(options: SharedCanvasStateOptions) {
        const {
            defaultElementResolver, defaultLinkResolver, defaultLayout, renameLinkProvider,
        } = options;
        this.defaultElementResolver = defaultElementResolver;
        this.defaultLinkResolver = defaultLinkResolver;
        this.defaultLayout = defaultLayout;
        this.renameLinkProvider = renameLinkProvider;
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
     * Sets the handler for the next drop event from drag-and-drop operation on a canvas.
     *
     * **Experimental**: this feature will likely change in the future.
     */
    setHandlerForNextDropOnPaper(handler: ((e: CanvasDropEvent) => void) | undefined): void {
        this.dropOnPaperHandler = handler;
    }

    /**
     * Returns `true` if there is a previously set drop handler on a canvas,
     * otherwise `false`.
     *
     * **Experimental**: this feature will likely change in the future.
     */
    hasHandlerForNextDropOnPaper(): boolean {
        return Boolean(this.dropOnPaperHandler);
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
}

/**
 * A strategy to rename diagram links which stores changed link label
 * in the link template state.
 *
 * @see {@link TemplateProperties.CustomLabel}
 */
export class RenameLinkToLinkStateProvider implements RenameLinkProvider {
    canRename(link: Link): boolean {
        return true;
    }

    getLabel(link: Link): string | undefined {
        const {linkState} = link;
        const customLabel = linkState.get(TemplateProperties.CustomLabel);
        return typeof customLabel === 'string' ? customLabel : undefined;
    }

    setLabel(link: Link, label: string): void {
        link.setLinkState(
            link.linkState.set(
                TemplateProperties.CustomLabel,
                label.length === 0 ? undefined : label
            )
        );
    }
}
