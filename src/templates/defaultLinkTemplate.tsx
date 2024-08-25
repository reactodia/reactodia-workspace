import * as React from 'react';
import classnames from 'classnames';

import { useCanvas } from '../diagram/canvasApi';
import { FormattedProperty, LinkTemplate, LinkTemplateProps } from '../diagram/customization';
import { LinkPath, LinkLabel, LinkLabelProps, LinkVertices } from '../diagram/linkLayer';

import { DataDiagramModel } from '../editor/dataDiagramModel';
import { RelationGroup, RelationLink } from '../editor/dataElements';
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
        link, className, path, pathProps, getPathPosition, route,
        editableLabel,
        primaryLabelProps,
        propertyLabelProps,
        propertyLabelStartLine = 1,
        prependLabels = null,
    } = props;
    const {model, canvas} = useCanvas();

    const renamedLabel = editableLabel?.getLabel(link);
    let labelContent: JSX.Element | null = null;
    if (model.getLinkVisibility(link.typeId) === 'visible') {
        const textClass = `${CLASS_NAME}__label-text`;
        const backgroundClass = `${CLASS_NAME}__label-background`;

        let label: string;
        let properties: readonly FormattedProperty[] = [];

        if (model instanceof DataDiagramModel) {
            const linkType = model.getLinkType(link.typeId);
            label = renamedLabel ?? model.locale.formatLabel(linkType?.data?.label, link.typeId);
            if (link instanceof RelationLink) {
                properties = model.locale.formatPropertyList(link.data.properties);
            }
        } else {
            label = model.locale.formatIri(link.typeId);
        }

        labelContent = <>
            <LinkLabel {...primaryLabelProps}
                primary
                link={link}
                position={getPathPosition(0.5)}
                textAnchor={route?.labelTextAnchor ?? primaryLabelProps?.textAnchor}
                textClass={classnames(textClass, primaryLabelProps?.textClass)}
                rectClass={classnames(backgroundClass, primaryLabelProps?.rectClass)}
                title={primaryLabelProps?.title
                    ?? `${label} ${model.locale.formatIri(link.typeId)}`
                }
                content={renamedLabel ? label : (
                    <WithFetchStatus type='linkType' target={link.typeId}>
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
            {link instanceof RelationGroup ? (
                <>
                    <LinkLabel className={`${CLASS_NAME}__source-count`}
                        link={link}
                        position={getPathPosition(0.1)}
                        textClass={textClass}
                        rectClass={backgroundClass}
                        title={`${link.itemSources.size} source elements`}
                        content={<>{link.itemSources.size}</>}
                    />
                    <LinkLabel className={`${CLASS_NAME}__target-count`}
                        link={link}
                        position={getPathPosition(0.9)}
                        textClass={textClass}
                        rectClass={backgroundClass}
                        title={`${link.itemTargets.size} target elements`}
                        content={<>{link.itemTargets.size}</>}
                    />
                </>
            ) : null}
        </>;
    }

    const {linkState} = link;
    const stroke = pathProps?.stroke ?? 'black';
    return (
        <g
            className={classnames(
                CLASS_NAME,
                link instanceof RelationGroup ? `${CLASS_NAME}--group` : undefined,
                renamedLabel ? `${CLASS_NAME}--renamed` : undefined,
                className
            )}>
            <LinkPath typeIndex={canvas.renderingState.ensureLinkTypeIndex(link.typeId)}
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
