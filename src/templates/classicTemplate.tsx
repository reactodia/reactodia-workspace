import * as React from 'react';
import classnames from 'classnames';

import { TemplateProps, FormattedProperty } from '../diagram/customization';
import { WithFetchStatus } from '../editor/withFetchStatus';
import { useWorkspace } from '../workspace/workspaceContext';

const CLASS_NAME = 'reactodia-classic-template';

export function ClassicTemplate(props: TemplateProps) {
    const {data, isExpanded} = props;
    const {model, getElementTypeStyle} = useWorkspace();
    const {color, icon} = getElementTypeStyle(data.types);

    const typesLabel = data.types.length > 0
        ? model.locale.formatElementTypes(data.types).join(', ')
        : 'Thing';
    const label = model.locale.formatLabel(data.label, data.id);
    const propertyList = model.locale.formatPropertyList(data.properties);

    const image = data.image ? (
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
                    IRI:
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
            {renderPropertyTable(propertyList)}
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

function renderPropertyTable(propertyList: ReadonlyArray<FormattedProperty>) {
    if (propertyList.length > 0) {
        return <div className={`${CLASS_NAME}__property-table`}>
            {propertyList.map(({propertyId, label, values}) => {
                const renderedValues = values.map((term, index) => (
                    <div className={`${CLASS_NAME}__property-value`}
                        key={index} title={term.value}>
                        {term.value}
                    </div>
                ));
                return (
                    <div key={propertyId} className={`${CLASS_NAME}__property-row`}>
                        <WithFetchStatus type='propertyType' target={propertyId}>
                            <div className={`${CLASS_NAME}__property-label`}
                                title={`${label} (${propertyId})`}>
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
        return <div>no properties</div>;
    }
}
