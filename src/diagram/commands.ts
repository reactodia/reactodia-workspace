import type { LinkTypeIri } from '../data/model';

import type { CanvasApi } from './canvasApi';
import type { Element, Link, LinkTypeVisibility } from './elements';
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

    static captureElementsAndLinks(
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

export function changeLinkTypeVisibility(
    model: DiagramModel,
    linkTypeId: LinkTypeIri,
    visibility: LinkTypeVisibility
): Command {
    return Command.create('Change link type visibility', () => {
        const previous = model.getLinkVisibility(linkTypeId);
        model.setLinkVisibility(linkTypeId, visibility);
        return changeLinkTypeVisibility(model, linkTypeId, previous);
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
