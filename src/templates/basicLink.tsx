import * as React from 'react';

import type {
    LinkMarkerStyle, LinkTemplateProps,
} from '../diagram/customization';
import { LinkPath, LinkVertices } from '../diagram/linkLayer';

/**
 * Link marker style with an arrowhead.
 */
export const LinkMarkerArrowhead: LinkMarkerStyle = {
    d: 'M0,0 L0,8 L9,4 z',
    width: 9,
    height: 8,
    fill: 'context-stroke',
};

/**
 * Link marker style with a circle.
 */
export const LinkMarkerCircle: LinkMarkerStyle = {
    d: 'M 6 1 a 5 5 0 1 0 0.0001 0 Z',
    width: 12,
    height: 12,
    fill: 'context-stroke',
    stroke: 'context-stroke',
    strokeWidth: 2,
};

/**
 * Link marker style with a diamond.
 */
export const LinkMarkerDiamond: LinkMarkerStyle = {
    d: 'M 9 1 L 17 7 L 9 13 L 1 7 Z',
    width: 18,
    height: 14,
    fill: 'context-stroke',
    stroke: 'context-stroke',
    strokeWidth: 2,
};

/**
 * Props for {@link BasicLink} component.
 *
 * @see {@link BasicLink}
 */
export interface BasicLinkProps extends LinkTemplateProps {
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Additional attributes for SVG path rendering of the link geometry.
     */
    pathProps?: React.SVGAttributes<SVGPathElement>;
    /**
     * Additional children for the component.
     */
    children?: React.ReactNode;
}

/**
 * Basic link template which displays a {@link link path} with editable geometry (vertices)
 * without any labels.
 *
 * @category Components
 */
export function BasicLink(props: BasicLinkProps) {
    const {
        link, className, path, pathProps, markerSource, markerTarget, children,
    } = props;
    const stroke = pathProps?.stroke;
    return (
        <g className={className}>
            <LinkPath path={path}
                pathProps={{fill: 'none', ...pathProps}}
                markerSource={markerSource}
                markerTarget={markerTarget}
            />
            {link.vertices.length === 0 ? null : (
                <LinkVertices linkId={link.id} vertices={link.vertices} fill={stroke} />
            )}
            {children}
        </g>
    );
}
