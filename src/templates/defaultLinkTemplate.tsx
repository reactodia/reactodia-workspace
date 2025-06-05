import cx from 'clsx';
import * as React from 'react';

import { useKeyedSyncStore } from '../coreUtils/keyedObserver';

import { PropertyTypeIri } from '../data/model';
import { TemplateProperties } from '../data/schema';

import { LinkTemplate, LinkTemplateProps } from '../diagram/customization';
import { LinkLabel, LinkLabelProps } from '../diagram/linkLayer';
import { LinkPath, LinkVertices } from '../diagram/linkLayer';

import { RelationGroup, RelationLink } from '../editor/dataElements';
import { subscribeLinkTypes, subscribePropertyTypes } from '../editor/observedElement';
import { WithFetchStatus } from '../editor/withFetchStatus';

import { useWorkspace } from '../workspace/workspaceContext';

/**
 * Default link template.
 *
 * Uses {@link DefaultLink} to display the link itself.
 *
 * @category Constants
 * @see {@link DefaultLink}
 */
export const DefaultLinkTemplate: LinkTemplate = {
    markerTarget: {
        d: 'M0,0 L0,8 L9,4 z',
        width: 9,
        height: 8,
    },
    renderLink: props => <DefaultLink {...props} />,
};

const CLASS_NAME = 'reactodia-default-link';

const PROPERTY_CLASS = `${CLASS_NAME}__property`;
const LABEL_CLASS = `${CLASS_NAME}__label`;

/**
 * Props for {@link DefaultLink} component.
 *
 * @see {@link DefaultLink}
 */
export interface DefaultLinkProps extends LinkTemplateProps {
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
 * Additional style props for the link labels in {@link DefaultLink}.
 *
 * @see {@link DefaultLinkProps}
 */
type CustomizedLinkLabelProps = Omit<
    LinkLabelProps,
    'primary' | 'link' | 'position' | 'line' | 'content'
>;

/**
 * Default link template component.
 *
 * The template supports displaying any diagram links, including relation
 * links and relation groups.
 *
 * The template supports the following template state:
 *   - {@link TemplateProperties.LayoutOnly}
 *
 * {@link RenameLinkProvider} can be used to display a different label
 * than the default one based on the relation data or the link type.
 *
 * @category Components
 */
export function DefaultLink(props: DefaultLinkProps) {
    const {
        link, className, path, pathProps, markerSource, markerTarget, getPathPosition, route,
        primaryLabelProps,
        prependLabels = null,
    } = props;
    const {model, view: {renameLinkProvider}, translation: t} = useWorkspace();

    useKeyedSyncStore(subscribeLinkTypes, [link.typeId], model);

    const renamedLabel = renameLinkProvider?.getLabel(link);
    let labelContent: React.ReactElement | null = null;
    if (model.getLinkVisibility(link.typeId) === 'visible') {
        const linkType = model.getLinkType(link.typeId);
        const label = renamedLabel ?? t.formatLabel(linkType?.data?.label, link.typeId, model.language);

        labelContent = <>
            <LinkLabel {...primaryLabelProps}
                primary
                textAnchor={route?.labelTextAnchor ?? primaryLabelProps?.textAnchor}
                className={cx(
                    LABEL_CLASS,
                    renamedLabel ? `${LABEL_CLASS}--renamed` : undefined,
                    primaryLabelProps?.className
                )}
                title={primaryLabelProps?.title ?? t.text('default_link_template.label.title', {
                    relation: label,
                    relationIri: model.locale.formatIri(link.typeId),
                })}
                link={link}
                position={getPathPosition(0.5)}>
                {renamedLabel ? <span>{label}</span> : (
                    <WithFetchStatus type='linkType' target={link.typeId}>
                        <span>{label}</span>
                    </WithFetchStatus>
                )}
            </LinkLabel>
            {prependLabels}
            {link instanceof RelationLink ? <LinkProperties {...props} /> : null}
            {link instanceof RelationGroup ? (
                <>
                    <LinkLabel className={`${CLASS_NAME}__source-count`}
                        link={link}
                        position={getPathPosition(0.1)}
                        title={t.text('default_link_template.group_source.title', {
                            value: link.itemSources.size,
                        })}>
                        {t.text('default_link_template.group_source.value', {
                            value: link.itemSources.size,
                        })}
                    </LinkLabel>
                    <LinkLabel className={`${CLASS_NAME}__target-count`}
                        link={link}
                        position={getPathPosition(0.9)}
                        title={t.text('default_link_template.group_target.title', {
                            value: link.itemTargets.size,
                        })}>
                        {t.text('default_link_template.group_target.value', {
                            value: link.itemTargets.size,
                        })}
                    </LinkLabel>
                </>
            ) : null}
        </>;
    }

    const {linkState} = link;
    const stroke = pathProps?.stroke;
    return (
        <g
            className={cx(
                CLASS_NAME,
                link instanceof RelationGroup ? `${CLASS_NAME}--group` : undefined,
                className
            )}>
            <LinkPath path={path}
                pathProps={{
                    fill: 'none',
                    ...pathProps,
                    className: cx(`${CLASS_NAME}__path`, pathProps?.className),
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

function LinkProperties(props: DefaultLinkProps) {
    const {
        link, getPathPosition, route, propertyLabelProps,
        propertyLabelStartLine = 1,
    } = props;
    const {model, translation: t} = useWorkspace();
    const {data} = link as RelationLink;

    const propertyIris: PropertyTypeIri[] = Object.keys(data.properties);
    useKeyedSyncStore(subscribePropertyTypes, propertyIris, model);

    const properties = propertyIris.map(iri => {
        const property = model.getPropertyType(iri);
        const selectedValues = t.selectValues(data.properties[iri], model.language);
        return {
            iri,
            label: t.formatLabel(property?.data?.label, iri, model.language),
            values: selectedValues.length === 0 ? data.properties[iri] : selectedValues,
        };
    });
    properties.sort((a, b) => a.label.localeCompare(b.label));

    return <>
        {properties.map((property, index) => (
            <LinkLabel key={property.iri}
                {...propertyLabelProps}
                link={link}
                position={getPathPosition(0.5)}
                line={propertyLabelStartLine + index}
                textAnchor={route?.labelTextAnchor ?? propertyLabelProps?.textAnchor}
                className={cx(PROPERTY_CLASS, propertyLabelProps?.className)}
                title={propertyLabelProps?.title ?? t.text('default_link_template.property.title', {
                    property: property.label,
                    propertyIri: model.locale.formatIri(property.iri),
                })}>
                <WithFetchStatus type='propertyType' target={property.iri}>
                    <span>{property.label}:&nbsp;</span>
                </WithFetchStatus>
                {property.values.map(v => v.value).join(', ')}
            </LinkLabel>
        ))}
    </>;
}
