import cx from 'clsx';
import * as React from 'react';

import { useEventStore, useSyncStore } from '../../coreUtils/hooks';
import { useTranslation } from '../../coreUtils/i18n';
import { ElementTypeModel } from '../../data/model';
import { useWorkspace } from '../../workspace/workspaceContext';

import { highlightSubstring } from './listElementView';

export interface ElementTypeViewProps extends React.HTMLProps<HTMLAnchorElement> {
    elementType: ElementTypeModel;
    label?: string;
    highlightText?: string;
    selected?: boolean;
    sizeVariant?: 'm' | 's';
}

const CLASS_NAME = 'reactodia-element-type-view';

export function ElementTypeView(props: ElementTypeViewProps) {
    const {elementType, label, highlightText, selected, sizeVariant = 'm', ...restProps} = props;
    const t = useTranslation();
    const {model, getElementTypeStyle} = useWorkspace();

    const language = useSyncStore(
        useEventStore(label === undefined ? undefined : model.events, 'changeLanguage'),
        () => model.language
    );
    const typeLabel = label ?? t.formatLabel(elementType.label, elementType.id, language);
    const highlightedLabel = highlightSubstring(
        typeLabel, highlightText, {className: `${CLASS_NAME}__highlighted-term`}
    );

    const typeStyle = getElementTypeStyle([elementType.id]);
    const providedStyle = {
        '--reactodia-element-style-color': typeStyle.color,
    } as React.CSSProperties;

    return (
        <a {...restProps}
            className={cx(
                CLASS_NAME,
                `${CLASS_NAME}--size-${sizeVariant}`,
                selected ? `${CLASS_NAME}--selected` : undefined,
                restProps.className
            )}
            onClick={restProps.onClick ?? (e => e.preventDefault())}
            style={{...providedStyle, ...restProps.style}}
            href={elementType.id}>
            <div className={`${CLASS_NAME}__icon-container`}>
                {typeStyle.icon ? (
                    <img role='presentation'
                        className={cx(
                            `${CLASS_NAME}__icon`,
                            typeStyle.iconMonochrome ? `${CLASS_NAME}__icon--monochrome` : undefined
                        )}
                        src={typeStyle.icon}
                    />
                ) : (
                    <div className={`${CLASS_NAME}__default-icon`} role='none' />
                )}
            </div>
            <div className={`${CLASS_NAME}__label`}>
                {highlightedLabel}
            </div>
            
            {restProps.children}
        </a>
    );
}
