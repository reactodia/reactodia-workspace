import * as React from 'react';

import { CanvasContext } from '../../diagram/canvasApi';
import { EmbeddedLayer } from '../../diagram/embeddedLayer';

import { TemplateProps } from '../props';

const CLASS = 'ontodia-group-template';

export class GroupTemplate extends React.Component<TemplateProps, {}> {
    static contextType = CanvasContext;
    declare readonly context: CanvasContext;

    render() {
        const {elementId, data, iconUrl, color, isExpanded} = this.props;
        const {view} = this.context;

        const typesLabel = data.types.length > 0 ? view.getElementTypeString(data) : 'Thing';
        const label = view.formatLabel(data.label, data.id);

        return (
            <div className={CLASS}>
                <div className={`${CLASS}__wrap`} style={{
                    backgroundColor: color,
                    borderColor: color,
                }}>
                    <div className={`${CLASS}__type-line`} title={label}>
                        <div className={`${CLASS}__type-line-icon`}>
                            <img src={iconUrl} />
                        </div>
                        <div title={typesLabel} className={`${CLASS}__type-line-text-container`}>
                            <div className={`${CLASS}__type-line-text`}>
                                {typesLabel}
                            </div>
                        </div>
                    </div>
                    <div className={`${CLASS}__body`} style={{borderColor: color}}>
                        <span className={`${CLASS}__label`} title={label}>
                            {label}
                        </span>
                        {
                            isExpanded ? (
                                <div className={`${CLASS}__embedded-layer`}>
                                    <EmbeddedLayer elementId={elementId} />
                                </div>
                            ) : null
                        }
                    </div>
                </div>
            </div>
        );
    }
}
