import cx from 'clsx';
import * as React from 'react';

import { EventObserver } from '../../coreUtils/events';

import type { ValidationSeverity } from '../../data/validationProvider';

import { CanvasApi, useCanvas } from '../../diagram/canvasApi';
import { Vector } from '../../diagram/geometry';
import { HtmlSpinner } from '../../diagram/spinner';

import { AuthoredEntity } from '../../editor/authoringState';
import { EntityElement } from '../../editor/dataElements';
import { ElementValidation, LinkValidation, getMaxSeverity } from '../../editor/validation';

import { VisualAuthoringTopic } from '../../workspace/commandBusTopic';
import { type WorkspaceContext, useWorkspace } from '../../workspace/workspaceContext';

import { useAuthoredEntity } from './authoredEntity';

export interface AuthoredEntityDecoratorProps {
    target: EntityElement;
    position: Vector;
    inlineActions?: boolean;
}

export function AuthoredEntityDecorator(props: AuthoredEntityDecoratorProps) {
    const {canvas} = useCanvas();
    const workspace = useWorkspace();
    return (
        <AuthoredEntityDecoratorInner {...props}
            canvas={canvas}
            workspace={workspace}
        />
    );
}

interface AuthoredEntityDecoratorInnerProps extends AuthoredEntityDecoratorProps {
    canvas: CanvasApi;
    workspace: WorkspaceContext;
}

interface State {
    state?: AuthoredEntity;
    validation?: ElementValidation;
    isTemporary?: boolean;
}

const CLASS_NAME = 'reactodia-authoring-state';

class AuthoredEntityDecoratorInner extends React.Component<AuthoredEntityDecoratorInnerProps, State> {
    private readonly listener = new EventObserver();

    constructor(props: AuthoredEntityDecoratorInnerProps) {
        super(props);
        const {target, workspace: {editor}} = this.props;
        this.state = {
            state: editor.authoringState.elements.get(target.iri),
            validation: editor.validationState.elements.get(target.iri),
            isTemporary: editor.temporaryState.elements.has(target.iri),
        };
    }

    componentDidMount() {
        const {target, canvas, workspace: {editor}} = this.props;
        this.listener.listen(canvas.renderingState.events, 'changeElementSize', e => {
            if (e.source === target) {
                this.forceUpdate();
            }
        });
        this.listener.listen(editor.events, 'changeAuthoringState', e => {
            const state = editor.authoringState.elements.get(target.iri);
            if (state === e.previous.elements.get(target.iri)) { return; }
            this.setState({state});
        });
        this.listener.listen(editor.events, 'changeValidationState', e => {
            const validation = editor.validationState.elements.get(target.iri);
            if (validation === e.previous.elements.get(target.iri)) { return; }
            this.setState({validation});
        });
        this.listener.listen(editor.events, 'changeTemporaryState', e => {
            const isTemporary = editor.temporaryState.elements.has(target.iri);
            if (isTemporary === e.previous.elements.has(target.iri)) { return; }
            this.setState({isTemporary});
        });
        this.listener.listen(target.events, 'changeData', e => {
            if (e.previous.id !== target.iri) {
                this.setState({
                    isTemporary: editor.temporaryState.elements.has(target.iri),
                    validation: editor.validationState.elements.get(target.iri),
                    state: editor.authoringState.elements.get(target.iri),
                });
            }
        });
    }

    componentWillUnmount() {
        this.listener.stopListening();
    }

    shouldComponentUpdate(nextProps: AuthoredEntityDecoratorProps, nextState: State) {
        return (
            this.state.state !== nextState.state ||
            this.state.validation !== nextState.validation ||
            this.state.isTemporary !== nextState.isTemporary ||
            this.props.position !== nextProps.position
        );
    }

    private renderElementOutlines() {
        const {target, canvas} = this.props;
        const {state, isTemporary} = this.state;
        const {width, height} = canvas.renderingState.getElementSize(target) ?? {width: 0, height: 0};
        if (isTemporary) {
            return (
                <>
                    <rect className={`${CLASS_NAME}__outline-overlay`}
                        x={0} y={0}
                        width={width}
                        height={height}
                    />
                    <rect x={0} y={0}
                        width={width}
                        height={height}
                        fill='url(#stripe-pattern)'
                    />
                </>
            );
        }
        if (state && state.type === 'entityDelete') {
            const right = width;
            const bottom = height;
            return (
                <g key={target.id}>
                    <rect className={`${CLASS_NAME}__outline-overlay`}
                        x={0} y={0}
                        width={width}
                        height={height}
                    />
                    <line className={`${CLASS_NAME}__outline-cross-line`}
                        x1={0} y1={0} x2={right} y2={bottom}
                    />
                    <line className={`${CLASS_NAME}__outline-cross-line`}
                        x1={right} y1={0} x2={0} y2={bottom}
                    />
                </g>
            );
        }
        return null;
    }

    private renderElementState() {
        const {target, inlineActions, workspace: {editor, translation: t, getCommandBus}} = this.props;
        const {state, isTemporary} = this.state;

        return (
            <div className={`${CLASS_NAME}__state-indicator`}
                key={target.id}
                style={{left: 0, top: 0}}>
                <div className={`${CLASS_NAME}__state-indicator-container`}>
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
                        {this.renderElementValidations()}
                    </div>
                </div>
            </div>
        );
    }

    private renderValidationIcon(title: string, validation: LinkValidation | ElementValidation) {
        const severity = getMaxSeverity(validation.items);
        return (
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

    private renderElementValidations() {
        const {workspace: {model, translation: t}} = this.props;
        const {validation} = this.state;
        if (!validation) {
            return null;
        }
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

        return this.renderValidationIcon(title, validation);
    }

    render() {
        const {target, canvas} = this.props;
        const {position} = target;
        const size = canvas.renderingState.getElementSize(target) ?? {width: 0, height: 0};
        const transform = `translate(${position.x}px,${position.y}px)`;
        const outlines = this.renderElementOutlines();
        const state = this.renderElementState();
        if (!outlines && !state) {
            return null;
        }
        return (
            <div style={{position: 'absolute', transform}}>
                {outlines ? (
                    <svg className={`${CLASS_NAME}__element-outlines`}
                        width={size.width}
                        height={size.height}>
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
                        {this.renderElementOutlines()}
                    </svg>
                ) : null}
                {state}
            </div>
        );
    }
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
