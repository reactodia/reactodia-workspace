import * as React from 'react';
import classnames from 'classnames';

import { EventObserver } from '../../coreUtils/events';

import type { ValidationSeverity } from '../../data/validationProvider';

import { CanvasApi, useCanvas } from '../../diagram/canvasApi';
import { Vector } from '../../diagram/geometry';
import { HtmlSpinner } from '../../diagram/spinner';

import { AuthoredEntity } from '../../editor/authoringState';
import { EntityElement } from '../../editor/dataElements';
import { ElementValidation, LinkValidation, getMaxSeverity } from '../../editor/validation';

import { type WorkspaceContext, useWorkspace } from '../../workspace/workspaceContext';

export interface ElementDecoratorProps {
    target: EntityElement;
    position: Vector;
}

export function ElementDecorator(props: ElementDecoratorProps) {
    const {canvas} = useCanvas();
    const workspace = useWorkspace();
    return (
        <ElementDecoratorInner {...props}
            canvas={canvas}
            workspace={workspace}
        />
    );
}

interface ElementDecoratorInnerProps extends ElementDecoratorProps {
    canvas: CanvasApi;
    workspace: WorkspaceContext;
}

interface State {
    state?: AuthoredEntity;
    validation?: ElementValidation;
    isTemporary?: boolean;
}

const CLASS_NAME = 'reactodia-authoring-state';

class ElementDecoratorInner extends React.Component<ElementDecoratorInnerProps, State> {
    private readonly listener = new EventObserver();

    constructor(props: ElementDecoratorInnerProps) {
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

    shouldComponentUpdate(nextProps: ElementDecoratorProps, nextState: State) {
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
            return [
                <rect key={`${target.id}-opacity`} x={0} y={0} width={width} height={height}
                    fill='rgba(255, 255, 255, 0.5)' />,
                <rect key={`${target.id}-stripes`} x={0} y={0} width={width} height={height}
                    fill='url(#stripe-pattern)' />
            ];
        }
        if (state && state.type === 'entityDelete') {
            const right = width;
            const bottom = height;
            return (
                <g key={target.id}>
                    <rect x={0} y={0} width={width} height={height} fill='white' fillOpacity={0.5} />
                    <line x1={0} y1={0} x2={right} y2={bottom} stroke='red' />
                    <line x1={right} y1={0} x2={0} y2={bottom} stroke='red' />
                </g>
            );
        }
        return null;
    }

    private renderValidationIcon(title: string, validation: LinkValidation | ElementValidation) {
        const severity = getMaxSeverity(validation.items);
        return (
            <div className={classnames(`${CLASS_NAME}__item-validation`, getSeverityClass(severity))}
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
        const {workspace: {model}} = this.props;
        const {validation} = this.state;
        if (!validation) {
            return null;
        }
        const title = validation.items.map(item => {
            if (item.propertyType) {
                const propertyType = model.getPropertyType(item.propertyType);
                const source = model.locale.formatLabel(propertyType?.data?.label, item.propertyType);
                return `${source}: ${item.message}`;
            } else {
                return item.message;
            }
        }).join('\n');

        return this.renderValidationIcon(title, validation);
    }

    private renderElementState() {
        const {target, workspace: {editor, translation: t}} = this.props;
        const {state} = this.state;
        if (state) {
            let statusText: string;
            let title: string;

            switch (state.type) {
                case 'entityAdd': {
                    statusText = t.text('authoring_state.entity_add.label');
                    title = t.text('authoring_state.entity_add_revert.title');
                    break;
                }
                case 'entityChange': {
                    statusText = t.text('authoring_state.entity_change.label');
                    title = t.text('authoring_state.entity_change_revert.title');
                    break;
                }
                case 'entityDelete': {
                    statusText = t.text('authoring_state.entity_delete.label');
                    title = t.text('authoring_state.entity_delete_revert.title');
                    break;
                }
            }

            return (
                <div className={`${CLASS_NAME}__state-indicator`}
                    key={target.id}
                    style={{left: 0, top: 0}}>
                    <div className={`${CLASS_NAME}__state-indicator-container`}>
                        <div className={`${CLASS_NAME}__state-indicator-body`}>
                            <span>
                                <span className={`${CLASS_NAME}__state-label`}>{statusText}</span>
                                [<span className={`${CLASS_NAME}__state-cancel`}
                                    onClick={() => editor.discardChange(state)}
                                    title={title}>{t.text('authoring_state.discard.label')}</span>]
                            </span>
                            {this.renderElementValidations()}
                        </div>
                    </div>
                </div>
            );
        }
        return null;
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
                    <svg width={size.width} height={size.height}
                        style={{position: 'absolute', pointerEvents: 'none', overflow: 'visible'}}>
                        <defs>
                            <pattern id='stripe-pattern' patternUnits='userSpaceOnUse' width={13} height={13}
                                patternTransform='rotate(45)'>
                                <line x1={0} y={0} x2={0} y2={13} stroke='#ddd' strokeWidth={10} strokeOpacity={0.2} />
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
