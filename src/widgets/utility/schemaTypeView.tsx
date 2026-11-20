import cx from 'clsx';
import * as React from 'react';

import { useEventStore, useSyncStore } from '../../coreUtils/hooks';
import { useTranslation } from '../../coreUtils/i18n';
import {
    ElementTypeIri, ElementTypeModel, PropertyTypeModel, LinkTypeModel,
} from '../../data/model';
import { useWorkspace } from '../../workspace/workspaceContext';

import { highlightSubstring } from './listElementView';

export type SchemaType = {
    elementType: ElementTypeModel;
    propertyType: PropertyTypeModel;
    linkType: LinkTypeModel;
};

export interface SchemaTypeViewProps<Kind extends keyof SchemaType>
    extends React.HTMLProps<HTMLAnchorElement>
{
    typeKind: Kind;
    typeData: SchemaType[Kind];
    label?: string;
    highlightText?: string;
    selected?: boolean;
    sizeVariant?: 'm' | 's';
    inline?: boolean;
}

const CLASS_NAME = 'reactodia-schema-type-view';

export function SchemaTypeView<Kind extends keyof SchemaType>(
    props: SchemaTypeViewProps<Kind>
) {
    const {
        typeKind, typeData, label, highlightText, selected,
        sizeVariant = 'm',
        inline = false,
        ...restProps
    } = props;
    const t = useTranslation();
    const {model, getElementTypeStyle} = useWorkspace();

    const language = useSyncStore(
        useEventStore(label === undefined ? undefined : model.events, 'changeLanguage'),
        () => model.language
    );
    const typeLabel = label ?? t.formatLabel(typeData.label, typeData.id, language);
    const highlightedLabel = highlightSubstring(
        typeLabel, highlightText, {className: `${CLASS_NAME}__highlighted-term`}
    );

    const typeStyle = getElementTypeStyle([typeData.id as ElementTypeIri]);
    const providedStyle = {
        '--reactodia-element-style-color': typeStyle.color,
    } as React.CSSProperties;

    const typeKindClass = (
        typeKind === 'elementType' ? `${CLASS_NAME}--element-type` :
        typeKind === 'propertyType' ? `${CLASS_NAME}--property-type` :
        typeKind === 'linkType' ? `${CLASS_NAME}--link-type` :
        undefined
    );

    return (
        <a {...restProps}
            className={cx(
                CLASS_NAME,
                typeKindClass,
                `${CLASS_NAME}--size-${sizeVariant}`,
                inline ? `${CLASS_NAME}--inline` : undefined,
                selected ? `${CLASS_NAME}--selected` : undefined,
                restProps.className
            )}
            onClick={restProps.onClick ?? (e => e.preventDefault())}
            style={{...providedStyle, ...restProps.style}}
            href={typeData.id}>
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
