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
