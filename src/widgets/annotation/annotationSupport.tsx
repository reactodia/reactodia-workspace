import * as React from 'react';

import { EventObserver } from '../../coreUtils/events';

import {
    TemplateState, TemplateProperties, type AnnotationContent,
} from '../../data/schema';

import { useCanvas } from '../../diagram/canvasApi';
import { placeElementsAroundTarget } from '../../diagram/commands';
import { Element } from '../../diagram/elements';
import { Rect, type SizeProvider,  Vector, boundsOf } from '../../diagram/geometry';

import { AnnotationElement, AnnotationLink } from '../../editor/annotationCells';

import { AnnotationTopic } from '../../workspace/commandBusTopic';
import type { WorkspaceContext } from '../../workspace/workspaceContext';

import { AnnotationLinkMover, type AnnotationLinkOperation } from './annotationLinkMover';

export interface AnnotationCommands {
    startDragOperation: {
        readonly operation: AnnotationLinkOperation;
    };
    createAnnotation: {
        readonly targets: readonly Element[];
        readonly content?: AnnotationContent;
    };
}

export function AnnotationSupport(props: Pick<WorkspaceContext, 'getCommandBus'>) {
    const {getCommandBus} = props;

    const {canvas, model} = useCanvas();
    const [mover, setMover] = React.useState<React.ReactElement | null>(null);

    React.useEffect(() => {
        const commands = getCommandBus(AnnotationTopic);
        const listener = new EventObserver();
        listener.listen(commands, 'startDragOperation', ({operation}) => {
            setMover(
                <AnnotationLinkMover operation={operation}
                    onFinish={() => setMover(null)}
                />
            );
        });
        listener.listen(commands, 'createAnnotation', ({targets, content}) => {
            const outermost = getOutermostElement(targets, canvas.renderingState);

            const batch = model.history.startBatch();

            const annotation = new AnnotationElement({
                elementState: content
                    ? TemplateState.empty.set(TemplateProperties.AnnotationContent, content)
                    : undefined,
            });
            model.addElement(annotation);

            if (outermost) {
                annotation.setPosition(outermost.position);
                canvas.renderingState.syncUpdate();
                batch.history.execute(placeElementsAroundTarget({
                    elements: [annotation],
                    target: outermost,
                    graph: model,
                    sizeProvider: canvas.renderingState,
                }));
            }
            
            for (const element of targets) {
                model.addLink(new AnnotationLink({
                    sourceId: annotation.id,
                    targetId: element.id,
                }));
            }

            batch.store();
        });
    }, []);

    return (
        <>
            {mover}
        </>
    );
}

function getOutermostElement(elements: readonly Element[], sizeProvider: SizeProvider): Element | undefined {
    let maxDistance = 0;
    let outermost: Element | undefined;
    for (const element of elements) {
        const bounds = boundsOf(element, sizeProvider);
        const distance = Vector.length(Rect.center(bounds));
        if (distance >= maxDistance) {
            maxDistance = distance;
            outermost = element;
        }
    }
    return outermost;
}
