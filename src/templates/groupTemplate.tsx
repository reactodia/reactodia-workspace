import * as React from 'react';

import { TemplateProps } from '../diagram/customization';
import { EmbeddedLayer } from '../diagram/embeddedLayer';

import { WithFetchStatus } from '../editor/withFetchStatus';

import { useWorkspace } from '../workspace/workspaceContext';

const CLASS = 'reactodia-group-template';

export function GroupTemplate(props: TemplateProps) {
    const {elementId, data, isExpanded} = props;
    const {model, getElementTypeStyle} = useWorkspace();
    const {color, icon} = getElementTypeStyle(data.types);

    const typesLabel = data.types.length > 0
        ? model.locale.formatElementTypes(data.types).join(', ') : 'Thing';
    const label = model.locale.formatLabel(data.label, data.id);

    return (
        <div className={CLASS}>
            <div className={`${CLASS}__wrap`} style={{
                backgroundColor: color,
                borderColor: color,
            }}>
                <div className={`${CLASS}__type-line`} title={label}>
                    <div className={`${CLASS}__type-line-icon`}>
                        <img src={icon} />
                    </div>
                    <div title={typesLabel} className={`${CLASS}__type-line-text-container`}>
                        <div className={`${CLASS}__type-line-text`}>
                            {typesLabel}
                        </div>
                    </div>
                </div>
                <div className={`${CLASS}__body`} style={{borderColor: color}}>
                    <WithFetchStatus type='element' target={data.id}>
                        <span className={`${CLASS}__label`} title={label}>
                            {label}
                        </span>
                    </WithFetchStatus>
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
