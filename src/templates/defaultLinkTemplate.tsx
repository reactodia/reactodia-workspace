import * as React from 'react';
import classnames from 'classnames';

import { useCanvas } from '../diagram/canvasApi';
import { LinkTemplate, LinkTemplateProps } from '../diagram/customization';
import { LinkPath, LinkLabel, LinkVertices } from '../diagram/linkLayer';

import { WithFetchStatus } from '../editor/withFetchStatus';

export const DefaultLinkTemplate: LinkTemplate = {
    markerTarget: {
        d: 'M0,0 L0,8 L9,4 z',
        width: 9,
        height: 8,
        fill: 'black',
    },
    renderLink: props => <DefaultLinkPathTemplate {...props} />,
};

const CLASS_NAME = 'reactodia-default-link';

export interface DefaultLinkPathTemplateProps extends LinkTemplateProps {
    className?: string;
    pathProps?: React.SVGAttributes<SVGPathElement>;
    prependLabels?: React.ReactNode;
    /**
     * @default 1
     */
    propertyLabelStartLine?: number;
}

export function DefaultLinkPathTemplate(props: DefaultLinkPathTemplateProps) {
    const {
        link, linkType, className, path, pathProps, getPathPosition, route,
        editableLabel,
        prependLabels = null,
        propertyLabelStartLine = 1,
    } = props;
    const {model} = useCanvas();

    const renamedLabel = editableLabel?.getLabel(link);
    let labelContent: JSX.Element | null = null;
    if (linkType.visibility === 'visible') {
        const textClass = `${CLASS_NAME}__label-text`;
        const backgroundClass = `${CLASS_NAME}__label-background`;
        const textAnchor = route?.labelTextAnchor;

        const label = renamedLabel ?? model.locale.formatLabel(linkType.label, linkType.id);
        const properties = model.locale.formatPropertyList(link.data.properties);

        labelContent = <>
            <LinkLabel primary
                link={link}
                position={getPathPosition(0.5)}
                textAnchor={textAnchor}
                textClass={textClass}
                rectClass={backgroundClass}
                title={`${label} ${model.locale.formatIri(linkType.id)}`}
                content={renamedLabel ? label : (
                    <WithFetchStatus type='linkType' target={linkType.id}>
                        <tspan>{label}</tspan>
                    </WithFetchStatus>
                )}
            />
            {prependLabels}
            {properties.map((property, index) => (
                <LinkLabel key={property.propertyId}
                    link={link}
                    position={getPathPosition(0.5)}
                    line={propertyLabelStartLine + index}
                    textAnchor={textAnchor}
                    textClass={textClass}
                    rectClass={backgroundClass}
                    title={`${property.label} ${model.locale.formatIri(property.propertyId)}`}
                    content={<>
                        <WithFetchStatus type='propertyType' target={property.propertyId}>
                            <tspan>{property.label}:&nbsp;</tspan>
                        </WithFetchStatus>
                        {property.values.map(v => v.value).join(', ')}
                    </>}
                />
            ))}
        </>;
    }

    const stroke = pathProps?.stroke ?? 'black';
    return (
        <g
            className={classnames(
                CLASS_NAME,
                renamedLabel ? `${CLASS_NAME}--renamed` : undefined,
                className
            )}>
            <LinkPath linkType={linkType}
                path={path}
                pathProps={{
                    fill: 'none',
                    ...pathProps,
                    className: classnames(`${CLASS_NAME}__path`, pathProps?.className),
                    stroke,
                    strokeDasharray: link.layoutOnly ? '5,5' : pathProps?.strokeDasharray,
                }}
            />
            {labelContent}
            {link.vertices.length === 0 ? null : (
                <LinkVertices linkId={link.id} vertices={link.vertices} fill={stroke} />
            )}
        </g>
    );
}
