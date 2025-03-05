import type { LinkRouter, RoutedLinks } from './customization';

import type { GraphStructure } from './model';
import type { Link } from './elements';
import { SizeProvider, Vector, Rect, boundsOf } from './geometry';

/**
 * Options for {@link DefaultLinkRouter}.
 */
export interface DefaultLinkRouterOptions {
    /**
     * Margin to put between the middle parts of links to move
     * them apart of each other.
     *
     * @default 20
     */
    gap?: number;
}

/**
 * Default link router which moves links with same source and target apart.
 *
 * @category Core
 */
export class DefaultLinkRouter implements LinkRouter {
    private readonly gap: number;

    constructor(options: DefaultLinkRouterOptions = {}) {
        const {gap = 20} = options;
        this.gap = gap;
    }

    route(model: GraphStructure, sizeProvider: SizeProvider): RoutedLinks {
        const routings: RoutedLinks = new Map();

        for (const link of model.links) {
            if (routings.has(link.id)) {
                continue;
            }
            // The cell is a link. Let's find its source and target models.
            const {sourceId, targetId} = link;
            if (!sourceId || !targetId) {
                continue;
            } else if (sourceId === targetId) {
                this.routeFeedbackSiblingLinks(sourceId, model, sizeProvider, routings);
            } else {
                this.routeNormalSiblingLinks(sourceId, targetId, model, sizeProvider, routings);
            }
        }

        return routings;
    }

    private routeFeedbackSiblingLinks(
        elementId: string,
        model: GraphStructure,
        sizeProvider: SizeProvider,
        routings: RoutedLinks
    ) {
        const element = model.getElement(elementId)!;
        const bounds = boundsOf(element, sizeProvider);
        const {x, y, width, height} = bounds;
        const center = Rect.center(bounds);

        let index = 0;
        for (const sibling of model.getElementLinks(element)) {
            const {sourceId, targetId} = sibling;
            if (
                routings.has(sibling.id) ||
                model.getLinkVisibility(sibling.typeId) === 'hidden' ||
                sourceId !== targetId
            ) {
                continue;
            }

            if (sibling.vertices.length === 0) {
                const offset = this.gap * (index + 1);
                const vertices: Vector[] = [
                    {x: x - offset, y: y + height / 2},
                    {x: x - offset, y: y - offset},
                    {x: x + width / 2, y: y - offset},
                ];
                routings.set(sibling.id, {linkId: sibling.id, vertices});
                index++;
            } else if (sibling.vertices.length === 1) {
                const [pivot] = sibling.vertices;
                const ray = Vector.normalize(Vector.subtract(pivot, center));
                const shifted = Vector.add(pivot, Vector.scale(ray, -this.gap));
                const rotated: Vector = {x: -ray.y, y: ray.x};
                const vertices: Vector[] = [
                    Vector.add(shifted, Vector.scale(rotated, this.gap)),
                    pivot,
                    Vector.add(shifted, Vector.scale(rotated, -this.gap)),
                ];
                routings.set(sibling.id, {linkId: sibling.id, vertices});
            }
        }
    }

    private routeNormalSiblingLinks(
        sourceId: string,
        targetId: string,
        model: GraphStructure,
        sizeProvider: SizeProvider,
        routings: RoutedLinks
    ): void {
        const source = model.getElement(sourceId)!;
        const target = model.getElement(targetId)!;

        const sourceCenter = Rect.center(boundsOf(source, sizeProvider));
        const targetCenter = Rect.center(boundsOf(target, sizeProvider));
        const midPoint = {
            x: (sourceCenter.x + targetCenter.x) / 2,
            y: (sourceCenter.y + targetCenter.y) / 2,
        };
        const direction = Vector.normalize({
            x: targetCenter.x - sourceCenter.x,
            y: targetCenter.y - sourceCenter.y,
        });

        const siblings = model.getElementLinks(source).filter(link =>
            (link.sourceId === targetId || link.targetId === targetId) &&
            !routings.has(link.id) &&
            !hasUserPlacedVertices(link) &&
            model.getLinkVisibility(link.typeId) !== 'hidden'
        );
        if (siblings.length <= 1) {
            return;
        }
        const indexModifier = siblings.length % 2 ? 0 : 1;

        siblings.forEach((sibling, siblingIndex) => {
            // For more beautiful positioning
            const index = siblingIndex + indexModifier;
            // We want the offset values to be calculated as follows 0, 50, 50, 100, 100, 150, 150 ..
            const offset = this.gap * Math.ceil(index / 2) - (indexModifier ? this.gap / 2 : 0);
            // Now we need the vertices to be placed at points which are 'offset' pixels distant
            // from the first link and forms a perpendicular angle to it. And as index goes up
            // alternate left and right.
            //
            //  ^  odd indexes
            //  |
            //  |---->  index 0 line (straight line between a source center and a target center.
            //  |
            //  v  even indexes
            const offsetDirection = index % 2
                ? {x: -direction.y, y: direction.x}  // rotate by 90 degrees counter-clockwise
                : {x: direction.y, y: -direction.x}; // rotate by 90 degrees clockwise
            // We found the vertex.
            const vertex = {
                x: midPoint.x + offsetDirection.x * offset,
                y: midPoint.y + offsetDirection.y * offset,
            };
            routings.set(sibling.id, {
                linkId: sibling.id,
                vertices: [vertex],
                labelTextAnchor: this.getLabelAlignment(direction, siblingIndex, siblings.length),
            });
        });
    }

    private getLabelAlignment(
        connectionDirection: Vector,
        siblingIndex: number,
        siblingCount: number,
    ): 'start' | 'middle' | 'end' {
        // offset direction angle in [0; 2 Pi] interval
        const angle = Math.atan2(connectionDirection.y, connectionDirection.x);
        const absoluteAngle = Math.abs(angle);
        const isHorizontal = absoluteAngle < Math.PI * 1 / 8 || absoluteAngle > Math.PI * 7 / 8;
        const isTop = angle < 0;
        const isBottom = angle > 0;

        const firstOuter = siblingCount - 2;
        const secondOuter = siblingCount - 1;

        if (!isHorizontal) {
            if (isTop && siblingIndex === secondOuter || isBottom && siblingIndex === firstOuter) {
                return 'end';
            } else if (isTop && siblingIndex === firstOuter || isBottom && siblingIndex === secondOuter) {
                return 'start';
            }
        }

        return 'middle';
    }
}

function hasUserPlacedVertices(link: Link) {
    return link.vertices.length > 0;
}
