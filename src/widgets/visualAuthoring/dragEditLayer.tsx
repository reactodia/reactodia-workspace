import * as React from 'react';

import { MetadataCanConnect } from '../../data/metadataProvider';
import { ElementTypeIri, LinkTypeIri } from '../../data/model';
import { PlaceholderEntityType, PlaceholderRelationType } from '../../data/schema';

import { CanvasApi } from '../../diagram/canvasApi';
import { Element, Link } from '../../diagram/elements';
import { SizeProvider, Vector } from '../../diagram/geometry';

import { TemporaryState } from '../../editor/authoringState';
import { EntityElement, RelationLink } from '../../editor/dataElements';

import { DragLinkMover, DragLinkMoverProps, DragLinkConnection } from '../utility/dragLinkMover';

import { VisualAuthoringTopic } from '../../workspace/commandBusTopic';
import { type WorkspaceContext, useWorkspace } from '../../workspace/workspaceContext';

export interface DragEditLayerProps {
    operation: DragEditOperation;
    onFinishEditing: () => void;
}

/**
 * Describes a graph authoring operation from dragging a link endpoint.
 */
export type DragEditOperation = DragEditConnect | DragEditMoveEndpoint;

/**
 * Graph authoring operation to connect an entity element with some other element.
 */
export interface DragEditConnect {
    /**
     * Graph authoring drag operation type.
     */
    readonly mode: 'connect';
    /**
     * Target entity element to drag a relation link from.
     */
    readonly source: EntityElement;
    /**
     * Restrict the created relation to have only the specified type.
     */
    readonly linkType?: LinkTypeIri;
    /**
     * Initial position for the dragged link endpoint on paper.
     */
    readonly point: Vector;
}

/**
 * Graph authoring operation to move relation link endpoint to another element.
 */
export interface DragEditMoveEndpoint {
    /**
     * Graph authoring drag operation type.
     */
    readonly mode: 'moveSource' | 'moveTarget';
    /**
     * Target relation link to drag an endpoint of.
     */
    readonly link: RelationLink;
    /**
     * Initial position for the dragged link endpoint on paper.
     */
    readonly point: Vector;
}

export function DragEditLayer(props: DragEditLayerProps) {
    const {operation, onFinishEditing} = props;
    const workspace = useWorkspace();
    const {model, editor} = workspace;
    const {metadataProvider} = editor;

    const createLink = React.useCallback<DragLinkMoverProps['createLink']>(
        (source, target, original) => {
            if (original && !(original instanceof RelationLink)) {
                throw new Error('DragEditLayer: cannot clone a non-relation link');
            }
            const linkTemplate = new RelationLink({
                sourceId: source.id,
                targetId: target.id,
                data: {
                    sourceId: source instanceof EntityElement ? source.iri : '',
                    targetId: target instanceof EntityElement ? target.iri : '',
                    linkTypeId: original?.data.linkTypeId ?? PlaceholderRelationType,
                    properties: original?.data.properties ?? {},
                },
                vertices: original?.vertices,
                linkState: original?.linkState,
            });
            const link = editor.createRelation(linkTemplate, {temporary: true});
            if (!original) {
                model.setLinkVisibility(PlaceholderRelationType, 'withoutLabel');
            }
            return link;
        },
        [operation]
    );
    
    const canConnect = React.useCallback<DragLinkMoverProps['canConnect']>(
        async (source, link, target, signal) => {
            const targetEvent =  target instanceof EntityElement
                ? editor.authoringState.elements.get(target.iri) : undefined;

            if (!(
                metadataProvider &&
                link instanceof RelationLink &&
                source instanceof EntityElement &&
                (!target || target instanceof EntityElement) &&
                (!targetEvent || targetEvent.type !== 'entityDelete')
            )) {
                return new EnitityDragConnection([], workspace);
            }

            const canConnect = await metadataProvider.canConnect(
                source.data,
                undefined,
                link.data.linkTypeId === PlaceholderRelationType
                    ? undefined : link.data.linkTypeId,
                {signal}
            );
            return new EnitityDragConnection(canConnect, workspace);
        },
        [metadataProvider]
    );

    const cleanupLink = React.useCallback<Exclude<DragLinkMoverProps['cleanupLink'], undefined>>(
        (link) => {
            if (link instanceof RelationLink) {
                editor.setTemporaryState(
                    TemporaryState.removeRelation(editor.temporaryState, link.data)
                );
            }
        },
        []
    );

    return (
        <DragLinkMover
            operation={operation}
            createLink={createLink}
            canConnect={canConnect}
            cleanupLink={cleanupLink}
            onFinish={onFinishEditing}
        />
    );
}

class EnitityDragConnection implements DragLinkConnection {
    constructor(
        private readonly connections: ReadonlyArray<MetadataCanConnect>,
        private readonly workspace: WorkspaceContext
    ) {}

    get allowed(): boolean {
        return this.connections.length > 0;
    }

    async connect(
        source: Element,
        target: Element | undefined,
        targetPosition: Vector,
        canvas: CanvasApi,
        signal: AbortSignal
    ): Promise<void> {
        if (!(
            source instanceof EntityElement &&
            (!target || target instanceof EntityElement)
        )) {
            return;
        }

        let createdTarget = target;
        if (!createdTarget) {
            createdTarget = await this.createNewElement(signal);
            createdTarget.setPosition(targetPosition);
            canvas.renderingState.syncUpdate();
            setElementCenterAtPoint(createdTarget, targetPosition, canvas.renderingState);
        }

        const modifiedLink = await this.createNewLink(source, createdTarget, signal);
        this.afterCommit(target, createdTarget, modifiedLink);
    }

    async moveSource(
        link: Link,
        newSource: Element,
        canvas: CanvasApi,
        signal: AbortSignal
    ): Promise<void> {
        const {editor} = this.workspace;
        if (!(
            link instanceof RelationLink &&
            newSource instanceof EntityElement
        )) {
            return;
        }
        const modifiedLink = editor.moveRelationSource({link, newSource});
        this.afterCommit(newSource, undefined, modifiedLink);
    }

    async moveTarget(
        link: Link,
        newTarget: Element,
        canvas: CanvasApi,
        signal: AbortSignal
    ): Promise<void> {
        const {editor} = this.workspace;
        if (!(
            link instanceof RelationLink &&
            newTarget instanceof EntityElement
        )) {
            return;
        }
        const modifiedLink = editor.moveRelationTarget({link, newTarget});
        this.afterCommit(newTarget, undefined, modifiedLink);
    }

    private async createNewElement(
        signal: AbortSignal
    ): Promise<EntityElement> {
        const {editor} = this.workspace;
        if (!editor.metadataProvider) {
            throw new Error('Cannot create new entity without metadata provider');
        }
        const elementTypes = new Set<ElementTypeIri>();
        for (const {targetTypes} of this.connections) {
            for (const typeIri of targetTypes) {
                elementTypes.add(typeIri);
            }
        }
        const selectedType = elementTypes.size === 1 ? Array.from(elementTypes)[0] : PlaceholderEntityType;
        const elementModel = await editor.metadataProvider.createEntity(
            selectedType,
            {signal}
        );
        return editor.createEntity(elementModel, {temporary: true});
    }

    private async createNewLink(
        source: EntityElement,
        target: EntityElement,
        signal: AbortSignal
    ): Promise<RelationLink> {
        const {model, editor} = this.workspace;
        if (!editor.metadataProvider) {
            throw new Error('Cannot create new relation without metadata provider');
        }

        const inLinkSet = new Set<LinkTypeIri>();
        const outLinkSet = new Set<LinkTypeIri>();
        for (const {targetTypes, inLinks, outLinks} of this.connections) {
            if (target.data.types.some(type => targetTypes.has(type))) {
                for (const linkType of inLinks) {
                    inLinkSet.add(linkType);
                }
                for (const linkType of outLinks) {
                    outLinkSet.add(linkType);
                }
            }
        }

        const singleInLink = inLinkSet.size === 1 ? [...inLinkSet][0] : undefined;
        const singleOutLink = outLinkSet.size === 1 ? [...outLinkSet][0] : undefined;

        let linkTypeIri: LinkTypeIri;
        let direction: 'in' | 'out';
        if (inLinkSet.size === 0 && singleOutLink) {
            linkTypeIri = singleOutLink;
            direction = 'out';
        } else if (singleInLink && outLinkSet.size === 0) {
            linkTypeIri = singleInLink;
            direction = 'in';
        } else if (singleInLink && singleOutLink && singleInLink === singleOutLink) {
            linkTypeIri = singleOutLink;
            direction = model.findLink(linkTypeIri, source.id, target.id) ? 'in' : 'out';
        } else {
            linkTypeIri = PlaceholderRelationType;
            direction = 'out';
        }

        let [effectiveSource, effectiveTarget] = [source, target];
        // switches source and target if the direction equals 'in'
        if (direction === 'in') {
            [effectiveSource, effectiveTarget] = [effectiveTarget, effectiveSource];
        }
        const data = await editor.metadataProvider.createRelation(
            effectiveSource.data,
            effectiveTarget.data,
            linkTypeIri,
            {signal}
        );
        const link = new RelationLink({
            sourceId: effectiveSource.id,
            targetId: effectiveTarget.id,
            data,
        });
        const existingLink = model.findLink(link.typeId, link.sourceId, link.targetId);
        return existingLink instanceof RelationLink
            ? existingLink : editor.createRelation(link, {temporary: true});
    }

    private afterCommit(
        selectedTarget: EntityElement | undefined,
        createdTarget: EntityElement | undefined,
        modifiedLink: RelationLink
    ): void {
        const {model, getCommandBus} = this.workspace;
        if (selectedTarget) {
            model.setSelection([modifiedLink]);
            getCommandBus(VisualAuthoringTopic)
                .trigger('editRelation', {target: modifiedLink});
        } else if (createdTarget && modifiedLink) {
            model.setSelection([createdTarget]);
            const source = model.getElement(modifiedLink.sourceId) as EntityElement;
            getCommandBus(VisualAuthoringTopic)
                .trigger('findOrCreateEntity', {
                    link: modifiedLink,
                    source,
                    target: createdTarget,
                    targetIsNew: true,
                });
        }
    }
}

function setElementCenterAtPoint(
    element: Element,
    point: Vector,
    sizeProvider: SizeProvider
): void {
    const {width, height} = sizeProvider.getElementSize(element) ?? {width: 0, height: 0};
    element.setPosition({
        x: point.x - width / 2,
        y: point.y - height / 2,
    });
}
