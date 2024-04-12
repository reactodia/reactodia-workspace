import * as React from 'react';

import { EventObserver } from '../coreUtils/events';

import { CanvasApi, useCanvas } from '../diagram/canvasApi';
import { Vector } from '../diagram/geometry';
import { HtmlSpinner } from '../diagram/spinner';

import { type WorkspaceContext, useWorkspace } from '../workspace/workspaceContext';

import { ElementChange } from './authoringState';
import { EntityElement } from './dataElements';
import { ElementValidation, LinkValidation } from './validation';

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
    state?: ElementChange;
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
        if (state && state.deleted) {
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

    private renderErrorIcon(title: string, validation: LinkValidation | ElementValidation) {
        return <div className={`${CLASS_NAME}__item-error`} title={title}>
            {validation.loading
                ? <HtmlSpinner width={15} height={17} />
                : <div className={`${CLASS_NAME}__item-error-icon`} />}
            {(!validation.loading && validation.errors.length > 0)
                ? validation.errors.length : undefined}
        </div>;
    }

    private renderElementErrors() {
        const {workspace: {model}} = this.props;
        const {validation} = this.state;
        if (!validation) {
            return null;
        }
        const title = validation.errors.map(error => {
            if (error.propertyType) {
                const {id, label} = model.createPropertyType(error.propertyType);
                const source = model.locale.formatLabel(label, id);
                return `${source}: ${error.message}`;
            } else {
                return error.message;
            }
        }).join('\n');

        return this.renderErrorIcon(title, validation);
    }

    private renderElementState() {
        const {target, workspace: {editor}} = this.props;
        const {state} = this.state;
        if (state) {
            const onCancel = () => editor.discardChange(state);

            let renderedState: React.ReactElement<any> | undefined;
            let statusText: string;
            let title: string;

            if (state.deleted) {
                statusText = 'Delete';
                title = 'Revert deletion of the element';
            } else if (!state.before) {
                statusText = 'New';
                title = 'Revert creation of the element';
            } else {
                statusText = 'Change';
                title = 'Revert all changes in properties of the element';
            }

            if (statusText && title) {
                renderedState = (
                    <span>
                        <span className={`${CLASS_NAME}__state-label`}>{statusText}</span>
                        [<span className={`${CLASS_NAME}__state-cancel`}
                            onClick={onCancel} title={title}>cancel</span>]
                    </span>
                );
            }

            const renderedErrors = this.renderElementErrors();
            if (renderedState || renderedErrors) {
                return (
                    <div className={`${CLASS_NAME}__state-indicator`}
                        key={target.id}
                        style={{left: 0, top: 0}}>
                        <div className={`${CLASS_NAME}__state-indicator-container`}>
                            <div className={`${CLASS_NAME}__state-indicator-body`}>
                                {renderedState}
                                {renderedErrors}
                            </div>
                        </div>
                    </div>
                );
            }
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
