import cx from 'clsx';
import * as React from 'react';
import { createPortal, flushSync } from 'react-dom';

import { EventObserver } from '../coreUtils/events';

import { ElementTemplate, TemplateProps } from './customization';

import { useCanvas } from './canvasApi';
import { Element, VoidElement } from './elements';
import type { Size } from './geometry';
import { DiagramModel } from './model';
import { HtmlPaperLayer, type PaperTransform } from './paper';
import { MutableRenderingState, RenderingLayer } from './renderingState';
import { SharedCanvasState } from './sharedCanvasState';

export interface ElementLayerProps {
    layerRef: React.Ref<HTMLDivElement | null>;
    model: DiagramModel;
    renderingState: MutableRenderingState;
    paperTransform: PaperTransform;
}

interface State {
    readonly version: number;
    readonly elementStates: ReadonlyMap<Element, ElementState>;
}

interface ElementState {
    element: Element;
    templateProps: TemplateProps;
    blurred: boolean;
}

enum RedrawFlags {
    None = 0,
    ScanCell = 1,
    Render = 2,
    RecomputeTemplate = Render | 4,
    RecomputeBlurred = Render | 8,
    Discard = ScanCell | RecomputeTemplate | RecomputeBlurred | 16,
}

interface RedrawBatch {
    requests: Map<string, RedrawFlags>;
    forAll: RedrawFlags;
}

interface SizeUpdateRequest {
    readonly element: Element;
    readonly node: HTMLDivElement;
    computedSize?: Size;
}

export class ElementLayer extends React.Component<ElementLayerProps, State> {
    private readonly listener = new EventObserver();

    private redrawBatch: RedrawBatch = {
        requests: new Map<string, RedrawFlags>(),
        forAll: RedrawFlags.None,
    };
    private readonly memoizedElements = new WeakMap<ElementState, React.ReactElement>();

    private sizeRequests = new Map<string, SizeUpdateRequest>();

    constructor(props: ElementLayerProps) {
        super(props);
        const {model, renderingState} = this.props;
        this.state = {
            version: 0,
            elementStates: applyRedrawRequests(
                model,
                renderingState.shared,
                this.redrawBatch,
                new Map<Element, ElementState>()
            )
        };
    }

    render() {
        const {model, renderingState, paperTransform, layerRef} = this.props;
        const {version, elementStates} = this.state;
        const {memoizedElements} = this;

        const elementsToRender: ElementState[] = [];
        for (const element of model.elements) {
            const state = elementStates.get(element);
            if (state) {
                elementsToRender.push(state);
            }
        }

        return (
            <HtmlPaperLayer key={version}
                layerRef={layerRef}
                className='reactodia-element-layer'
                paperTransform={paperTransform}>
                {elementsToRender.map(state => {
                    let overlaidElement = memoizedElements.get(state);
                    if (!overlaidElement) {
                        overlaidElement = (
                            <OverlaidElement key={state.element.id}
                                state={state}
                                model={model}
                                renderingState={renderingState}
                                onResize={this.requestSizeUpdate}
                            />
                        );
                        memoizedElements.set(state, overlaidElement);
                    }
                    return overlaidElement;
                })}
            </HtmlPaperLayer>
        );
    }

    componentDidMount() {
        const {model, renderingState} = this.props;
        this.listener.listen(model.events, 'changeCells', e => {
            if (e.updateAll) {
                this.requestRedrawAll(RedrawFlags.ScanCell);
            } else {
                if (e.changedElement) {
                    this.requestRedraw(e.changedElement, RedrawFlags.ScanCell);
                }
            }
        });
        this.listener.listen(model.events, 'changeCellOrder', () => {
            this.requestRedrawAll(RedrawFlags.None);
        });
        this.listener.listen(model.events, 'changeSelection', ({previous}) => {
            const previousCell = previous.length === 1 ? previous[0] : undefined;
            const nextSingle = model.selection.length === 1 ? model.selection[0] : undefined;

            const previousElement = previousCell instanceof Element ? previousCell : undefined;
            const nextElement = nextSingle instanceof Element ? nextSingle : undefined;

            if (nextElement !== previousElement) {
                if (previousElement) {
                    this.requestRedraw(previousElement, RedrawFlags.RecomputeTemplate);
                }
                if (nextElement) {
                    this.requestRedraw(nextElement, RedrawFlags.RecomputeTemplate);
                }
            }
        });
        this.listener.listen(model.events, 'elementEvent', ({data}) => {
            const invalidatesTemplate = data.changeElementState;
            if (invalidatesTemplate) {
                this.requestRedraw(invalidatesTemplate.source, RedrawFlags.RecomputeTemplate);
            }
            
            const invalidatesRender = data.changePosition;
            if (invalidatesRender) {
                this.requestRedraw(invalidatesRender.source, RedrawFlags.Render);
            }

            if (data.requestedRedraw) {
                let flags = RedrawFlags.Render;
                switch (data.requestedRedraw.level) {
                    case 'template': {
                        flags = RedrawFlags.RecomputeTemplate;
                        break;
                    }
                }
                this.requestRedraw(data.requestedRedraw.source, flags);
            }
        });
        this.listener.listen(model.events, 'changeLanguage', () => {
            this.requestRedrawAll(RedrawFlags.RecomputeTemplate);
        });
        this.listener.listen(model.events, 'discardGraph', () => {
            this.requestRedrawAll(RedrawFlags.Discard);
        });
        this.listener.listen(renderingState.shared.events, 'changeHighlight', () => {
            this.requestRedrawAll(RedrawFlags.RecomputeBlurred);
        });
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.props.renderingState.cancelOnLayerUpdate(
            RenderingLayer.Element,
            this.redrawElements
        );
        this.props.renderingState.cancelOnLayerUpdate(
            RenderingLayer.ElementSize,
            this.recomputeQueuedSizes
        );
    }

    private requestRedraw = (element: Element, request: RedrawFlags) => {
        const flagsWithForAll: RedrawFlags = this.redrawBatch.forAll | request;
        if (flagsWithForAll === this.redrawBatch.forAll) {
            // forAll flags already include the request
            return;
        }
        const existing = this.redrawBatch.requests.get(element.id) || RedrawFlags.None;
        this.redrawBatch.requests.set(element.id, existing | request);
        this.props.renderingState.scheduleOnLayerUpdate(
            RenderingLayer.Element,
            this.redrawElements
        );
    };

    private requestRedrawAll(request: RedrawFlags) {
        this.redrawBatch.forAll |= request;
        this.props.renderingState.scheduleOnLayerUpdate(
            RenderingLayer.Element,
            this.redrawElements
        );
    }

    private redrawElements = () => {
        const committedBatch = this.redrawBatch;
        this.redrawBatch = {
            forAll: RedrawFlags.None,
            requests: new Map<string, RedrawFlags>(),
        };
        flushSync(() => {
            this.setState((state, props) => ({
                version: committedBatch.forAll === RedrawFlags.Discard
                    ? (state.version + 1) : state.version,
                elementStates: applyRedrawRequests(
                    props.model,
                    props.renderingState.shared,
                    committedBatch,
                    state.elementStates
                )
            }));
        });
    };

    private requestSizeUpdate = (element: Element, node: HTMLDivElement) => {
        this.sizeRequests.set(element.id, {element, node});
        this.props.renderingState.scheduleOnLayerUpdate(
            RenderingLayer.ElementSize,
            this.recomputeQueuedSizes
        );
    };

    private recomputeQueuedSizes = () => {
        const {renderingState} = this.props;
        const batch = this.sizeRequests;
        this.sizeRequests = new Map<string, SizeUpdateRequest>();
        for (const request of batch.values()) {
            const {clientWidth, clientHeight} = request.node;
            request.computedSize = {width: clientWidth, height: clientHeight};
        }
        for (const request of batch.values()) {
            if (request.computedSize) {
                renderingState.setElementSize(request.element, request.computedSize);
            }
        }
    };
}

function applyRedrawRequests(
    model: DiagramModel,
    view: SharedCanvasState,
    batch: RedrawBatch,
    previous: ReadonlyMap<Element, ElementState>,
): ReadonlyMap<Element, ElementState> {
    if (batch.forAll === RedrawFlags.None && batch.requests.size === 0) {
        return previous;
    }
    const selectedCell = model.selection.length === 1 ? model.selection[0] : undefined;
    const selectedElement = selectedCell instanceof Element ? selectedCell : undefined;
    const computed = new Map<Element, ElementState>();
    for (const element of model.elements) {
        const elementId = element.id;
        let state = previous.get(element);
        if (state) {
            const request = (batch.requests.get(elementId) || RedrawFlags.None) | batch.forAll;
            if (request & RedrawFlags.Render) {
                state = {
                    element,
                    templateProps:
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
                        (request & RedrawFlags.RecomputeTemplate) === RedrawFlags.RecomputeTemplate
                            ? computeTemplateProps(state.element, selectedElement)
                            : state.templateProps,
                    blurred:
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
                        (request & RedrawFlags.RecomputeBlurred) === RedrawFlags.RecomputeBlurred
                            ? computeIsBlurred(state.element, view) : state.blurred,
                };
            }
            computed.set(element, state);
            batch.requests.delete(elementId);
        } else {
            computed.set(element, {
                element,
                templateProps: computeTemplateProps(element, selectedElement),
                blurred: computeIsBlurred(element, view),
            });
        }
    }
    batch.forAll = RedrawFlags.None;
    return computed;
}

function computeTemplateProps(element: Element, selectedElement: Element | undefined): TemplateProps {
    return {
        elementId: element.id,
        element,
        isExpanded: element.isExpanded,
        elementState: element.elementState,
        onlySelected: element === selectedElement,
    };
}

interface OverlaidElementProps {
    state: ElementState;
    model: DiagramModel;
    renderingState: MutableRenderingState;
    onResize: (model: Element, node: HTMLDivElement) => void;
}

const OVERLAID_ELEMENT_CLASS = 'reactodia-overlaid-element';

class OverlaidElement extends React.Component<OverlaidElementProps> {
    private readonly elementRef = React.createRef<HTMLDivElement | null>();
    private readonly decorationsRef = React.createRef<HTMLDivElement | null>();
    private readonly listener = new EventObserver();

    render(): React.ReactElement<any> {
        const {state: {element, blurred}} = this.props;
        if (element instanceof VoidElement) {
            return <div />;
        }

        const {x, y} = element.position;
        const transform = `translate(${x}px,${y}px)`;

        // const angle = model.get('angle') || 0;
        // if (angle) { transform += `rotate(${angle}deg)`; }

        const style: React.CSSProperties = {position: 'absolute', transform};
        return (
            <>
                <div
                    className={cx(
                        OVERLAID_ELEMENT_CLASS,
                        blurred ? `${OVERLAID_ELEMENT_CLASS}--blurred` : undefined
                    )}
                    style={style}
                    // set `element-id` to translate mouse events to paper
                    data-element-id={element.id}
                    tabIndex={0}
                    ref={
                        /* For compatibility with React 19 typings */
                        this.elementRef as React.RefObject<HTMLDivElement>
                    }
                    // Resize element when child image loaded,
                    // works through automatic bubbling for these events in React.
                    // eslint-disable-next-line react/no-unknown-property
                    onLoad={this.onLoadOrErrorEvent}
                    // eslint-disable-next-line react/no-unknown-property
                    onError={this.onLoadOrErrorEvent}>
                    <TemplatedElement {...this.props} />
                </div>
                <div className='reactodia-element-decorations'
                    style={style}
                    ref={
                        /* For compatibility with React 19 typings */
                        this.decorationsRef as React.RefObject<HTMLDivElement>
                    }
                />
            </>
        );
    }

    private onLoadOrErrorEvent = () => {
        const {state, onResize} = this.props;
        if (this.elementRef.current) {
            onResize(state.element, this.elementRef.current);
        }
    };

    componentDidMount() {
        const {state, onResize, renderingState} = this.props;

        if (this.decorationsRef.current) {
            this.decorationsRef.current.appendChild(
                renderingState.ensureDecorationContainer(state.element)
            );
        }

        this.listener.listen(state.element.events, 'requestedFocus', () => {
            this.elementRef.current?.focus();
        });

        if (this.elementRef.current) {
            onResize(state.element, this.elementRef.current);
        }
    }

    componentWillUnmount() {
        const {state, renderingState} = this.props;

        const container = renderingState.ensureDecorationContainer(state.element);
        container.parentElement?.removeChild(container);

        this.listener.stopListening();
    }

    shouldComponentUpdate(nextProps: OverlaidElementProps) {
        return this.props.state !== nextProps.state;
    }

    componentDidUpdate() {
        const {state, onResize} = this.props;
        if (this.elementRef.current) {
            onResize(state.element, this.elementRef.current);
        }
    }
}

class TemplatedElement extends React.Component<OverlaidElementProps> {
    private cachedTemplate: ElementTemplate | undefined;
    private cachedTemplateProps: TemplateProps | undefined;

    render() {
        const {state, renderingState} = this.props;
        const {element, templateProps} = state;
        const template = renderingState.getElementTemplate(element);
        this.cachedTemplate = template;
        this.cachedTemplateProps = templateProps;
        return template.renderElement(templateProps);
    }

    shouldComponentUpdate(nextProps: OverlaidElementProps) {
        const template = nextProps.renderingState.getElementTemplate(nextProps.state.element);
        return !(
            this.cachedTemplate === template &&
            this.cachedTemplateProps === nextProps.state.templateProps
        );
    }
}

function computeIsBlurred(element: Element, view: SharedCanvasState): boolean {
    return Boolean(view.highlighter && !view.highlighter(element));
}

/**
 * Component to display a decoration over a canvas element.
 *
 * All entity decorations are rendered as children of a DOM element
 * with `reactodia-element-decorators` CSS class which immediately follows
 * target canvas element itself in the DOM.
 *
 * Parent DOM elements for the decoration has translation, `width` and `height`
 * set to the same values as the target element to be able to layout decorations
 * via CSS.
 *
 * @category Components
 */
export function ElementDecoration(props: {
    /**
     * Target canvas element to decorate.
     */
    target: Element;
    /**
     * Decoration to render over an element.
     */
    children: React.ReactNode;
}) {
    const {target, children} = props;
    const {canvas} = useCanvas();
    const renderingState = canvas.renderingState as MutableRenderingState;

    return createPortal(
        children,
        renderingState.ensureDecorationContainer(target)
    );
}
