import * as React from 'react';

import { EventObserver } from '../coreUtils/events';

import { Element, Cell } from './elements';
import { Vector, Rect, getContentFittingBox } from './geometry';
import { Paper, PaperTransform } from './paper';
import { CanvasContext } from './canvasApi';

export interface EmbeddedLayerProps {
    elementId: string;
}

interface State {
    paperWidth: number;
    paperHeight: number;
    offsetX: number;
    offsetY: number;
}

export class EmbeddedLayer extends React.Component<EmbeddedLayerProps, State> {
    static contextType = CanvasContext;
    declare readonly context: CanvasContext;

    private readonly listener = new EventObserver();
    private nestedElementListener = new EventObserver();

    private layerOffsetLeft = 0;
    private layerOffsetTop = 0;

    private isApplyingParentMove = false;
    private isNestedElementMoving = false;
    private previousPositions: Array<{ id: string; position: Vector }> = [];

    constructor(props: EmbeddedLayerProps) {
        super(props);
        this.state = {paperWidth: 0, paperHeight: 0, offsetX: 0, offsetY: 0};
    }

    componentDidMount() {
        const {elementId} = this.props;
        const {canvas, model} = this.context;

        const element = model.getElement(elementId)!;

        this.listener.listen(model.events, 'changeGroupContent', ({group, layoutComplete}) => {
            if (group === element.id && layoutComplete) {
                this.listenNestedElements(this.getNestedElements());
                const {offsetX, offsetY} = this.getOffset();
                this.moveNestedElements(offsetX, offsetY);
            }
        });

        this.listener.listen(element.events, 'changePosition', () => {
            if (this.isNestedElementMoving) { return; }

            const {offsetX, offsetY} = this.getOffset();
            const {x, y} = this.getContentFittingBox();

            const diffX = offsetX - x;
            const diffY = offsetY - y;
            this.moveNestedElements(diffX, diffY);

            this.setState({offsetX, offsetY});
        });

        this.listener.listen(canvas.events, 'pointerUp', e => {
            this.isNestedElementMoving = false;
        });

        const nestedElements = this.getNestedElements();
        this.listenNestedElements(nestedElements);

        if (nestedElements.length > 0) {
            const {
                x: offsetX,
                y: offsetY,
                width: paperWidth,
                height: paperHeight,
            } = this.getContentFittingBox();
            this.setState({offsetX, offsetY, paperWidth, paperHeight}, () => element.redraw());
        } else {
            element.requestGroupContent();
        }
    }

    private listenNestedElements(nestedElements: ReadonlyArray<Element>) {
        const {canvas} = this.context;

        const listener = new EventObserver();
        for (const nestedElement of nestedElements) {
            listener.listen(nestedElement.events, 'changePosition', this.recomputeSelfBounds);
        }

        const nestedElementIds = new Set();
        for (const element of nestedElements) {
            nestedElementIds.add(element.id);
        }
        listener.listen(canvas.renderingState.events, 'changeElementSize', e => {
            if (nestedElementIds.has(e.source.id)) {
                this.recomputeSelfBounds();
            }
        });

        this.nestedElementListener.stopListening();
        this.nestedElementListener = listener;
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.nestedElementListener.stopListening();
        this.removeElements();
        this.setState({paperWidth: 0, paperHeight: 0, offsetX: 0, offsetY: 0});
    }

    private getNestedElements() {
        const {elementId} = this.props;
        const {model} = this.context;
        return model.elements.filter(el => el.group === elementId);
    }

    private getContentFittingBox(): Rect {
        const {canvas} = this.context;
        const nestedElements = this.getNestedElements();
        return getContentFittingBox(nestedElements, [], canvas.renderingState);
    }

    private removeElements() {
        const {model} = this.context;
        const batch = model.history.startBatch();
        for (const element of this.getNestedElements()) {
            model.removeElement(element.id);
        }
        batch.discard();
    }

    private getOffset(): { offsetX: number; offsetY: number } {
        const {elementId} = this.props;
        const {model} = this.context;
        const element = model.getElement(elementId)!;

        const {x: elementX, y: elementY} = element.position;
        const offsetX = elementX + this.layerOffsetLeft;
        const offsetY = elementY + this.layerOffsetTop;

        return {offsetX, offsetY};
    }

    private moveNestedElements(offsetX: number, offsetY: number) {
        this.isApplyingParentMove = true;
        try {
            for (const element of this.getNestedElements()) {
                const {x, y} = element.position;
                const newPosition = {x: x + offsetX, y: y + offsetY};
                element.setPosition(newPosition);
            }
        } finally {
            this.isApplyingParentMove = false;
            this.recomputeSelfBounds();
        }
    }

    private recomputeSelfBounds = () => {
        if (this.isApplyingParentMove) { return; }

        const {elementId} = this.props;
        const {model} = this.context;
        const element = model.getElement(elementId)!;

        const {x: offsetX, y: offsetY, width: paperWidth, height: paperHeight} = this.getContentFittingBox();

        if (this.isNestedElementMoving) {
            const position = {
                x: offsetX - this.layerOffsetLeft,
                y: offsetY - this.layerOffsetTop,
            };
            element.setPosition(position);
        }

        this.setState({offsetX, offsetY, paperWidth, paperHeight}, () => element.redraw());
    };

    private onPaperPointerDown = (e: React.MouseEvent<HTMLElement>, cell: Cell | undefined) => {
        if (e.button !== 0 /* left mouse button */) {
            return;
        }

        if (cell && cell instanceof Element) {
            e.preventDefault();
            this.isNestedElementMoving = true;
        }
    };

    private calculateOffset(layer: HTMLElement): { left: number; top: number } {
        const {canvas} = this.context;
        const scale = canvas.getScale();
        const parent = findParentElement(layer);
        const {left, top} = layer.getBoundingClientRect();
        const {left: parentLeft, top: parentTop} = parent.getBoundingClientRect();

        return {left: (left - parentLeft) / scale, top: (top - parentTop) / scale};
    }

    private onLayerInit = (layer: HTMLElement | null) => {
        if (!layer) { return; }

        const {left, top} = this.calculateOffset(layer);

        this.layerOffsetLeft = left;
        this.layerOffsetTop = top;
    };

    render() {
        const {elementId} = this.props;
        const {canvas, model, view} = this.context;
        const {paperWidth, paperHeight, offsetX, offsetY} = this.state;

        const paperTransform: PaperTransform = {
            width: paperWidth,
            height: paperHeight,
            originX: -offsetX,
            originY: -offsetY,
            scale: 1,
            paddingX: 0,
            paddingY: 0,
        };

        return (
            <div className='ontodia-embedded-layer' ref={this.onLayerInit}>
                <Paper model={model}
                    view={view}
                    renderingState={canvas.renderingState}
                    paperTransform={paperTransform}
                    onPointerDown={this.onPaperPointerDown}
                    group={elementId}
                />
            </div>
        );
    }
}

function findParentElement(layer: HTMLElement): HTMLElement {
    const parent = layer.parentElement;
    if (!parent) {
        throw new Error('Cannot find parent diagram element for EmbeddedLayer');
    } else if (parent.hasAttribute('data-element-id')) {
        return parent;
    } else {
        return findParentElement(parent);
    }
}
