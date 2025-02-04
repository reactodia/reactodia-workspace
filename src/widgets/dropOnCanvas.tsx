import * as React from 'react';

import { EventObserver } from '../coreUtils/events';

import { ElementIri } from '../data/model';

import { CanvasApi, useCanvas } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';
import { Vector, boundsOf } from '../diagram/geometry';

import { DataDiagramModel, requestElementData, restoreLinksBetweenElements } from '../editor/dataDiagramModel';
import { EntityElement } from '../editor/dataElements';

import { WorkspaceEventKey, useWorkspace } from '../workspace/workspaceContext';

/**
 * Props for {@link DropOnCanvas} component.
 *
 * @see {@link DropOnCanvas}
 */
export interface DropOnCanvasProps {}

/**
 * Canvas widget component to allow creating entity elements on the diagram
 * by dragging then dropping a URL (IRI) to the canvas.
 *
 * @category Components
 */
export function DropOnCanvas(props: DropOnCanvasProps) {
    const {canvas} = useCanvas();
    const {model, triggerWorkspaceEvent} = useWorkspace();

    React.useEffect(() => {
        const listener = new EventObserver();
        listener.listen(canvas.events, 'drop', e => {
            e.sourceEvent.preventDefault();
    
            const iris = tryParseDefaultDragAndDropData(e.sourceEvent);
            if (iris.length > 0) {
                const batch = model.history.startBatch({titleKey: 'drop_on_canvas.drop.command'});
                const placedElements = placeElements(iris, e.position, canvas, model);
                const irisToLoad = placedElements.map(elem => elem.iri);
                batch.history.execute(requestElementData(model, irisToLoad));
                batch.history.execute(restoreLinksBetweenElements(model, {
                    addedElements: iris,
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
    }, []);

    return null;
}

defineCanvasWidget(DropOnCanvas, element => ({element, attachment: 'viewport'}));

function tryParseDefaultDragAndDropData(e: DragEvent): ElementIri[] {
    const tryGetIri = (type: string, decode: boolean = false) => {
        try {
            const iriString = e.dataTransfer!.getData(type);
            if (!iriString) { return undefined; }
            let iris: ElementIri[];
            try {
                iris = JSON.parse(iriString);
            } catch (e) {
                iris = [(decode ? decodeURI(iriString) : iriString) as ElementIri];
            }
            return iris.length === 0 ? undefined : iris;
        } catch (e) {
            return undefined;
        }
    };

    return tryGetIri('application/x-reactodia-elements')
        || tryGetIri('text/uri-list', true)
        || tryGetIri('text') // IE11, Edge
        || [];
}

function placeElements(
    dragged: ReadonlyArray<ElementIri>,
    position: Vector,
    canvas: CanvasApi,
    model: DataDiagramModel
): EntityElement[] {
    const elements = dragged.map(item => model.createElement(item));
    for (const element of elements) {
        // initially anchor element at top left corner to preserve canvas scroll state,
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

    return elements;
}
