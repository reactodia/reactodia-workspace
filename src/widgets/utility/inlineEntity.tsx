import * as React from 'react';

import { useTranslation } from '../../coreUtils/i18n';

import { ElementModel } from '../../data/model';

import { useWorkspace } from '../../workspace/workspaceContext';

import { formatEntityTitle } from '../utility/listElementView';

const CLASS_NAME = 'reactodia-inline-entity';

export function InlineEntity(props: {
    target: ElementModel;
}) {
    const {target} = props;
    const {model, getElementTypeStyle} = useWorkspace();
    const t = useTranslation();
    const label = model.locale.formatEntityLabel(target, model.language);
    const {color} = getElementTypeStyle(target.types);
    const style = {
        '--reactodia-inline-entity-color': color,
    } as React.CSSProperties;
    return (
        <span className={CLASS_NAME}
            style={style}
            title={formatEntityTitle(target, model, t)}>
            <span className={`${CLASS_NAME}__label`}>
                {label}
            </span>
        </span>
    );
}
