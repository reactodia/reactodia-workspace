import * as React from 'react';
import { findDOMNode } from 'react-dom';

import { EventObserver } from '../coreUtils/events';
import {
    KeyedObserver, observeElementTypes, observeProperties,
} from '../coreUtils/keyedObserver';
import { Debouncer } from '../coreUtils/scheduler';

import { ElementTypeIri, PropertyTypeIri } from '../data/model';
import { TemplateProps } from './customization';

import { setElementExpanded } from './commands';
import { Element } from './elements';
import { DiagramModel } from './model';
import { RenderingState, RenderingLayer } from './renderingState';
import { SharedCanvasState, IriClickIntent } from './sharedCanvasState';

export interface ElementLayerProps {
    model: DiagramModel;
    renderingState: RenderingState;
    style: React.CSSProperties;
}

interface State {
    readonly elementStates: ReadonlyMap<string, ElementState>;
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
}

interface RedrawBatch {
    requests: Map<string, RedrawFlags>;
    forAll: RedrawFlags;
}

interface SizeUpdateRequest {
    element: Element;
    node: HTMLDivElement;
}

export class ElementLayer extends React.Component<ElementLayerProps, State> {
    private readonly listener = new EventObserver();

    private redrawBatch: RedrawBatch = {
        requests: new Map<string, RedrawFlags>(),
        forAll: RedrawFlags.None,
    };
    private delayedRedraw = new Debouncer();
    private readonly memoizedElements = new WeakMap<ElementState, JSX.Element>();

    private sizeRequests = new Map<string, SizeUpdateRequest>();
    private delayedUpdateSizes = new Debouncer();

    constructor(props: ElementLayerProps) {
        super(props);
        const {model, renderingState} = this.props;
        this.state = {
            elementStates: applyRedrawRequests(
                model,
                renderingState.shared,
                this.redrawBatch,
                new Map<string, ElementState>()
            )
        };
    }

    render() {
        const {style, model, renderingState} = this.props;
        const {elementStates} = this.state;
        const {memoizedElements} = this;

        const elementsToRender: ElementState[] = [];
        for (const {id} of model.elements) {
            const state = elementStates.get(id);
            if (state) {
                elementsToRender.push(state);
            }
        }

        return (
            <div className='reactodia-element-layer'
                style={style}>
                {elementsToRender.map(state => {
                    let overlaidElement = memoizedElements.get(state);
                    if (!overlaidElement) {
                        overlaidElement = (
                            <OverlaidElement key={state.element.id}
                                state={state}
                                model={model}
                                renderingState={renderingState}
                                onInvalidate={this.requestRedraw}
                                onResize={this.requestSizeUpdate}
                            />
                        );
                        const elementDecoration = renderingState.shared._decorateElement(state.element);
                        if (elementDecoration) {
                            overlaidElement = (
                                <React.Fragment key={state.element.id}>
                                    {overlaidElement}
                                    {elementDecoration}
                                </React.Fragment>
                            );
                        }
                        memoizedElements.set(state, overlaidElement);
                    }
                    return overlaidElement;
                })}
            </div>
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
        this.listener.listen(model.events, 'elementEvent', ({data}) => {
            const invalidatesTemplate = data.changeData || data.changeExpanded || data.changeElementState;
            if (invalidatesTemplate) {
                this.requestRedraw(invalidatesTemplate.source, RedrawFlags.RecomputeTemplate);
            }
            const invalidatesRender = data.changePosition || data.requestedRedraw;
            if (invalidatesRender) {
                this.requestRedraw(invalidatesRender.source, RedrawFlags.Render);
            }
        });
        this.listener.listen(model.events, 'changeLanguage', () => {
            this.requestRedrawAll(RedrawFlags.RecomputeTemplate);
        });
        this.listener.listen(renderingState.shared.events, 'changeHighlight', () => {
            this.requestRedrawAll(RedrawFlags.RecomputeBlurred);
        });
        this.listener.listen(renderingState.events, 'syncUpdate', ({layer}) => {
            if (layer === RenderingLayer.Element) {
                this.delayedRedraw.runSynchronously();
            } else if (layer === RenderingLayer.ElementSize) {
                this.delayedUpdateSizes.runSynchronously();
            }
        });
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.delayedRedraw.dispose();
        this.delayedUpdateSizes.dispose();
    }

    private requestRedraw = (element: Element, request: RedrawFlags) => {
        const flagsWithForAll = this.redrawBatch.forAll | request;
        if (flagsWithForAll === this.redrawBatch.forAll) {
            // forAll flags already include the request
            return;
        }
        const existing = this.redrawBatch.requests.get(element.id) || RedrawFlags.None;
        this.redrawBatch.requests.set(element.id, existing | request);
        this.delayedRedraw.call(this.redrawElements);
    };

    private requestRedrawAll(request: RedrawFlags) {
        this.redrawBatch.forAll |= request;
        this.delayedRedraw.call(this.redrawElements);
    }

    private redrawElements = () => {
        this.setState((state, props): State => ({
            elementStates: applyRedrawRequests(
                props.model,
                props.renderingState.shared,
                this.redrawBatch,
                state.elementStates
            )
        }));
    };

    private requestSizeUpdate = (element: Element, node: HTMLDivElement) => {
        this.sizeRequests.set(element.id, {element, node});
        this.delayedUpdateSizes.call(this.recomputeQueuedSizes);
    };

    private recomputeQueuedSizes = () => {
        const {renderingState} = this.props;
        const batch = this.sizeRequests;
        this.sizeRequests = new Map<string, SizeUpdateRequest>();
        batch.forEach(({element, node}) => {
            const {clientWidth, clientHeight} = node;
            renderingState.setElementSize(element, {width: clientWidth, height: clientHeight});
        });
    };
}

function applyRedrawRequests(
    model: DiagramModel,
    view: SharedCanvasState,
    batch: RedrawBatch,
    previous: ReadonlyMap<string, ElementState>,
): ReadonlyMap<string, ElementState> {
    if (batch.forAll === RedrawFlags.None && batch.requests.size === 0) {
        return previous;
    }
    const computed = new Map<string, ElementState>();
    for (const element of model.elements) {
        const elementId = element.id;
        let state = previous.get(elementId);
        if (state) {
            const request = (batch.requests.get(elementId) || RedrawFlags.None) | batch.forAll;
            if (request & RedrawFlags.Render) {
                state = {
                    element,
                    templateProps:
                        (request & RedrawFlags.RecomputeTemplate) === RedrawFlags.RecomputeTemplate
                            ? computeTemplateProps(state.element) : state.templateProps,
                    blurred:
                        (request & RedrawFlags.RecomputeBlurred) === RedrawFlags.RecomputeBlurred
                            ? computeIsBlurred(state.element, view) : state.blurred,
                };
            }
            computed.set(elementId, state);
            batch.requests.delete(elementId);
        } else {
            computed.set(element.id, {
                element,
                templateProps: computeTemplateProps(element),
                blurred: computeIsBlurred(element, view),
            });
        }
    }
    batch.forAll = RedrawFlags.None;
    return computed;
}

function computeTemplateProps(model: Element): TemplateProps {
    return {
        elementId: model.id,
        data: model.data,
        isExpanded: model.isExpanded,
        elementState: model.elementState,
    };
}

interface OverlaidElementProps {
    state: ElementState;
    model: DiagramModel;
    renderingState: RenderingState;
    onInvalidate: (model: Element, request: RedrawFlags) => void;
    onResize: (model: Element, node: HTMLDivElement) => void;
}

class OverlaidElement extends React.Component<OverlaidElementProps> {
    private readonly listener = new EventObserver();
    private disposed = false;

    private typesObserver!: KeyedObserver<ElementTypeIri>;
    private propertiesObserver!: KeyedObserver<PropertyTypeIri>;

    private rerenderTemplate = () => {
        if (this.disposed) { return; }
        this.props.onInvalidate(this.props.state.element, RedrawFlags.RecomputeTemplate);
    };

    render(): React.ReactElement<any> {
        const {state: {element, blurred}} = this.props;
        if (element.temporary) {
            return <div />;
        }

        const {x = 0, y = 0} = element.position;
        const transform = `translate(${x}px,${y}px)`;

        // const angle = model.get('angle') || 0;
        // if (angle) { transform += `rotate(${angle}deg)`; }

        const className = (
            `reactodia-overlaid-element ${blurred ? 'reactodia-overlaid-element--blurred' : ''}`
        );
        return <div className={className}
            // set `element-id` to translate mouse events to paper
            data-element-id={element.id}
            style={{position: 'absolute', transform}}
            tabIndex={0}
            ref={this.onMount}
            // Resize element when child image loaded,
            // works through automatic bubbling for these events in React.
            // eslint-disable-next-line react/no-unknown-property
            onLoad={this.onLoadOrErrorEvent}
            // eslint-disable-next-line react/no-unknown-property
            onError={this.onLoadOrErrorEvent}
            onClick={this.onClick}
            onDoubleClick={this.onDoubleClick}>
            <TemplatedElement {...this.props} />
        </div>;
    }

    private onMount = (node: HTMLDivElement | null) => {
        if (!node) { return; }
        const {state, onResize} = this.props;
        onResize(state.element, node);
    };

    private onLoadOrErrorEvent = () => {
        const {state, onResize} = this.props;
        // TODO: replace findDOMNode() usage by accessing a ref
        // eslint-disable-next-line react/no-find-dom-node
        onResize(state.element, findDOMNode(this) as HTMLDivElement);
    };

    private onClick = (e: React.MouseEvent<EventTarget>) => {
        if (e.target instanceof HTMLElement && e.target.localName === 'a') {
            const anchor = e.target as HTMLAnchorElement;
            const {renderingState, state} = this.props;
            const rawIntent = e.target.getAttribute('data-iri-click-intent') as IriClickIntent;
            const clickIntent: IriClickIntent = rawIntent === 'openEntityIri'
                ? 'openEntityIri' : 'openOtherIri';
            renderingState.shared.onIriClick(
                decodeURI(anchor.href),
                state.element,
                clickIntent,
                e
            );
        }
    };

    private onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const {model, state: {element}} = this.props;
        model.history.execute(
            setElementExpanded(element, !element.isExpanded)
        );
    };

    componentDidMount() {
        const {state, model} = this.props;
        this.listener.listen(state.element.events, 'requestedFocus', () => {
            // TODO: replace findDOMNode() usage by accessing a ref
            // eslint-disable-next-line react/no-find-dom-node
            const element = findDOMNode(this) as HTMLElement;
            if (element) { element.focus(); }
        });
        this.typesObserver = observeElementTypes(
            model, 'changeLabel', this.rerenderTemplate
        );
        this.propertiesObserver = observeProperties(
            model, 'changeLabel', this.rerenderTemplate
        );
        this.observeTypes();
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.typesObserver.stopListening();
        this.propertiesObserver.stopListening();
        this.disposed = true;
    }

    shouldComponentUpdate(nextProps: OverlaidElementProps) {
        return this.props.state !== nextProps.state;
    }

    componentDidUpdate() {
        this.observeTypes();
        // TODO: replace findDOMNode() usage by accessing a ref
        // eslint-disable-next-line react/no-find-dom-node
        this.props.onResize(this.props.state.element, findDOMNode(this) as HTMLDivElement);
    }

    private observeTypes() {
        const {state: {element}} = this.props;
        this.typesObserver.observe(element.data.types);
        this.propertiesObserver.observe(Object.keys(element.data.properties) as PropertyTypeIri[]);
    }
}

class TemplatedElement extends React.Component<OverlaidElementProps> {
    private cachedTemplateClass: React.ComponentType<TemplateProps> | undefined;
    private cachedTemplateProps: TemplateProps | undefined;

    render() {
        const {state, renderingState} = this.props;
        const {element, templateProps} = state;
        const templateClass = renderingState.getElementTemplate(element.data.types);
        this.cachedTemplateClass = templateClass;
        this.cachedTemplateProps = templateProps;
        return React.createElement(templateClass, templateProps);
    }

    shouldComponentUpdate(nextProps: OverlaidElementProps) {
        const templateClass = nextProps.renderingState.getElementTemplate(nextProps.state.element.data.types);
        return !(
            this.cachedTemplateClass === templateClass &&
            this.cachedTemplateProps === nextProps.state.templateProps
        );
    }
}

function computeIsBlurred(element: Element, view: SharedCanvasState): boolean {
    return Boolean(view.highlighter && !view.highlighter(element));
}
