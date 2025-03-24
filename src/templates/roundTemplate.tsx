import cx from 'clsx';
import * as React from 'react';

import { useKeyedSyncStore } from '../coreUtils/keyedObserver';

import { ElementTemplate, TemplateProps } from '../diagram/customization';

import { EntityElement } from '../editor/dataElements';
import { subscribeElementTypes } from '../editor/observedElement';
import { WithFetchStatus } from '../editor/withFetchStatus';

import { formatEntityTypeList } from '../widgets/utility/listElementView';

import { useWorkspace } from '../workspace/workspaceContext';

/**
 * Basic element template with an round (elliptical) shape to display
 * an {@link EntityElement} on a canvas.
 *
 * Uses {@link RoundEntity} component to render a single entity.
 *
 * @category Constants
 */
export const RoundTemplate: ElementTemplate = {
    shape: 'ellipse',
    renderElement: props => <RoundEntity {...props} />,
};

/**
 * Props for {@link RoundEntity} component.
 *
 * @see {@link RoundEntity}
 */
export interface RoundEntityProps extends TemplateProps {
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Additional CSS styles for the component.
     */
    style?: React.CSSProperties;
    /**
     * Whether to display entity types in the element.
     *
     * @default false
     */
    showTypes?: boolean;
}

const CLASS_NAME = 'reactodia-round-entity';

/**
 * Basic element template component with a round (elliptical) shape.
 *
 * The template supports displaying only {@link EntityElement} elements,
 * otherwise nothing will be rendered.
 *
 * @category Components
 * @see {@link RoundTemplate}
 */
export function RoundEntity(props: RoundEntityProps) {
    const {element, className, style, showTypes} = props;
    const workspace = useWorkspace();
    const {model, translation: t, getElementTypeStyle} = workspace;

    const data = element instanceof EntityElement ? element.data : undefined;
    useKeyedSyncStore(subscribeElementTypes, data && showTypes ? data.types : [], model);

    if (!data) {
        return null;
    }

    const label = t.formatLabel(data.label, data.id, model.language);
    const {color: baseColor} = getElementTypeStyle(data.types);
    const rootStyle = {
        '--reactodia-element-style-color': baseColor,
    } as React.CSSProperties;

    return (
        <div className={cx(CLASS_NAME, className)}
            style={style ? {...rootStyle, ...style} : rootStyle}>
            <div className={`${CLASS_NAME}__types`}
                title={showTypes ? formatEntityTypeList(data, workspace) : undefined}>
                {showTypes ? data.types.map((typeIri, index) => {
                    const type = model.getElementType(typeIri);
                    const label = t.formatLabel(type?.data?.label, typeIri, model.language);
                    return (
                        <React.Fragment key={typeIri}>
                            {index === 0 ? null : ', '}
                            <WithFetchStatus type='elementType' target={typeIri}>
                                <span>{label}</span>
                            </WithFetchStatus>
                        </React.Fragment>
                    );
                }) : null}
            </div>
            <WithFetchStatus type='element' target={data.id}>
                <div className={`${CLASS_NAME}__label`}
                    title={label}>
                    {label}
                </div>
            </WithFetchStatus>
        </div>
    );
}
