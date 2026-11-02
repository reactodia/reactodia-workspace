import cx from 'clsx';
import * as React from 'react';

import { useEventStore, useSyncStore } from '../../coreUtils/hooks';
import { useTranslation } from '../../coreUtils/i18n';
import { ElementTypeModel } from '../../data/model';
import * as Rdf from '../../data/rdf/rdfModel';
import { ProcessedTypeStyle, useWorkspace } from '../../workspace/workspaceContext';

import { highlightSubstring } from './listElementView';

export interface SchemaTypeViewProps extends React.HTMLProps<HTMLAnchorElement> {
    schemaType: {
        readonly id: string;
        readonly label: readonly Rdf.Literal[];
    };
    label?: string;
    highlightText?: string;
    selected?: boolean;
    sizeVariant?: 'm' | 's';
}

const CLASS_NAME = 'reactodia-schema-type-view';

export function SchemaTypeView(props: SchemaTypeViewProps) {
    const {
        schemaType, label, highlightText, selected, sizeVariant = 'm',
        ...restProps
    } = props;
    const t = useTranslation();
    const {model, getElementTypeStyle} = useWorkspace();

    const language = useSyncStore(
        useEventStore(label === undefined ? undefined : model.events, 'changeLanguage'),
        () => model.language
    );
    const typeLabel = label ?? t.formatLabel(schemaType.label, schemaType.id, language);
    const highlightedLabel = highlightSubstring(
        typeLabel, highlightText, {className: `${CLASS_NAME}__highlighted-term`}
    );

    const typeStyle = getElementTypeStyle([schemaType.id]);
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
            href={schemaType.id}>
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
