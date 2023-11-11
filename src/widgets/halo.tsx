import * as React from 'react';

import { mapAbortedToNull } from '../coreUtils/async';
import { AnyListener, EventObserver, EventTrigger } from '../coreUtils/events';
import { useObservedProperty } from '../coreUtils/hooks';
import { Debouncer } from '../coreUtils/scheduler';

import { CanvasContext, CanvasApi } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';
import { setElementExpanded } from '../diagram/commands';
import { Element, ElementEvents } from '../diagram/elements';
import { boundsOf } from '../diagram/geometry';
import { HtmlSpinner } from '../diagram/spinner';

import { AuthoringState } from '../editor/authoringState';

import type { ConnectionsMenuCommands } from '../widgets/connectionsMenu';
import type { InstancesSearchCommands } from '../widgets/instancesSearch';
import { WorkspaceContext } from '../workspace/workspaceContext';

export interface HaloProps {
    /**
     * @default 5
     */
    margin?: number;
    connectionsMenuCommands?: EventTrigger<ConnectionsMenuCommands>;
    instancesSearchCommands?: EventTrigger<InstancesSearchCommands>;
}

export function Halo(props: HaloProps) {
    const {canvas} = React.useContext(CanvasContext)!;
    const workspace = React.useContext(WorkspaceContext)!;
    const {editor} = workspace;

    const selection = useObservedProperty(
        editor.events,
        'changeSelection',
        () => editor.selection
    );

    if (selection.length === 1) {
        const [target] = selection;
        if (target instanceof Element) {
            return (
                <HaloInner {...props}
                    target={target}
                    canvas={canvas}
                    workspace={workspace}
                />
            );
        }
    }
    return null;
}

defineCanvasWidget(Halo, element => ({element, attachment: 'overElements'}));

interface HaloInnerProps extends HaloProps {
    readonly target: Element;
    readonly canvas: CanvasApi;
    readonly workspace: WorkspaceContext;
}

interface State {
    canLink?: boolean;
}

const CLASS_NAME = 'reactodia-halo';

class HaloInner extends React.Component<HaloInnerProps, State> {
    private readonly listener = new EventObserver();
    private targetListener = new EventObserver();
    private queryDebouncer = new Debouncer();
    private queryCancellation = new AbortController();

    constructor(props: HaloInnerProps) {
        super(props);
        this.state = {};
    }

    componentDidMount() {
        const {target, workspace: {editor, overlayController}} = this.props;
        this.listener.listen(editor.events, 'changeAuthoringState', () => {
            this.queryAllowedActions();
        });
        this.listener.listen(overlayController.events, 'changeOpenedDialog', e => {
            this.forceUpdate();
        });
        this.listenToElement(target);
        this.queryAllowedActions();
    }

    componentDidUpdate(prevProps: HaloInnerProps) {
        if (prevProps.target !== this.props.target) {
            this.listenToElement(this.props.target);
            this.queryAllowedActions();
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.listenToElement(undefined);
        this.queryDebouncer.dispose();
        this.queryCancellation.abort();
    }

    listenToElement(element: Element | undefined) {
        const {canvas} = this.props;
        this.targetListener.stopListening();
        if (element) {
            this.targetListener.listenAny(element.events, this.onElementEvent);
            this.targetListener.listen(canvas.renderingState.events, 'changeElementSize', e => {
                if (e.source === element) {
                    this.forceUpdate();
                }
            });
        }
    }

    private onElementEvent: AnyListener<ElementEvents> = data => {
        if (data.changePosition || data.changeExpanded) {
            this.forceUpdate();
        }
        if (data.changeData) {
            this.queryAllowedActions();
        }
    };

    private queryAllowedActions() {
        this.queryDebouncer.call(() => {
            const {target} = this.props;
            this.queryCancellation.abort();
            this.queryCancellation = new AbortController();
            this.canLink(target);
        });
    }

    private canLink(target: Element | undefined) {
        const {workspace: {editor}} = this.props;
        if (!(editor.metadataApi && target)) {
            this.setState({canLink: false});
            return;
        }
        const event = editor.authoringState.elements.get(target.iri);
        if (event && event.deleted) {
            this.setState({canLink: false});
        } else {
            this.setState({canLink: undefined});
            const signal = this.queryCancellation.signal;
            mapAbortedToNull(
                editor.metadataApi.canLinkElement(target.data, signal),
                signal
            ).then(canLink => {
                if (canLink === null) { return; }
                if (this.props.target?.iri === target.iri) {
                    this.setState({canLink});
                }
            });
        }
    }

    render() {
        const {
            target, canvas, workspace: {editor},
            margin = 5,
            connectionsMenuCommands,
            instancesSearchCommands,
        } = this.props;

        const bbox = boundsOf(target, canvas.renderingState);
        const {x: x0, y: y0} = canvas.metrics.paperToScrollablePaneCoords(bbox.x, bbox.y);
        const {x: x1, y: y1} = canvas.metrics.paperToScrollablePaneCoords(
            bbox.x + bbox.width,
            bbox.y + bbox.height,
        );
        const style: React.CSSProperties = {
            left: x0 - margin,
            top: y0 - margin,
            width: ((x1 - x0) + margin * 2),
            height: ((y1 - y0) + margin * 2),
        };

        return (
            <div className={CLASS_NAME} style={style}>
                {this.renderRemoveOrDeleteButton()}
                {connectionsMenuCommands ? (
                    <div role='button'
                        className={this.isNavigationMenuOpened()
                            ? `${CLASS_NAME}__navigate-close`
                            : `${CLASS_NAME}__navigate-open`
                        }
                        title='Navigate to connected elements'
                        onClick={this.onToggleNavigationMenu}
                    />
                ) : null}
                <a className={`${CLASS_NAME}__link`}
                    href={target.iri}
                    role='button'
                    title='Jump to resource'
                    onClick={this.onFollowLink}
                />
                {instancesSearchCommands ? (
                    <div className={`${CLASS_NAME}__add-to-filter`}
                        role='button'
                        title='Search for connected elements'
                        onClick={this.onAddToFilter}
                    />
                ) : null}
                <div
                    className={`${CLASS_NAME}__expand ` +
                        `${CLASS_NAME}__expand--${target.isExpanded ? 'closed' : 'open'}`
                    }
                    role='button'
                    title='Expand an element to reveal additional properties'
                    onClick={this.onExpand}
                />
                {editor.inAuthoringMode ? this.renderEstablishNewLinkButton() : null}
            </div>
        );
    }

    private renderRemoveOrDeleteButton() {
        const {target, workspace: {editor}} = this.props;
        const isNewElement = AuthoringState.isNewElement(editor.authoringState, target.iri);
        return (
            <div className={isNewElement ? `${CLASS_NAME}__delete` : `${CLASS_NAME}__remove`}
                role='button'
                title={isNewElement ? 'Delete new element' : 'Remove an element from the diagram'}
                onClick={this.onRemove}>
            </div>
        );
    }

    private onRemove = () => {
        const {workspace: {editor}} = this.props;
        editor.removeSelectedElements();
    };

    private isNavigationMenuOpened(): boolean {
        const {target, workspace: {overlayController}} = this.props;
        const {openedDialog} = overlayController;
        return Boolean(
            openedDialog &&
            openedDialog.target === target &&
            openedDialog.knownType === 'connectionsMenu'
        );
    }

    private onToggleNavigationMenu = () => {
        const {target, connectionsMenuCommands, workspace: {overlayController}} = this.props;
        if (this.isNavigationMenuOpened()) {
            overlayController.hideDialog();
        } else if (connectionsMenuCommands) {
            connectionsMenuCommands.trigger('show', {target});
        }
    };

    private onFollowLink = (e: React.MouseEvent) => {
        const {target, workspace: {view}} = this.props;
        view.onIriClick(target.iri, target, 'jumpToEntity', e);
    };

    private onAddToFilter = () => {
        const {target, instancesSearchCommands} = this.props;
        instancesSearchCommands?.trigger('setCriteria', {
            criteria: {refElement: target},
        });
    };

    private onExpand = () => {
        const {target, workspace: {model}} = this.props;
        model.history.execute(setElementExpanded(target, !target.isExpanded));
    };

    private renderEstablishNewLinkButton() {
        const {canLink} = this.state;
        if (canLink === undefined) {
            return (
                <div className={`${CLASS_NAME}__establish-connection-spinner`}>
                    <HtmlSpinner width={20} height={20} />
                </div>
            );
        }
        const title = canLink
            ? 'Establish connection'
            : 'Establishing connection is unavailable for the selected element';
        return (
            <button className={`${CLASS_NAME}__establish-connection`}
                title={title}
                disabled={!canLink}
                onMouseDown={this.onEstablishNewLink}
            />
        );
    }

    private onEstablishNewLink = (e: React.MouseEvent<HTMLElement>) => {
        const {target, workspace: {overlayController}, canvas} = this.props;
        const point = canvas.metrics.pageToPaperCoords(e.pageX, e.pageY);
        overlayController.startEditing({target, mode: 'establishLink', point});
    };
}
