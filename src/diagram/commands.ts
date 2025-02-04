import type { LinkTypeIri } from '../data/model';

import type { CanvasApi } from './canvasApi';
import type {
    Element, ElementTemplateState, Link, LinkTemplateState, LinkTypeVisibility,
} from './elements';
import {
    SizeProvider, Vector, boundsOf, isPolylineEqual, calculateAveragePosition,
} from './geometry';
import { Command, CommandMetadata } from './history';
import type { DiagramModel, GraphStructure } from './model';

/**
 * Command to restore element positions and link geometry (vertices) on a canvas.
 *
 * **Example**:
 * ```ts
 * const capturedGeometry = RestoreGeometry.capture(model);
 * // ... (move elements, change link vertices) ...
 * restoreGeometry = capturedGeometry.filterOutUnchanged();
 * if (restoreGeometry.hasChanges()) {
 *     model.history.registerToUndo(restoreGeometry);
 * }
 * ```
 *
 * @category Commands
 */
export class RestoreGeometry implements Command {
    readonly metadata: CommandMetadata = {
        titleKey: 'commands.restore_geometry.title',
    };

    private constructor(
        private elementState: ReadonlyArray<{ element: Element; position: Vector }>,
        private linkState: ReadonlyArray<{ link: Link; vertices: ReadonlyArray<Vector> }>,
    ) {}

    /**
     * Creates {@link RestoreGeometry} command with captured geometry for all diagram content.
     */
    static capture(graph: GraphStructure): RestoreGeometry {
        return RestoreGeometry.capturePartial(graph.elements, graph.links);
    }

    /**
     * Creates {@link RestoreGeometry} command with captured geometry for the specified
     * subset of a diagram content.
     */
    static capturePartial(
        elements: ReadonlyArray<Element>,
        links: ReadonlyArray<Link>,
    ): RestoreGeometry {
        return new RestoreGeometry(
            elements.map(element => ({element, position: element.position})),
            links.map(link => ({link, vertices: link.vertices})),
        );
    }

    get title(): string | undefined {
        return this.metadata.title;
    }

    /**
     * Returns `true` if command contains any captured geometry state to restore,
     * otherwise `false`.
     */
    hasChanges(): boolean {
        return this.elementState.length > 0 || this.linkState.length > 0;
    }

    /**
     * Creates a derived {@link RestoreGeometry} command by removing any geometry state
     * which is equal to the current diagram content geometry state.
     *
     * This is useful to avoid adding a command without actual changes to the command history
     * and to reduce the amount of memory to store captured geometry withing the command.
     */
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
        const previous = RestoreGeometry.capturePartial(
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

/**
 * Command to restore single link geometry (vertices) on a canvas.
 *
 * **Example**:
 * ```ts
 * const restoreLink = restoreCapturedLinkGeometry(link);
 * new LinkVertex(link, 0).remove();
 * model.history.registerToUndo(restoreLink);
 * ```
 *
 * @category Commands
 */
export function restoreCapturedLinkGeometry(link: Link): Command {
    const vertices = link.vertices;
    return Command.create({titleKey: 'commands.restore_link_vertices.title'}, () => {
        const capturedInverse = restoreCapturedLinkGeometry(link);
        link.setVertices(vertices);
        return capturedInverse;
    });
}

/**
 * Command to set {@link Element.elementState element template state}.
 *
 * @category Commands
 */
export function setElementState(element: Element, state: ElementTemplateState | undefined): Command {
    return Command.create({titleKey: 'commands.set_element_state.title'}, () => {
        const previous = element.elementState;
        element.setElementState(state);
        return setElementState(element, previous);
    });
}

/**
 * Command to toggle element expanded or collapsed.
 *
 * @category Commands
 */
export function setElementExpanded(element: Element, expanded: boolean): Command {
    return Command.create(
        {
            titleKey: expanded
                ? 'commands.expand_element.title'
                : 'commands.collapse_element.title'
        },
        () => {
            element.setExpanded(expanded);
            return setElementExpanded(element, !expanded);
        }
    );
}

/**
 * Command to set link template state.
 *
 * @category Commands
 */
export function setLinkState(link: Link, state: LinkTemplateState | undefined): Command {
    return Command.create({titleKey: 'commands.set_link_state.title'}, () => {
        const previous = link.linkState;
        link.setLinkState(state);
        return setLinkState(link, previous);
    });
}

/**
 * Command to change link type visibility.
 *
 * @category Commands
 */
export function changeLinkTypeVisibility(
    model: DiagramModel,
    linkTypeId: LinkTypeIri,
    visibility: LinkTypeVisibility
): Command {
    return Command.create({titleKey: 'commands.change_link_type_visibility.title'}, () => {
        const previous = model.getLinkVisibility(linkTypeId);
        model.setLinkVisibility(linkTypeId, visibility);
        return changeLinkTypeVisibility(model, linkTypeId, previous);
    });
}

/**
 * Command to restore canvas viewport position and scale.
 *
 * **Example**:
 * ```ts
 * const restoreScale = restoreViewport(canvas);
 * canvas.zoomToFit();
 * model.registerToUndo(restoreScale);
 * ```
 *
 * @category Commands
 */
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
    const command = Command.create({titleKey: 'commands.restore_viewport.title'}, () => {
        const revertedViewport = capture();
        apply(initialViewport);
        return Command.create({titleKey: 'commands.restore_viewport.title'}, () => {
            apply(revertedViewport);
            return command;
        });
    });
    return command;
}

/**
 * Command to move specified `elements` at the distance around `target` element,
 * trying to minimize overlapping elements.
 *
 * @category Commands
 */
export function placeElementsAroundTarget(params: {
    /**
     * Elements to place around the target element.
     */
    elements: ReadonlyArray<Element>;
    /**
     * Target element around which to place elements.
     */
    target: Element;
    /**
     * Diagram model to get graph structure for optimal placement.
     */
    graph: GraphStructure;
    /**
     * Size provider for the elements.
     */
    sizeProvider: SizeProvider;
    /**
     * Preferred distance from the target to place elements.
     *
     * @default 300
     */
    distance?: number;
}): Command {
    const {
        elements, target, graph, sizeProvider,
        distance = 300,
    } = params;

    const commandBody = (): Command => {
        const capturedGeometry = RestoreGeometry.capture(graph);

        const targetElementBounds = boundsOf(target, sizeProvider);
        const targetPosition: Vector = {
            x: targetElementBounds.x + targetElementBounds.width / 2,
            y: targetElementBounds.y + targetElementBounds.height / 2,
        };
        let outgoingAngle = 0;
        const targetLinks = graph.getElementLinks(target);
        if (targetLinks.length > 0) {
            const averageSourcePosition = calculateAveragePosition(
                targetLinks.map(link => {
                    const linkSource = graph.sourceOf(link)!;
                    return linkSource !== target ? linkSource : graph.targetOf(link)!;
                }),
                sizeProvider
            );
            const vectorDiff: Vector = {
                x: targetPosition.x - averageSourcePosition.x,
                y: targetPosition.y - averageSourcePosition.y,
            };
            if (vectorDiff.x !== 0 || vectorDiff.y !== 0) {
                outgoingAngle = Math.atan2(vectorDiff.y, vectorDiff.x);
            }
        }

        const step = Math.min(Math.PI / elements.length, Math.PI / 6);
        const elementStack: Element[]  = [...elements];

        const placeElementFromStack = (curAngle: number, element: Element) => {
            if (element) {
                const {width, height} = boundsOf(element, sizeProvider);
                element.setPosition({
                    x: targetPosition.x + distance * Math.cos(curAngle) - width / 2,
                    y: targetPosition.y + distance * Math.sin(curAngle) - height / 2,
                });
            }
        };

        const isOddLength = elementStack.length % 2 === 0;
        if (isOddLength) {
            for (let angle = step / 2; elementStack.length > 0; angle += step) {
                placeElementFromStack(outgoingAngle - angle, elementStack.pop()!);
                placeElementFromStack(outgoingAngle + angle, elementStack.pop()!);
            }
        } else {
            placeElementFromStack(outgoingAngle, elementStack.pop()!);
            for (let angle = step; elementStack.length > 0; angle += step) {
                placeElementFromStack(outgoingAngle - angle, elementStack.pop()!);
                placeElementFromStack(outgoingAngle + angle, elementStack.pop()!);
            }
        }

        return capturedGeometry.filterOutUnchanged();
    };

    return Command.create({titleKey: 'commands.place_elements_around.title'}, commandBody);
}
