import * as React from 'react';

import { EventObserver } from '../../coreUtils/events';

import {
    TemplateState, TemplateProperties, type AnnotationContent,
} from '../../data/schema';

import { useCanvas } from '../../diagram/canvasApi';
import { placeElementsAroundTarget } from '../../diagram/commands';
import { Element, Link } from '../../diagram/elements';
import { Rect, type SizeProvider,  Vector, boundsOf } from '../../diagram/geometry';

import { AnnotationElement, AnnotationLink } from '../../editor/annotationCells';

import { AnnotationTopic } from '../../workspace/commandBusTopic';
import { useWorkspace } from '../../workspace/workspaceContext';

import { AnnotationLinkMover, type AnnotationLinkOperation } from './annotationLinkMover';

/**
 * Events for {@link AnnotationSupport} event bus.
 *
 * @see {@link AnnotationSupport}
 * @see {@link AnnotationTopic}
 */
export interface AnnotationCommands {
    /**
     * Triggered on a request to query implementations for its capabilities.
     */
    findCapabilities: {
        /**
         * Collects found annotation support capabilities.
         */
        readonly capabilities: Array<Record<string, never>>;
    };
    /**
     * Can be triggered to start drag operaton on an {@link AnnotationLink annotation link}.
     */
    startDragOperation: {
        /**
         * Drag link operation to initiate.
         */
        readonly operation: AnnotationLinkOperation;
    };
    /**
     * Can be triggered to create a new {@link AnnotationElement annotation}
     * for specified targets.
     */
    createAnnotation: {
        /**
         * Target diagram elements to link created annotation to.
         */
        readonly targets: readonly Element[];
        /**
         * Initial annotation content.
         */
        readonly content?: AnnotationContent;
        /**
         * Initial annotation element position.
         */
        readonly position?: Vector;
    };
    /**
     * Can be triggered to open dialog to {@link RenameLinkProvider rename a link}.
     *
     * This action is always available even when {@link AnnotationSupport} is not provided.
     */
    renameLink: {
        /**
         * Target link to rename (change its label).
         */
        readonly target: Link;
    };
}

/**
 * Props for {@link AnnotationSupport} component.
 *
 * @see {@link AnnotationSupport}
 */
export interface AnnotationSupportProps {}

/**
 * Canvas widget component to provide UI support for {@link AnnotationElement annotations}.
 *
 * @category Components
 */
export function AnnotationSupport(props: AnnotationSupportProps) {
    const {getCommandBus} = useWorkspace();

    const {canvas, model} = useCanvas();
    const [mover, setMover] = React.useState<React.ReactElement | null>(null);

    React.useEffect(() => {
        const commands = getCommandBus(AnnotationTopic);
        const listener = new EventObserver();
        listener.listen(commands, 'findCapabilities', e => {
            e.capabilities.push({});
        });
        listener.listen(commands, 'startDragOperation', ({operation}) => {
            setMover(
                <AnnotationLinkMover operation={operation}
                    onFinish={() => setMover(null)}
                />
            );
        });
        listener.listen(commands, 'createAnnotation', ({targets, content, position}) => {
            const batch = model.history.startBatch();

            const annotation = new AnnotationElement({
                elementState: content
                    ? TemplateState.empty.set(TemplateProperties.AnnotationContent, content)
                    : undefined,
            });
            model.addElement(annotation);

            if (position) {
                annotation.setPosition(position);
            } else {
                const outermost = getOutermostElement(targets, canvas.renderingState);
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
            }
            
            for (const element of targets) {
                model.addLink(new AnnotationLink({
                    sourceId: annotation.id,
                    targetId: element.id,
                }));
            }

            batch.store();
            canvas.renderingState.syncUpdate();
        });
        return () => listener.stopListening();
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
