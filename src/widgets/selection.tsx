import * as React from 'react';

import { shallowArrayEqual } from '../coreUtils/collections';
import { EventObserver, EventTrigger } from '../coreUtils/events';
import {
    SyncStore, useEventStore, useFrameDebouncedStore, useSyncStore,
} from '../coreUtils/hooks';

import { CanvasApi, CanvasMetrics, useCanvas } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';
import { Element, Link } from '../diagram/elements';
import {
    Rect, SizeProvider, Vector, boundsOf, findElementAtPoint, getContentFittingBox,
} from '../diagram/geometry';
import { DiagramModel } from '../diagram/model';

import type { ConnectionsMenuCommands } from './connectionsMenu';
import {
    SelectionActionRemove, SelectionActionZoomToFit, SelectionActionLayout,
    SelectionActionExpand, SelectionActionConnections,
} from './selectionAction';

export interface SelectionProps {
    /**
     * @default 5
     */
    boxMargin?: number;
    /**
     * @default 2
     */
    itemMargin?: number;
    connectionsMenuCommands?: EventTrigger<ConnectionsMenuCommands>;
    /**
     * `SelectionAction` items representing available actions on the selected elements.
     *
     * **Default**:
     * ```jsx
     * <>
     *   <SelectionActionRemove dock='ne' dockRow={1} />
     *   <SelectionActionZoomToFit dock='ne' dockRow={2} />
     *   <SelectionActionLayout dock='ne' dockRow={3} />
     *   <SelectionActionExpand dock='s' />
     * </>
     * ```
     */
    children?: React.ReactNode;
}

const CLASS_NAME = 'reactodia-selection';

export function Selection(props: SelectionProps) {
    const {model, canvas} = useCanvas();

    const subscribeSelection = useEventStore(model.events, 'changeSelection');
    const selectedElements = useSyncStore(
        subscribeSelection,
        () => model.selection.filter(
            (cell): cell is Element => cell instanceof Element
        ),
        shallowArrayEqual
    );

    const [highlightedBox, setHighlightedBox] = React.useState<Rect | undefined>();
    React.useEffect(() => {
        let origin: PageOrigin | undefined;
        const listener = new EventObserver();
        listener.listen(canvas.events, 'pointerDown', e => {
            if (!e.target && !e.panning && e.sourceEvent.shiftKey) {
                e.sourceEvent.preventDefault();
                const {pageX, pageY} = e.sourceEvent;
                origin = {pageX, pageY};
                setHighlightedBox(makePaperBox(origin, origin, canvas.metrics));
                listenMove();
            }
        });
        let moveListener: EventObserver | undefined;
        const listenMove = () => {
            moveListener?.stopListening();
            moveListener = new EventObserver();
            moveListener.listen(canvas.events, 'pointerMove', e => {
                const {pageX, pageY} = e.sourceEvent;
                if (origin) {
                    setHighlightedBox(makePaperBox(origin, {pageX, pageY}, canvas.metrics));
                }
            });
        };
        listener.listen(canvas.events, 'pointerUp', e => {
            const {pageX, pageY} = e.sourceEvent;
            moveListener?.stopListening();
            setHighlightedBox(undefined);
            if (e.triggerAsClick) {
                if (e.target instanceof Element) {
                    toggleSelected(e.target, model);
                }
            } else if (origin) {
                const selectionBox = makePaperBox(origin, {pageX, pageY}, canvas.metrics);
                applySelection(selectionBox, model, canvas);
            }
            origin = undefined;
        });
        return () => {
            listener.stopListening();
            moveListener?.stopListening();
        };
    }, []);

    if (highlightedBox || selectedElements.length > 1) {
        return (
            <SelectionBox {...props}
                model={model}
                canvas={canvas}
                selectedElements={selectedElements}
                highlightedBox={highlightedBox}
            />
        );
    } else {
        return null;
    }
}

defineCanvasWidget(Selection, element => ({element, attachment: 'overElements'}));

interface PageOrigin {
    readonly pageX: number;
    readonly pageY: number;
}

function makePaperBox(start: PageOrigin, end: PageOrigin, metrics: CanvasMetrics): Rect {
    const {x: x0, y: y0} = metrics.pageToPaperCoords(start.pageX, start.pageY);
    const {x: x1, y: y1} = metrics.pageToPaperCoords(end.pageX, end.pageY);
    return {
        x: Math.min(x0, x1),
        y: Math.min(y0, y1),
        width: Math.abs(x1 - x0),
        height: Math.abs(y1 - y0),
    };
}

function* findUnselectedElements(
    elements: ReadonlyArray<Element>,
    selectionBox: Rect,
    alreadySelected: ReadonlySet<Element | Link>,
    sizeProvider: SizeProvider
): IterableIterator<Element> {
    for (const element of elements) {
        const elementRect = boundsOf(element, sizeProvider);
        if (!alreadySelected.has(element) && Rect.intersects(selectionBox, elementRect)) {
            yield element;
        }
    }
}

function toggleSelected(element: Element, model: DiagramModel): void {
    const {selection} = model;
    const nextSelection = selection.includes(element)
        ? selection.filter(item => item != element)
        : [...selection, element];
    model.setSelection(nextSelection);
}

function applySelection(
    selectionBox: Rect,
    model: DiagramModel,
    canvas: CanvasApi
): void {
    const selection = new Set(model.selection);
    const newlySelected = Array.from(findUnselectedElements(
        model.elements,
        selectionBox,
        selection,
        canvas.renderingState
    ));
    if (newlySelected.length > 0) {
        model.setSelection([...model.selection, ...newlySelected]);
    }
}

interface SelectionBoxProps extends SelectionProps {
    model: DiagramModel;
    canvas: CanvasApi;
    selectedElements: ReadonlyArray<Element>;
    highlightedBox: Rect | undefined;
}

function SelectionBox(props: SelectionBoxProps) {
    const {
        model, canvas, selectedElements, highlightedBox,
        boxMargin = 5,
        itemMargin = 2,
        connectionsMenuCommands,
        children,
    } = props;

    const elementBoundsStore = useElementBoundsStore(model, canvas, selectedElements);
    const elementBoundsDebouncedStore = useFrameDebouncedStore(elementBoundsStore);
    const fittingBox = useSyncStore(
        elementBoundsDebouncedStore,
        () => getContentFittingBox(selectedElements, [], canvas.renderingState),
        Rect.equals
    );
    const selectedBoxStyle = positionStyleForPaperRect(fittingBox, boxMargin, canvas.metrics);

    const highlightedElements = highlightedBox ? Array.from(findUnselectedElements(
        model.elements,
        highlightedBox,
        new Set(selectedElements),
        canvas.renderingState
    )) : [];

    const moveControllerRef = React.useRef<StatefulMoveController | undefined>();
    if (!moveControllerRef.current) {
        moveControllerRef.current = new StatefulMoveController(canvas, model);
    }
    const moveController = moveControllerRef.current;
    moveController.setElements(selectedElements);

    return (
        <div className={CLASS_NAME}>
            {selectedElements.length > 1 ? <>
                {selectedElements.map(element => (
                    <div key={element.id}
                        className={`${CLASS_NAME}__selectedItem`}
                        style={positionStyleForPaperRect(
                            boundsOf(element, canvas.renderingState),
                            itemMargin,
                            canvas.metrics
                        )}
                    />
                ))}
                <div className={`${CLASS_NAME}__selectedActions`}
                    style={selectedBoxStyle}>
                    {children ?? <>
                        <SelectionActionRemove dock='ne' dockRow={1} />
                        <SelectionActionZoomToFit dock='ne' dockRow={2} />
                        <SelectionActionLayout dock='ne' dockRow={3} />
                        <SelectionActionConnections dock='ne'
                            dockRow={4}
                            commands={connectionsMenuCommands}
                        />
                        <SelectionActionExpand dock='s' />
                    </>}
                </div>
                {/* Render box on top of item overlays for correct pointer event handling */}
                <div className={`${CLASS_NAME}__selectedBox`}
                    style={selectedBoxStyle}
                    onClick={moveController.onClick}
                    onPointerDown={moveController.onPointerDown}
                    onPointerMove={moveController.onPointerMove}
                    onPointerUp={moveController.onPointerUp}
                    onPointerCancel={moveController.onPointerUp}
                />
            </> : null}
            {highlightedBox ? (
                <div className={`${CLASS_NAME}__highlightedBox`}
                    style={positionStyleForPaperRect(highlightedBox, 0, canvas.metrics)}
                />
            ) : null}
            {highlightedElements.map(element => (
                <div key={element.id}
                    className={`${CLASS_NAME}__highlightedItem`}
                    style={positionStyleForPaperRect(
                        boundsOf(element, canvas.renderingState),
                        itemMargin,
                        canvas.metrics
                    )}
                />
            ))}
        </div>
    );
}

function useElementBoundsStore(
    model: DiagramModel,
    canvas: CanvasApi,
    elements: ReadonlyArray<Element>
): SyncStore {
    return React.useCallback<SyncStore>(onChange => {
        if (elements.length === 0) {
            return () => {/* void */};
        }
        const elementSet = new Set(elements);
        const listener = new EventObserver();
        listener.listen(model.events, 'elementEvent', ({data}) => {
            if (data.changePosition && elementSet.has(data.changePosition.source)) {
                onChange();
            }
        });
        listener.listen(canvas.renderingState.events, 'changeElementSize', e => {
            if (elementSet.has(e.source)) {
                onChange();
            }
        });
        return () => listener.stopListening();
    }, [model.events, canvas.renderingState.events, elements]);
}

function positionStyleForPaperRect(
    paperRect: Rect,
    margin: number,
    metrics: CanvasMetrics
): Pick<React.CSSProperties, 'left' | 'top' | 'width' | 'height'> {
    const {x: x0, y: y0} = metrics.paperToScrollablePaneCoords(paperRect.x, paperRect.y);
    const {x: x1, y: y1} = metrics.paperToScrollablePaneCoords(
        paperRect.x + paperRect.width,
        paperRect.y + paperRect.height,
    );
    return {
        left: x0 - margin,
        top: y0 - margin,
        width: x1 - x0 + margin * 2,
        height: y1 - y0 + margin * 2,
    };
}

class StatefulMoveController {
    private elements: ReadonlyArray<Element> = [];
    private moveState: {
        readonly origin: Vector;
        readonly positions: ReadonlyMap<Element, Vector>;
    } | undefined;

    constructor(
        private readonly canvas: CanvasApi,
        private readonly model: DiagramModel
    ) {}

    setElements(elements: ReadonlyArray<Element>): void {
        this.elements = elements;
    }

    onClick = (e: React.MouseEvent) => {
        if (this.isToggleSelectionEvent(e)) {
            e.preventDefault();
            const point = this.canvas.metrics.pageToPaperCoords(e.pageX, e.pageY);
            const element = findElementAtPoint(
                this.model.elements,
                point,
                this.canvas.renderingState
            );
            if (element) {
                toggleSelected(element, this.model);
            }
        }
    };

    onPointerDown = (e: React.PointerEvent) => {
        const {canvas, elements} = this;
        if (this.isToggleSelectionEvent(e)) {
            return;
        }
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const origin = canvas.metrics.pageToPaperCoords(e.pageX, e.pageY);
        const positions = new Map<Element, Vector>();
        for (const element of elements) {
            positions.set(element, element.position);
        }
        this.moveState = {origin, positions};
    };

    private isToggleSelectionEvent(e: React.MouseEvent): boolean {
        return e.shiftKey;
    }

    onPointerMove = (e: React.PointerEvent) => {
        const {canvas, moveState} = this;
        if (moveState) {
            e.preventDefault();
            const {x, y} = canvas.metrics.pageToPaperCoords(e.pageX, e.pageY);
            const dx = x - moveState.origin.x;
            const dy = y - moveState.origin.y;
            for (const [element, position] of moveState.positions) {
                element.setPosition({
                    x: position.x + dx,
                    y: position.y + dy,
                });
            }
            canvas.renderingState.syncUpdate();
        }
    };

    onPointerUp = (e: React.PointerEvent) => {
        if (this.moveState) {
            e.preventDefault();
            this.moveState = undefined;
        }
    };
}
