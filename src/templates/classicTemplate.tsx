import * as React from 'react';
import classnames from 'classnames';

import { CanvasContext } from '../diagram/canvasApi';
import { TemplateProps, FormattedProperty } from '../diagram/customization';

const CLASS_NAME = 'reactodia-classic-template';

export class ClassicTemplate extends React.Component<TemplateProps> {
    static contextType = CanvasContext;
    declare readonly context: CanvasContext;

    render() {
        const {data, color, iconUrl, isExpanded} = this.props;
        const {view} = this.context;

        const typesLabel = data.types.length > 0 ? view.getElementTypeString(data) : 'Thing';
        const label = view.formatLabel(data.label, data.id);
        const propertyList = view.formatPropertyList(data.properties);

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
                {this.renderPropertyTable(propertyList)}
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
                        <img src={iconUrl} />
                    </div>
                    <div title={typesLabel} className={`${CLASS_NAME}__type-line-text-container`}>
                        <div className={`${CLASS_NAME}__type-line-text`}>
                            {typesLabel}
                        </div>
                    </div>
                </div>
                {image}
                <div className={`${CLASS_NAME}__body`} style={{borderColor: color}}>
                    <span className={`${CLASS_NAME}__label`} title={label}>
                        {label}
                    </span>
                    {expander}
                </div>
            </div>
        );
    }

    renderPropertyTable(propertyList: ReadonlyArray<FormattedProperty>) {
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
                            <div className={`${CLASS_NAME}__property-label`}
                                title={`${label} (${propertyId})`}>
                                {label}
                            </div>
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
}
