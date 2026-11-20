import cx from 'clsx';
import * as React from 'react';

import { useTranslation } from '../../coreUtils/i18n';

import { ElementModel } from '../../data/model';

import { useWorkspace } from '../../workspace/workspaceContext';

import { formatEntityTitle } from '../utility/listElementView';

const CLASS_NAME = 'reactodia-inline-entity';

export function InlineEntity(props: {
    className?: string;
    target: ElementModel;
    /**
     * @default false
     */
    block?: boolean;
    children?: React.ReactNode;
}) {
    const {className, target, block, children} = props;
    const {model, getElementTypeStyle} = useWorkspace();
    const t = useTranslation();
    const label = model.locale.formatEntityLabel(target, model.language);
    const {color} = getElementTypeStyle(target.types);
    const style = {
        '--reactodia-inline-entity-color': color,
    } as React.CSSProperties;
    const Tag = block ? 'div' : 'span';
    return (
        <Tag className={cx(CLASS_NAME, className)}
            style={style}
            title={formatEntityTitle(target, model, t)}>
            <Tag className={`${CLASS_NAME}__label`}>
                {label}
            </Tag>
            {children}
        </Tag>
    );
}
