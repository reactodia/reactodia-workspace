import * as React from 'react';

import { useCanvas } from '../../diagram/canvasApi';
import { Element, Link } from '../../diagram/elements';
import { DiagramModel } from '../../diagram/model';

import { AnnotationElement, AnnotationLink } from '../../editor/annotationCells';

import { DragLinkMover, type DragLinkOperation, type DragLinkConnection } from '../utility/dragLinkMover';

export type AnnotationLinkOperation = DragLinkOperation;

export function AnnotationLinkMover(props: {
    operation: AnnotationLinkOperation;
    onFinish: () => void;
}) {
    const {operation, onFinish} = props;
    const {model} = useCanvas();
    return (
        <DragLinkMover operation={operation}
            createLink={(source, target, original) => {
                const link = new AnnotationLink({
                    sourceId: source.id,
                    targetId: target.id,
                    vertices: original?.vertices,
                    linkState: original?.linkState,
                });
                model.addLink(link);
                return link;
            }}
            canConnect={async (source, link, target) => {
                const allowed = (
                    source instanceof AnnotationElement &&
                    link instanceof AnnotationLink &&
                    target !== undefined &&
                    !model.getElementLinks(source).some(link => (
                        link instanceof AnnotationLink &&
                        link.sourceId === source.id &&
                        link.targetId === target.id
                    ))
                );
                return new AnnotationLinkConnection(allowed, model);
            }}
            onFinish={onFinish}
        />
    );
}

class AnnotationLinkConnection implements DragLinkConnection {
    constructor(
        readonly allowed: boolean,
        private readonly model: DiagramModel
    ) {}

    async connect(source: Element, target: Element | undefined): Promise<void> {
        if (!target) {
            return;
        }
        this.model.addLink(new AnnotationLink({sourceId: source.id, targetId: target.id}));
    }

    async moveSource(link: Link, newSource: Element): Promise<void> {
        const batch = this.model.history.startBatch();
        this.model.removeLink(link.id);
        const movedLink = new AnnotationLink({
            id: link.id,
            sourceId: newSource.id,
            targetId: link.targetId,
            vertices: link.vertices,
            linkState: link.linkState,
        });
        this.model.addLink(movedLink);
        batch.store();
        
        this.model.setSelection([movedLink]);
    }

    async moveTarget(link: Link, newTarget: Element): Promise<void> {
        const batch = this.model.history.startBatch();
        this.model.removeLink(link.id);
        const movedLink = new AnnotationLink({
            id: link.id,
            sourceId: link.sourceId,
            targetId: newTarget.id,
            vertices: link.vertices,
            linkState: link.linkState,
        });
        this.model.addLink(movedLink);
        batch.store();

        this.model.setSelection([movedLink]);
    }
}
