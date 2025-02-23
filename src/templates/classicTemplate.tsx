import * as React from 'react';
import classnames from 'classnames';

import { useKeyedSyncStore } from '../coreUtils/keyedObserver';

import { ElementModel, PropertyTypeIri } from '../data/model';
import { TemplateProps } from '../diagram/customization';
import { EntityElement } from '../editor/dataElements';
import { subscribeElementTypes, subscribePropertyTypes } from '../editor/observedElement';
import { WithFetchStatus } from '../editor/withFetchStatus';
import { formatEntityTypeList } from '../widgets/utility/listElementView';
import { useWorkspace } from '../workspace/workspaceContext';

const CLASS_NAME = 'reactodia-classic-template';

/**
 * Element template component to display component in the classic style.
 *
 * This classic "look and feel" was used for elements before v0.8.0
 *
 * The template does not support displaying entity groups.
 *
 * @category Components
 */
export function ClassicTemplate(props: TemplateProps) {
    const {element, isExpanded} = props;
    const data = element instanceof EntityElement ? element.data : undefined;

    const workspace = useWorkspace();
    const {model, translation: t, getElementTypeStyle} = workspace;
    useKeyedSyncStore(subscribeElementTypes, data ? data.types : [], model);

    if (!data) {
        return null;
    }

    const types = data?.types ?? [];
    const {color, icon} = getElementTypeStyle(types);

    const typesLabel = types.length > 0
        ?  formatEntityTypeList(data, workspace)
        : t.text('standard_template.default_type');
    const label = t.formatLabel(data?.label, data.id, model.language);

    const image = data?.image ? (
        <div className={`${CLASS_NAME}__thumbnail`}>
            <img className={`${CLASS_NAME}__thumbnail-image`}
                src={data.image}
            />
        </div>
    ) : undefined;

    const expander = isExpanded ? (
        <div>
            <div className={`${CLASS_NAME}__expander`}>
                <div className={`${CLASS_NAME}__iri-heading`}>
                    {t.text('standard_template.iri.label')}
                </div>
                <div className={`${CLASS_NAME}__iri-container`}>
                    <a className={`${CLASS_NAME}__iri`}
                        title={data.id}
                        href={data.id}>
                        {data.id}
                    </a>
                </div>
            </div>
            <hr className={`${CLASS_NAME}__divider`} />
            <PropertyList data={data} />
        </div>
    ) : null;

    return (
        <div
            className={classnames(
                CLASS_NAME,
                isExpanded ? `${CLASS_NAME}--expanded` : `${CLASS_NAME}--collapsed`
            )}
            style={{backgroundColor: color, borderColor: color}}
            data-expanded={isExpanded}>
            <div className={`${CLASS_NAME}__type-line`} title={label}>
                <div className={`${CLASS_NAME}__type-line-icon`} aria-hidden='true'>
                    <img src={icon} />
                </div>
                <div title={typesLabel} className={`${CLASS_NAME}__type-line-text-container`}>
                    <div className={`${CLASS_NAME}__type-line-text`}>
                        {typesLabel}
                    </div>
                </div>
            </div>
            {image}
            <div className={`${CLASS_NAME}__body`} style={{borderColor: color}}>
                <WithFetchStatus type='element' target={data.id}>
                    <span className={`${CLASS_NAME}__label`} title={label}>
                        {label}
                    </span>
                </WithFetchStatus>
                {expander}
            </div>
        </div>
    );
}

function PropertyList(props: {
    data: ElementModel;
}) {
    const {data} = props;
    const {model, translation: t} = useWorkspace();

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

    if (properties.length > 0) {
        return <div className={`${CLASS_NAME}__property-table`}>
            {properties.map(({iri, label, values}) => {
                const renderedValues = values.map((term, index) => (
                    <div key={index}
                        className={`${CLASS_NAME}__property-value`}
                        title={term.value}>
                        {term.value}
                    </div>
                ));
                return (
                    <div key={iri} className={`${CLASS_NAME}__property-row`}>
                        <WithFetchStatus type='propertyType' target={iri}>
                            <div className={`${CLASS_NAME}__property-label`}
                                title={t.text('standard_template.property.title', {
                                    property: label,
                                    propertyIri: t.formatIri(iri),
                                })}>
                                {label}
                            </div>
                        </WithFetchStatus>
                        <div className={`${CLASS_NAME}__property-values`}>
                            {renderedValues}
                        </div>
                    </div>
                );
            })}
        </div>;
    } else {
        return <div>{t.text('standard_template.no_properties')}</div>;
    }
}
