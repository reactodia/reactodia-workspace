import * as React from 'react';

import { ElementModel } from '../../data/model';

import { useWorkspace } from '../../workspace/workspaceContext';

import { formatEntityTitle } from '../utility/listElementView';

const CLASS_NAME = 'reactodia-inline-entity';

export function InlineEntity(props: {
    target: ElementModel;
}) {
    const {target} = props;
    const workspace = useWorkspace();
    const {model, translation: t, getElementTypeStyle} = workspace;
    const label = t.formatLabel(target.label, target.id, model.language);
    const {color} = getElementTypeStyle(target.types);
    const style = {
        '--reactodia-inline-entity-color': color,
    } as React.CSSProperties;
    return (
        <span className={CLASS_NAME}
            style={style}
            title={formatEntityTitle(target, workspace)}>
            <span className={`${CLASS_NAME}__label`}>
                {label}
            </span>
        </span>
    );
}
