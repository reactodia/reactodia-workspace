import * as React from 'react';

import { CanvasContext } from '../diagram/canvasApi';
import { TemplateProps, FormattedProperty } from '../diagram/customization';

const CLASS_NAME = 'reactodia-default-template';

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
                <img src={data.image} />
            </div>
        ) : undefined;

        const expander = isExpanded ? (
            <div>
                <div className='reactodia-default-template_body_expander'>
                    <div className='reactodia-default-template_body_expander__iri_label'>
                        IRI:
                    </div>
                    <div className='reactodia-default-template_body_expander_iri'>
                        <a  className='reactodia-default-template_body_expander_iri__link'
                            href={data.id} title={data.id}>{data.id}
                        </a>
                    </div>
                </div>
                <hr className='reactodia-default-template_body_expander__hr'/>
                {this.renderPropertyTable(propertyList)}
            </div>
        ) : null;

        return (
            <div className='reactodia-default-template' style={{
                backgroundColor: color,
                borderColor: color,
            }} data-expanded={isExpanded}>
                <div className='reactodia-default-template_type-line' title={label}>
                    <div className='reactodia-default-template_type-line__icon' aria-hidden='true'>
                        <img src={iconUrl} />
                    </div>
                    <div title={typesLabel} className='reactodia-default-template_type-line_text-container'>
                        <div className='reactodia-default-template_type-line_text-container__text'>
                            {typesLabel}
                        </div>
                    </div>
                </div>
                {image}
                <div className='reactodia-default-template_body' style={{borderColor: color}}>
                    <span className='reactodia-default-template_body__label' title={label}>
                        {label}
                    </span>
                    {expander}
                </div>
            </div>
        );
    }

    renderPropertyTable(propertyList: ReadonlyArray<FormattedProperty>) {
        if (propertyList.length > 0) {
            return <div className='reactodia-default-template_body_expander_property-table'>
                {propertyList.map(({propertyId, label, values}) => {
                    const renderedValues = values.map((term, index) => (
                        <div className='reactodia-default-template_body_expander_property-table_row_key_values__value'
                            key={index} title={term.value}>
                            {term.value}
                        </div>
                    ));
                    return (
                        <div key={propertyId} className='reactodia-default-template_body_expander_property-table_row'>
                            <div title={`${label} (${propertyId})`}
                                className='reactodia-default-template_body_expander_property-table_row__key'>
                                {label}
                            </div>
                            <div className='reactodia-default-template_body_expander_property-table_row_key_values'>
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
