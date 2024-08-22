import { ElementIri } from '../data/model';

import type { CanvasApi } from '../diagram/canvasApi';
import { RestoreGeometry } from '../diagram/commands';
import { Rect, Vector, boundsOf, getContentFittingBox } from '../diagram/geometry';
import { placeElementsAround } from '../diagram/layout';

import { EntityElement, EntityGroup } from './dataElements';

import type { WorkspaceContext } from '../workspace/workspaceContext';

export async function groupEntitiesAnimated(
    elements: ReadonlyArray<EntityElement>,
    canvas: CanvasApi,
    workspace: WorkspaceContext
): Promise<EntityGroup> {
    const {model} = workspace;
    const batch = model.history.startBatch('Group entities');

    const capturedGeometry = RestoreGeometry.captureElementsAndLinks(elements, []);

    const fittingBox = getContentFittingBox(elements, [], canvas.renderingState);
    const groupCenter = Rect.center(fittingBox);
    await canvas.animateGraph(() => {
        for (const element of elements) {
            const bounds = boundsOf(element, canvas.renderingState);
            const atCenter: Vector = {
                x: groupCenter.x - bounds.width / 2,
                y: groupCenter.y - bounds.height / 2,
            };
            const normal = Vector.normalize(Vector.subtract(element.position, groupCenter));
            element.setPosition(Vector.add(
                atCenter,
                Vector.scale(normal, Math.min(bounds.width, bounds.height) / 2)
            ));
        }
    });
    
    batch.history.registerToUndo(capturedGeometry);

    const sortedEntities = [...elements].sort((a, b) => {
        const aLabel = model.locale.formatLabel(a.data.label, a.data.id);
        const bLabel = model.locale.formatLabel(b.data.label, b.data.id);
        return aLabel.localeCompare(bLabel);
    });

    const group = model.group(sortedEntities);
    canvas.renderingState.syncUpdate();

    const bounds = boundsOf(group, canvas.renderingState);
    group.setPosition({
        x: groupCenter.x - bounds.width / 2,
        y: groupCenter.y - bounds.height / 2,
    });

    batch.store();
    return group;
}

export async function ungroupAllEntitiesAnimated(
    groups: ReadonlyArray<EntityGroup>,
    canvas: CanvasApi,
    workspace: WorkspaceContext
): Promise<EntityElement[]> {
    const {model, performLayout} = workspace;
    const batch = model.history.startBatch('Ungroup entities');

    const ungrouped = model.ungroupAll(groups);
    await performLayout({
        canvas,
        selectedElements: new Set(ungrouped),
        animate: true,
        zoomToFit: false,
    });

    batch.store();
    return ungrouped;
}

export async function ungroupSomeEntitiesAnimated(
    group: EntityGroup,
    entities: ReadonlySet<ElementIri>,
    canvas: CanvasApi,
    workspace: WorkspaceContext
): Promise<EntityElement[]> {
    const {model} = workspace;
    const batch = model.history.startBatch('Ungroup entities');

    const ungrouped = model.ungroupSome(group, entities);

    canvas.renderingState.syncUpdate();

    await canvas.animateGraph(() => {
        placeElementsAround({
            elements: ungrouped.filter(element => entities.has(element.data.id)),
            model,
            sizeProvider: canvas.renderingState,
            targetElement: group,
        });
    });

    batch.store();
    return ungrouped;
}
