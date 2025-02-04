import * as React from 'react';
import classnames from 'classnames';

import { useKeyedSyncStore } from '../coreUtils/keyedObserver';

import { PropertyTypeIri } from '../data/model';
import { TemplateProperties } from '../data/schema';

import { LinkTemplate, LinkTemplateProps } from '../diagram/customization';
import { LinkPath, LinkLabel, LinkLabelProps, LinkVertices } from '../diagram/linkLayer';

import { RelationGroup, RelationLink } from '../editor/dataElements';
import { subscribeLinkTypes, subscribePropertyTypes } from '../editor/observedElement';
import { WithFetchStatus } from '../editor/withFetchStatus';

import { useWorkspace } from '../workspace/workspaceContext';

/**
 * Default link template.
 *
 * Uses {@link DefaultLinkPathTemplate} to display the link itself.
 *
 * @see {@link DefaultLinkPathTemplate}
 */
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

/**
 * Props for {@link DefaultLinkPathTemplate} component.
 *
 * @see {@link DefaultLinkPathTemplate}
 */
export interface DefaultLinkPathTemplateProps extends LinkTemplateProps {
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Additional attributes for SVG path rendering of the link geometry.
     */
    pathProps?: React.SVGAttributes<SVGPathElement>;
    /**
     * Additional props for the primary link label.
     *
     * @see {@link LinkLabelProps.primary}
     */
    primaryLabelProps?: CustomizedLinkLabelProps;
    /**
     * Additional props for each label displaying a property from
     * a relation link data.
     */
    propertyLabelProps?: CustomizedLinkLabelProps;
    /**
     * Starting row shift when displaying relation link data properties.
     *
     * @default 1
     * @see {@link LinkLabelProps.line}
     */
    propertyLabelStartLine?: number;
    /**
     * Additional labels to display for the link.
     *
     * When prepending labels for a relational link it is useful to specify
     * {@link propertyLabelStartLine} to avoid overlapping prepended and data labels.
     */
    prependLabels?: React.ReactNode;
}

/**
 * Additional style props for the link labels in {@link DefaultLinkPathTemplate}.
 *
 * @see {@link DefaultLinkPathTemplateProps}
 */
type CustomizedLinkLabelProps = Omit<
    LinkLabelProps,
    'primary' | 'link' | 'position' | 'line' | 'content'
>;

/**
 * Default link path template component.
 *
 * The template supports displaying any diagram links, including relation
 * links and relation groups.
 *
 * The template supports the following template state:
 *   - layout only mark.
 *
 * {@link RenameLinkProvider} can be used to display a different label
 * than the default one based on the relation data or the link type.
 *
 * @category Components
 */
export function DefaultLinkPathTemplate(props: DefaultLinkPathTemplateProps) {
    const {
        link, className, path, pathProps, markerSource, markerTarget, getPathPosition, route,
        primaryLabelProps,
        propertyLabelProps,
        propertyLabelStartLine = 1,
        prependLabels = null,
    } = props;
    const {model, view: {renameLinkProvider}, translation: t} = useWorkspace();

    useKeyedSyncStore(subscribeLinkTypes, [link.typeId], model);
    useKeyedSyncStore(
        subscribePropertyTypes,
        link instanceof RelationLink ? Object.keys(link.data.properties) as PropertyTypeIri[] : [],
        model
    );

    const renamedLabel = renameLinkProvider?.getLabel(link);
    let labelContent: JSX.Element | null = null;
    if (model.getLinkVisibility(link.typeId) === 'visible') {
        const textClass = `${CLASS_NAME}__label-text`;
        const backgroundClass = `${CLASS_NAME}__label-background`;

        const linkType = model.getLinkType(link.typeId);
        const label = renamedLabel ?? model.locale.formatLabel(linkType?.data?.label, link.typeId);
        const properties = link instanceof RelationLink
            ? model.locale.formatPropertyList(link.data.properties)
            : [];

        labelContent = <>
            <LinkLabel {...primaryLabelProps}
                primary
                link={link}
                position={getPathPosition(0.5)}
                textAnchor={route?.labelTextAnchor ?? primaryLabelProps?.textAnchor}
                textClass={classnames(textClass, primaryLabelProps?.textClass)}
                rectClass={classnames(backgroundClass, primaryLabelProps?.rectClass)}
                title={primaryLabelProps?.title ?? t.format('default_link_template.label.title', {
                    relation: label,
                    relationIri: model.locale.formatIri(link.typeId),
                })}
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
                    title={propertyLabelProps?.title ?? t.format('default_link_template.property.title', {
                        property: property.label,
                        propertyIri: model.locale.formatIri(property.propertyId),
                    })}
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
                        title={t.format('default_link_template.group_source.title', {
                            value: link.itemSources.size,
                        })}
                        content={t.format('default_link_template.group_source.value', {
                            value: link.itemSources.size,
                        })}
                    />
                    <LinkLabel className={`${CLASS_NAME}__target-count`}
                        link={link}
                        position={getPathPosition(0.9)}
                        textClass={textClass}
                        rectClass={backgroundClass}
                        title={t.format('default_link_template.group_target.title', {
                            value: link.itemTargets.size,
                        })}
                        content={t.format('default_link_template.group_target.value', {
                            value: link.itemTargets.size,
                        })}
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
            <LinkPath path={path}
                pathProps={{
                    fill: 'none',
                    ...pathProps,
                    className: classnames(`${CLASS_NAME}__path`, pathProps?.className),
                    stroke,
                    strokeDasharray: linkState?.[TemplateProperties.LayoutOnly]
                        ? '5,5' : pathProps?.strokeDasharray,
                }}
                markerSource={markerSource}
                markerTarget={markerTarget}
            />
            {labelContent}
            {link.vertices.length === 0 ? null : (
                <LinkVertices linkId={link.id} vertices={link.vertices} fill={stroke} />
            )}
        </g>
    );
}
