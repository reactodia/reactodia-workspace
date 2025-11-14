import { TranslatedText } from '../coreUtils/i18n';

import { ElementIri } from '../data/model';

import type { CanvasApi } from '../diagram/canvasApi';
import { RestoreGeometry, placeElementsAroundTarget } from '../diagram/commands';
import { Rect, Vector, boundsOf, getContentFittingBox } from '../diagram/geometry';

import { EntityElement, EntityGroup } from './dataElements';

import type { WorkspaceContext } from '../workspace/workspaceContext';

/**
 * Parameters for {@link groupEntities} function.
 */
export interface GroupEntitiesParams {
    /**
     * Selected elements to group.
     */
    elements: ReadonlyArray<EntityElement>;
    /**
     * Target canvas to get element sizes from for animation.
     */
    canvas: CanvasApi;
}

/**
 * Groups **with animation** multiple {@link EntityElement entity elements} into
 * an {@link EntityGroup entity group}.
 *
 * The grouping operation is performed with {@link DataDiagramModel.group} method.
 *
 * The operation puts a command to the {@link DiagramModel.history command history}.
 *
 * @see {@link ungroupAllEntities}
 * @see {@link ungroupSomeEntities}
 */
export async function groupEntities(
    workspace: WorkspaceContext,
    params: GroupEntitiesParams
): Promise<EntityGroup> {
    const {model} = workspace;
    const {elements, canvas} = params;

    const batch = model.history.startBatch(
        TranslatedText.text('workspace.group_entities.command')
    );

    const capturedGeometry = RestoreGeometry.capturePartial(elements, []);

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
        const aLabel = model.locale.formatEntityLabel(a.data, model.language);
        const bLabel = model.locale.formatEntityLabel(b.data, model.language);
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

/**
 * Parameters for {@link ungroupAllEntities} function.
 */
export interface UngroupAllEntitiesParams {
    /**
     * Selected groups to ungroup all entities from.
     */
    groups: ReadonlyArray<EntityGroup>;
    /**
     * Target canvas to get element sizes from for animation.
     */
    canvas: CanvasApi;
}

/**
 * Ungroups **with animation** one or many {@link EntityGroup entity groups} into
 * all contained {@link EntityElement entity elements}.
 *
 * The ungrouping operation is performed with {@link DataDiagramModel.ungroupAll} method.
 *
 * The operation puts a command to the {@link DiagramModel.history command history}.
 *
 * @see {@link groupEntities}
 * @see {@link ungroupSomeEntities}
 */
export async function ungroupAllEntities(
    workspace: WorkspaceContext,
    params: UngroupAllEntitiesParams
): Promise<EntityElement[]> {
    const {model, performLayout} = workspace;
    const {groups, canvas} = params;

    const batch = model.history.startBatch(
        TranslatedText.text('workspace.ungroup_entities.command')
    );

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

/**
 * Parameters for {@link ungroupSomeEntities} function.
 */
export interface UngroupSomeEntitiesParams {
    /**
     * Selected group to ungroup some entities from.
     */
    group: EntityGroup;
    /**
     * Subset of entities to ungroup from the target group.
     */
    entities: ReadonlySet<ElementIri>;
    /**
     * Target canvas to get element sizes from for animation.
     */
    canvas: CanvasApi;
}

/**
 * Ungroups **with animation** some {@link EntityElement entity elements} from
 * an {@link EntityGroup entity group}.
 *
 * The ungrouping operation is performed with {@link DataDiagramModel.ungroupSome} method.
 *
 * The operation puts a command to the {@link DiagramModel.history command history}.
 *
 * @see {@link groupEntities}
 * @see {@link ungroupAllEntities}
 */
export async function ungroupSomeEntities(
    workspace: WorkspaceContext,
    params: UngroupSomeEntitiesParams
): Promise<EntityElement[]> {
    const {model} = workspace;
    const {group, entities, canvas} = params;

    const batch = model.history.startBatch(
        TranslatedText.text('workspace.ungroup_entities.command')
    );

    const ungrouped = model.ungroupSome(group, entities);

    canvas.renderingState.syncUpdate();

    await canvas.animateGraph(() => {
        batch.history.execute(placeElementsAroundTarget({
            target: group,
            elements: ungrouped.filter(element => entities.has(element.data.id)),
            graph: model,
            sizeProvider: canvas.renderingState,
        }));
    });

    batch.store();
    return ungrouped;
}
