import * as React from 'react';

import { EventObserver } from '../coreUtils/events';
import { TranslatedText } from '../coreUtils/i18n';

import { ElementIri } from '../data/model';

import {
    type CanvasApi, type CanvasDragoverEvent, type CanvasDropEvent, useCanvas,
} from '../diagram/canvasApi';
import { Element } from '../diagram/elements';
import { Vector, boundsOf } from '../diagram/geometry';

import {
    requestElementData, restoreLinksBetweenElements, getAllPresentEntities,
} from '../editor/dataDiagramModel';
import { EntityElement, iterateEntitiesOf } from '../editor/dataElements';

import { WorkspaceEventKey, useWorkspace } from '../workspace/workspaceContext';

/**
 * Props for {@link DropOnCanvas} component.
 *
 * @see {@link DropOnCanvas}
 */
export interface DropOnCanvasProps {
    /**
     * Handler to check whether the drop is allowed.
     *
     * If not specified, all drag events are allowed.
     */
    allowDrop?: (e: CanvasDragoverEvent) => boolean;
    /**
     * Handler to make diagram elements from drop event to add on the canvas.
     *
     * **Default**: {@link defaultGetDroppedOnCanvasItems}
     */
    getDroppedItems?: (e: CanvasDropEvent) => ReadonlyArray<DropOnCanvasItem>;
}

/**
 * Dropped on the canvas item.
 *
 * @see {@link DropOnCanvasProps.getDroppedItems}
 */
export type DropOnCanvasItem = DropItemElement;

/**
 * Dropped on the canvas element to place there.
 *
 * @see {@link DropOnCanvasItem}
 */
export interface DropItemElement {
    readonly type: 'element';
    readonly element: Element;
}

/**
 * Canvas widget component to allow creating elements on the diagram
 * by dragging then dropping an IRI (URI) to the canvas.
 *
 * @category Components
 */
export function DropOnCanvas(props: DropOnCanvasProps) {
    const {allowDrop, getDroppedItems = defaultGetDroppedOnCanvasItems} = props;
    const {canvas} = useCanvas();
    const {model, triggerWorkspaceEvent} = useWorkspace();

    React.useEffect(() => {
        const listener = new EventObserver();
        listener.listen(canvas.events, 'dragover', e => {
            if (!allowDrop || allowDrop(e)) {
                if (e.sourceEvent.dataTransfer) {
                    e.sourceEvent.dataTransfer.dropEffect = 'move';
                }
                e.allowDrop();
            }
        });
        listener.listen(canvas.events, 'drop', e => {
            e.sourceEvent.preventDefault();
    
            const items = getDroppedItems(e);
            if (items.length > 0) {
                const batch = model.history.startBatch(TranslatedText.text('drop_on_canvas.drop.command'));

                const presentOnDiagram = getAllPresentEntities(model);

                const addedIris = new Set<ElementIri>();
                const irisToLoad: ElementIri[] = [];
                const placedElements: Element[] = [];

                for (const item of items) {
                    if (item.type === 'element') {
                        let addElement = false;
                        
                        for (const entity of iterateEntitiesOf(item.element)) {
                            if (!(presentOnDiagram.has(entity.id) || addedIris.has(entity.id))) {
                                addElement = true;
                                addedIris.add(entity.id);
                                if (EntityElement.isPlaceholderData(entity)) {
                                    irisToLoad.push(entity.id);
                                }
                            }
                        }

                        if (addElement) {
                            placedElements.push(item.element);
                        }
                    }
                }

                for (const element of placedElements) {
                    if (!model.getElement(element.id)) {
                        model.addElement(element);
                    }
                }

                placeElements(placedElements, e.position, canvas);
                batch.history.execute(requestElementData(model, irisToLoad));
                batch.history.execute(restoreLinksBetweenElements(model, {
                    addedElements: Array.from(addedIris),
                }));
                batch.store();
    
                if (placedElements.length > 0) {
                    placedElements[placedElements.length - 1].focus();
                }
    
                model.setSelection(placedElements);
    
                triggerWorkspaceEvent(WorkspaceEventKey.editorAddElements);
            }
        });
        return () => listener.stopListening();
    }, [allowDrop, getDroppedItems]);

    return null;
}

/**
 * Default handler to create {@link EntityElement entity elements} from a drop event.
 *
 * The handler tries to extract IRIs from drop event data in the following order:
 *   1. Parse data with `application/x-reactodia-elements` format as JSON array of strings;
 *   2. Decode a URI from a single string with `text/uri-list` format;
 *   3. Use as-is string with `text` format.
 *
 * @see {@link DropOnCanvas}
 * @see {@link DropOnCanvasProps.getDroppedItems}
 */
export function defaultGetDroppedOnCanvasItems(e: CanvasDropEvent): DropOnCanvasItem[] {
    const tryGetIri = (type: string, decode: boolean = false): DropOnCanvasItem[] | undefined => {
        try {
            const iriString = e.sourceEvent.dataTransfer?.getData(type);
            if (!iriString) {
                return undefined;
            }

            let iris: ElementIri[] = [];
            try {
                const parsed: unknown = JSON.parse(iriString);
                if (Array.isArray(parsed)) {
                    iris = parsed.filter((iri): iri is ElementIri => typeof iri === 'string');
                }
            } catch (e) {
                iris = [(decode ? decodeURI(iriString) : iriString)];
            }

            if (iris.length === 0) {
                return undefined;
            }
            return iris.map((iri): DropOnCanvasItem => ({
                type: 'element',
                element: new EntityElement({
                    data: EntityElement.placeholderData(iri),
                }),
            }));
        } catch (e) {
            return undefined;
        }
    };

    return tryGetIri('application/x-reactodia-elements')
        ?? tryGetIri('text/uri-list', true)
        ?? tryGetIri('text') // IE11, Edge
        ?? [];
}

function placeElements(
    elements: ReadonlyArray<Element>,
    position: Vector,
    canvas: CanvasApi
): void {
    for (const element of elements) {
        // Initially anchor element at top left corner to preserve canvas scroll state,
        // measure it and only then move to center-anchored position
        element.setPosition(position);
    }
    canvas.renderingState.syncUpdate();

    let {x, y} = position;
    let isFirst = true;
    for (const element of elements) {
        let {width, height} = boundsOf(element, canvas.renderingState);
        if (width === 0) { width = 100; }
        if (height === 0) { height = 50; }

        if (isFirst) {
            isFirst = false;
            x -= width / 2;
            y -= height / 2;
        }

        element.setPosition({x, y});
        y += height + 20;
    }
}
