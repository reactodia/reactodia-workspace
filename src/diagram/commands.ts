import { ElementModel, ElementIri, LinkModel, sameLink } from '../data/model';

import type { CanvasApi } from './canvasApi';
import type { Element, Link, RichLinkType } from './elements';
import { Vector, isPolylineEqual } from './geometry';
import { Command } from './history';
import type { DiagramModel } from './model';

export class RestoreGeometry implements Command {
    readonly title = 'Move elements and links';

    constructor(
        private elementState: ReadonlyArray<{ element: Element; position: Vector }>,
        private linkState: ReadonlyArray<{ link: Link; vertices: ReadonlyArray<Vector> }>,
    ) {}

    static capture(model: DiagramModel) {
        return RestoreGeometry.captureElementsAndLinks(model.elements, model.links);
    }

    private static captureElementsAndLinks(
        elements: ReadonlyArray<Element>,
        links: ReadonlyArray<Link>,
    ) {
        return new RestoreGeometry(
            elements.map(element => ({element, position: element.position})),
            links.map(link => ({link, vertices: link.vertices})),
        );
    }

    hasChanges() {
        return this.elementState.length > 0 || this.linkState.length > 0;
    }

    filterOutUnchanged(): RestoreGeometry {
        return new RestoreGeometry(
            this.elementState.filter(
                ({element, position}) => !Vector.equals(element.position, position)
            ),
            this.linkState.filter(
                ({link, vertices}) => !isPolylineEqual(link.vertices, vertices)
            ),
        );
    }

    invoke(): RestoreGeometry {
        const previous = RestoreGeometry.captureElementsAndLinks(
            this.elementState.map(state => state.element),
            this.linkState.map(state => state.link)
        );
        // restore in reverse order to workaround position changed event
        // handling in EmbeddedLayer inside nested elements
        // (child's position change causes group to resize or move itself)
        for (const {element, position} of [...this.elementState].reverse()) {
            element.setPosition(position);
        }
        for (const {link, vertices} of this.linkState) {
            link.setVertices(vertices);
        }
        return previous;
    }
}

export function restoreCapturedLinkGeometry(link: Link): Command {
    const vertices = link.vertices;
    return Command.create('Change link vertices', () => {
        const capturedInverse = restoreCapturedLinkGeometry(link);
        link.setVertices(vertices);
        return capturedInverse;
    });
}

export function setElementExpanded(element: Element, expanded: boolean): Command {
    const title = expanded ? 'Expand element' : 'Collapse element';
    return Command.create(title, () => {
        element.setExpanded(expanded);
        return setElementExpanded(element, !expanded);
    });
}

export function changeLinkTypeVisibility(params: {
    linkType: RichLinkType;
    visible: boolean;
    showLabel: boolean;
}): Command {
    const {linkType, visible, showLabel} = params;
    return Command.create('Change link type visibility', () => {
        const previousVisible = linkType.visible;
        const previousShowLabel = linkType.showLabel;
        linkType.setVisibility({visible, showLabel});
        return changeLinkTypeVisibility({
            linkType,
            visible: previousVisible,
            showLabel: previousShowLabel,
        });
    });
}

export function setElementData(model: DiagramModel, target: ElementIri, data: ElementModel): Command {
    const command = Command.create('Set element data', () => {
        const previous = new Map<Element, ElementModel>();
        for (const element of model.elements.filter(el => el.iri === target)) {
            const previousIri = element.iri;
            previous.set(element, element.data);
            element.setData(data);
            updateLinksToReferByNewIri(model, element, previousIri, data.id);
        }
        return Command.create('Revert element data', () => {
            for (const [element, previousData] of previous) {
                const newIri = element.iri;
                element.setData(previousData);
                updateLinksToReferByNewIri(model, element, newIri, previousData.id);
            }
            return command;
        });
    });
    return command;
}

function updateLinksToReferByNewIri(model: DiagramModel, element: Element, oldIri: ElementIri, newIri: ElementIri) {
    for (const link of model.getElementLinks(element)) {
        let data = link.data;
        if (data.sourceId === oldIri) {
            data = {...data, sourceId: newIri};
        }
        if (data.targetId === oldIri) {
            data = {...data, targetId: newIri};
        }
        link.setData(data);
    }
}

export function setLinkData(model: DiagramModel, oldData: LinkModel, newData: LinkModel): Command {
    if (!sameLink(oldData, newData)) {
        throw new Error('Cannot change typeId, sourceId or targetId when changing link data');
    }
    return Command.create('Set link data', () => {
        for (const link of model.links) {
            if (sameLink(link.data, oldData)) {
                link.setData(newData);
            }
        }
        return setLinkData(model, newData, oldData);
    });
}

export function restoreViewport(canvas: CanvasApi): Command {
    interface CapturedViewport {
        readonly center: Vector;
        readonly scale: number;
    }
    function capture(): CapturedViewport {
        const {metrics} = canvas;
        const {clientWidth, clientHeight} = canvas.metrics.area;
        const center = metrics.clientToPaperCoords(clientWidth / 2, clientHeight / 2);
        const {scale} = metrics.getTransform();
        return {center, scale};
    }
    function apply({center, scale}: CapturedViewport): void {
        canvas.centerTo(center, {scale});
    }
    const initialViewport = capture();
    const command = Command.create('Restore viewport', () => {
        const revertedViewport = capture();
        apply(initialViewport);
        return Command.create('Revert viewport', () => {
            apply(revertedViewport);
            return command;
        });
    });
    return command;
}
