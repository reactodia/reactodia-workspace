import * as React from 'react';
import classnames from 'classnames';

import { useCanvas } from '../diagram/canvasApi';
import { LinkTemplate, LinkTemplateProps } from '../diagram/customization';
import { LinkPath, LinkLabel, LinkLabelProps, LinkVertices } from '../diagram/linkLayer';

import { RelationLink } from '../editor/dataElements';
import { WithFetchStatus } from '../editor/withFetchStatus';
import { TemplateProperties } from '../workspace';

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
    primaryLabelProps?: CustomizedLinkLabelProps;
    propertyLabelProps?: CustomizedLinkLabelProps;
    /**
     * @default 1
     */
    propertyLabelStartLine?: number;
    prependLabels?: React.ReactNode;
}

type CustomizedLinkLabelProps = Omit<
    LinkLabelProps,
    'primary' | 'link' | 'position' | 'line' | 'content'
>;

export function DefaultLinkPathTemplate(props: DefaultLinkPathTemplateProps) {
    const {
        link, linkType, className, path, pathProps, getPathPosition, route,
        editableLabel,
        primaryLabelProps,
        propertyLabelProps,
        propertyLabelStartLine = 1,
        prependLabels = null,
    } = props;
    const {model} = useCanvas();

    const renamedLabel = editableLabel?.getLabel(link);
    let labelContent: JSX.Element | null = null;
    if (linkType.visibility === 'visible') {
        const textClass = `${CLASS_NAME}__label-text`;
        const backgroundClass = `${CLASS_NAME}__label-background`;

        const label = renamedLabel ?? model.locale.formatLabel(linkType.label, linkType.id);
        const properties = model.locale.formatPropertyList(
            link instanceof RelationLink ? link.data.properties : {}
        );

        labelContent = <>
            <LinkLabel {...primaryLabelProps}
                primary
                link={link}
                position={getPathPosition(0.5)}
                textAnchor={route?.labelTextAnchor ?? primaryLabelProps?.textAnchor}
                textClass={classnames(textClass, primaryLabelProps?.textClass)}
                rectClass={classnames(backgroundClass, primaryLabelProps?.rectClass)}
                title={primaryLabelProps?.title
                    ?? `${label} ${model.locale.formatIri(linkType.id)}`
                }
                content={renamedLabel ? label : (
                    <WithFetchStatus type='linkType' target={linkType.id}>
                        <tspan>{label}</tspan>
                    </WithFetchStatus>
                )}
            />
            {prependLabels}
            {properties.map((property, index) => (
                <LinkLabel key={property.propertyId}
                    {...propertyLabelProps}
                    link={link}
                    position={getPathPosition(0.5)}
                    line={propertyLabelStartLine + index}
                    textAnchor={route?.labelTextAnchor ?? propertyLabelProps?.textAnchor}
                    textClass={classnames(textClass, propertyLabelProps?.textClass)}
                    rectClass={classnames(backgroundClass, propertyLabelProps?.rectClass)}
                    title={propertyLabelProps?.title
                        ?? `${property.label} ${model.locale.formatIri(property.propertyId)}`
                    }
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

    const {linkState} = link;
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
                    strokeDasharray: linkState?.[TemplateProperties.LayoutOnly]
                        ? '5,5' : pathProps?.strokeDasharray,
                }}
            />
            {labelContent}
            {link.vertices.length === 0 ? null : (
                <LinkVertices linkId={link.id} vertices={link.vertices} fill={stroke} />
            )}
        </g>
    );
}
