import cx from 'clsx';
import * as React from 'react';

import { EventObserver } from '../../coreUtils/events';
import { useObservedProperty, useEventStore, useSyncStore } from '../../coreUtils/hooks';

import type { ValidationSeverity } from '../../data/validationProvider';

import { useCanvas } from '../../diagram/canvasApi';
import { ElementDecoration } from '../../diagram/elementLayer';
import { type ShapeGeometry } from '../../diagram/geometry';
import { HtmlSpinner } from '../../diagram/spinner';

import { AuthoredEntity } from '../../editor/authoringState';
import { EntityElement } from '../../editor/dataElements';
import { getMaxSeverity } from '../../editor/validation';

import { useWorkspace } from '../../workspace/workspaceContext';

import { useAuthoredEntity } from './authoredEntity';

const CLASS_NAME = 'reactodia-authoring-state';

export function AuthoredEntityDecorator(props: {
    target: EntityElement;
    inlineActions: boolean;
}) {
    const {target, inlineActions} = props;
    const {canvas} = useCanvas();
    const {model, editor, translation: t} = useWorkspace();

    const onlyTargetSelected = useObservedProperty(
        model.events,
        'changeSelection',
        () => model.selection.length === 1 && model.selection[0] === target
    );
    const data = useObservedProperty(target.events, 'changeData', () => target.data);

    const dependencies = [data];
    const state = useSyncStore(
        useEventStore(editor.events, 'changeAuthoringState', dependencies),
        () => editor.authoringState.elements.get(data.id)
    );
    const validation = useSyncStore(
        useEventStore(editor.events, 'changeValidationState', dependencies),
        () => editor.validationState.elements.get(data.id)
    );
    const isTemporary = useSyncStore(
        useEventStore(editor.events, 'changeTemporaryState', dependencies),
        () => editor.temporaryState.elements.has(data.id)
    );

    const [shape, setShape] = React.useState(() => canvas.renderingState.getElementShape(target));
    React.useEffect(() => {
        const listener = new EventObserver();
        listener.listen(canvas.renderingState.events, 'changeElementSize', e => {
            if (e.source === target) {
                setShape(canvas.renderingState.getElementShape(target));
            }
        });
        return () => listener.stopListening();
    }, [target]);

    let elementOutlines: React.ReactElement | null = null;
    if (isTemporary) {
        elementOutlines = (
            <>
                <ElementSvgShape shape={shape}
                    className={`${CLASS_NAME}__outline-overlay`}
                />
                <ElementSvgShape shape={shape}
                    fill='url(#stripe-pattern)'
                />
            </>
        );
    } else if (state && state.type === 'entityDelete') {
        const cx = shape.bounds.width / 2;
        const cy = shape.bounds.height / 2;
        const rx = shape.type === 'rect' ? cx : cx * Math.SQRT1_2;
        const ry = shape.type === 'rect' ? cy : cy * Math.SQRT1_2;
        elementOutlines = (
            <g key={target.id}>
                <ElementSvgShape shape={shape}
                    className={`${CLASS_NAME}__outline-overlay`}
                />
                <line className={`${CLASS_NAME}__outline-cross-line`}
                    x1={cx - rx} y1={cy - ry} x2={cx + rx} y2={cy + ry}
                />
                <line className={`${CLASS_NAME}__outline-cross-line`}
                    x1={cx - rx} y1={cy + ry} x2={cx + rx} y2={cy - ry}
                />
            </g>
        );
    }

    let elementValidations: React.ReactElement | null = null;
    if (validation) {
        const severity = getMaxSeverity(validation.items);

        const title = validation.items.map(item => {
            if (item.propertyType) {
                const propertyType = model.getPropertyType(item.propertyType);
                const source = t.formatLabel(
                    propertyType?.data?.label,
                    item.propertyType,
                    model.language
                );
                return `${source}: ${item.message}`;
            } else {
                return item.message;
            }
        }).join('\n');
        
        elementValidations = (
            <div className={cx(`${CLASS_NAME}__item-validation`, getSeverityClass(severity))}
                title={title}>
                {validation.loading
                    ? <HtmlSpinner width={15} height={17} />
                    : <div className={`${CLASS_NAME}__item-validation-icon`} />}
                {(!validation.loading && validation.items.length > 0)
                    ? validation.items.length : undefined}
            </div>
        );
    }

    const elementState = (
        <div key={target.id}
            className={`${CLASS_NAME}__state-indicator`}>
            <div className={`${CLASS_NAME}__state-indicator-body`}>
                {state ? (
                    <span className={`${CLASS_NAME}__state-label`}>
                        {(
                            state.type === 'entityAdd' ? t.text('authoring_state.entity_add.label') :
                            state.type === 'entityChange' ? t.text('authoring_state.entity_change.label') :
                            state.type === 'entityDelete' ? t.text('authoring_state.entity_delete.label') :
                            null
                        )}
                    </span>
                ) : null}
                {isTemporary ? null : (
                    <InlineActions target={target}
                        state={state}
                        allActions={Boolean(inlineActions)}
                    />
                )}
                {elementValidations}
            </div>
        </div>
    );

    const isOptional = !state && !validation;
    return (
        <ElementDecoration target={target}>
            <div
                className={cx(
                    `${CLASS_NAME}__decorator`,
                    isOptional ? `${CLASS_NAME}__decorator--optional` : undefined,
                    onlyTargetSelected ? `${CLASS_NAME}__decorator--selected` : undefined
                )}
                data-reactodia-no-export='true'>
                {elementOutlines ? (
                    <svg className={`${CLASS_NAME}__element-outlines`}
                        width={shape.bounds.width}
                        height={shape.bounds.height}>
                        <defs>
                            <pattern id='stripe-pattern'
                                patternUnits='userSpaceOnUse'
                                width={13}
                                height={13}
                                patternTransform='rotate(45)'>
                                <line className={`${CLASS_NAME}__outline-stripe-line`}
                                    x1={0} y={0} x2={0} y2={13}
                                />
                            </pattern>
                        </defs>
                        {elementOutlines}
                    </svg>
                ) : null}
                {elementState}
            </div>
        </ElementDecoration>
    );
}

function getSeverityClass(severity: ValidationSeverity): string | undefined {
    switch (severity) {
        case 'info':
            return `${CLASS_NAME}--severity-info`;
        case 'warning':
            return `${CLASS_NAME}--severity-warning`;
        case 'error':
            return `${CLASS_NAME}--severity-error`;
        default:
            return undefined;
    }
}

function InlineActions(props: {
    target: EntityElement;
    state: AuthoredEntity | undefined;
    allActions: boolean;
}) {
    const {target, state, allActions} = props;
    const {editor, translation: t} = useWorkspace();

    const authored = useAuthoredEntity(target.data, allActions);

    return (
        <div className={`${CLASS_NAME}__actions`}>
            {allActions && (!state || state.type === 'entityAdd' || state.type === 'entityChange') ? (
                <button className={`${CLASS_NAME}__action ${CLASS_NAME}__action-edit`}
                    disabled={!authored.canEdit}
                    onClick={() => authored.onEdit(target)}
                    title={
                        authored.canEdit
                            ? t.text('authoring_state.entity_action_edit.title')
                            : t.text('authoring_state.entity_action_edit.title_disabled')
                    }>
                    {t.text('authoring_state.entity_action_edit.label')}
                </button>
            ) : null}
            {(allActions && !state) || state?.type === 'entityAdd' ? (
                <button className={`${CLASS_NAME}__action ${CLASS_NAME}__action-delete`}
                    disabled={!authored.canDelete}
                    onClick={() => authored.onDelete()}
                    title={
                        authored.canEdit
                            ? t.text('authoring_state.entity_action_delete.title')
                            : t.text('authoring_state.entity_action_delete.title_disabled')
                    }>
                    {t.text('authoring_state.entity_action_delete.label')}
                </button>
            ) : null}
            {state && state.type !== 'entityAdd' ? (
                <button className={`${CLASS_NAME}__action ${CLASS_NAME}__action-discard`}
                    onClick={() => editor.discardChange(state)}
                    title={t.text('authoring_state.entity_action_discard.title')}>
                    {t.text('authoring_state.entity_action_discard.label')}
                </button>
            ) : null}
        </div>
    );
}

function ElementSvgShape(
    props: { shape: ShapeGeometry } & Omit<React.SVGProps<unknown>, 'ref'>
): React.ReactElement | null {
    const {shape, ...otherProps} = props;
    switch (shape.type) {
        case 'rect': {
            return (
                <rect
                    x={0} y={0}
                    width={shape.bounds.width}
                    height={shape.bounds.height}
                    {...otherProps}
                />
            );
        }
        case 'ellipse': {
            const rx = shape.bounds.width / 2;
            const ry = shape.bounds.height / 2;
            return (
                <ellipse
                    cx={rx} cy={ry}
                    rx={rx} ry={ry}
                    {...otherProps}
                />
            );
        }
        default: {
            return null;
        }
    }
}
