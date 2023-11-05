import * as React from 'react';

import { MetadataApi } from '../data/metadataApi';

import { Element as DiagramElement, ElementEvents, Element } from '../diagram/elements';
import { Vector, boundsOf } from '../diagram/geometry';
import { PaperWidgetProps } from '../diagram/paperArea';

import { EditorController } from '../editor/editorController';
import { AuthoringState } from '../editor/authoringState';

import { AnyListener, EventObserver } from '../viewUtils/events';
import { mapAbortedToNull } from '../viewUtils/async';
import { Debouncer } from '../viewUtils/scheduler';
import { HtmlSpinner } from '../viewUtils/spinner';

export interface HaloProps extends PaperWidgetProps {
    target: DiagramElement | undefined;
    editor: EditorController;
    metadataApi?: MetadataApi;
    onRemove?: () => void;
    onExpand?: () => void;
    navigationMenuOpened?: boolean;
    onToggleNavigationMenu?: () => void;
    onAddToFilter?: () => void;
    onEstablishNewLink?: (point: Vector) => void;
    onFollowLink?: (element: Element, event: React.MouseEvent<any>) => void;
}

interface State {
    canLink?: boolean;
}

const CLASS_NAME = 'ontodia-halo';

type ProvidedProps =
    Omit<HaloProps, keyof PaperWidgetProps> &
    Required<PaperWidgetProps>;

export class Halo extends React.Component<HaloProps, State> {
    private readonly listener = new EventObserver();
    private targetListener = new EventObserver();
    private queryDebouncer = new Debouncer();
    private queryCancellation = new AbortController();

    constructor(props: HaloProps) {
        super(props);
        this.state = {};
    }

    componentDidMount() {
        const {editor, target} = this.props;
        this.listener.listen(editor.events, 'changeAuthoringState', () => {
            this.queryAllowedActions();
        });
        this.listenToElement(target);
        this.queryAllowedActions();
    }

    componentDidUpdate(prevProps: HaloProps) {
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

    listenToElement(element: DiagramElement | undefined) {
        this.targetListener.stopListening();
        if (element) {
            this.targetListener.listenAny(element.events, this.onElementEvent);
        }
    }

    private queryAllowedActions() {
        this.queryDebouncer.call(() => {
            const {target} = this.props;
            this.queryCancellation.abort();
            this.queryCancellation = new AbortController();
            this.canLink(target);
        });
    }

    private canLink(target: DiagramElement | undefined) {
        const {metadataApi, editor} = this.props;
        if (!(metadataApi && target)) {
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
                metadataApi.canLinkElement(target.data, signal),
                signal
            ).then(canLink => {
                if (canLink === null) { return; }
                if (this.props.target?.iri === target.iri) {
                    this.setState({canLink});
                }
            });
        }
    }

    private onElementEvent: AnyListener<ElementEvents> = data => {
        if (data.changePosition || data.changeSize || data.changeExpanded) {
            this.forceUpdate();
        }
        if (data.changeData) {
            this.queryAllowedActions();
        }
    }

    render() {
        const {
            paperArea, editor, target, navigationMenuOpened, onToggleNavigationMenu, onAddToFilter,
            onExpand, onFollowLink,
        } = this.props as ProvidedProps;

        if (!target) {
            return <div className={CLASS_NAME} style={{display: 'none'}} />;
        }

        const bbox = boundsOf(target);
        const {x: x0, y: y0} = paperArea.paperToScrollablePaneCoords(bbox.x, bbox.y);
        const {x: x1, y: y1} = paperArea.paperToScrollablePaneCoords(
            bbox.x + bbox.width,
            bbox.y + bbox.height,
        );
        const MARGIN = 5;
        const style: React.CSSProperties = {left: x0 - MARGIN, top: y0 - MARGIN,
            width: ((x1 - x0) + MARGIN * 2), height: ((y1 - y0) + MARGIN * 2)};

        return (
            <div className={CLASS_NAME} style={style}>
                {this.renderRemoveOrDeleteButton()}
                {onToggleNavigationMenu && <div role='button'
                    className={navigationMenuOpened
                        ? `${CLASS_NAME}__navigate-close`
                        : `${CLASS_NAME}__navigate-open`
                    }
                    title='Navigate to connected elements'
                    onClick={onToggleNavigationMenu} />}
                {onFollowLink && <a className={`${CLASS_NAME}__link`}
                    href={target.iri}
                    role='button'
                    title='Jump to resource'
                    onClick={e => onFollowLink(target, e)} />}
                {onAddToFilter && <div className={`${CLASS_NAME}__add-to-filter`}
                    role='button'
                    title='Search for connected elements'
                    onClick={onAddToFilter} />}
                {onExpand && <div className={`${CLASS_NAME}__expand ` +
                    `${CLASS_NAME}__expand--${target.isExpanded ? 'closed' : 'open'}`}
                    role='button'
                    title={`Expand an element to reveal additional properties`}
                    onClick={onExpand} />}
                {editor.inAuthoringMode ? this.renderEstablishNewLinkButton() : null}
            </div>
        );
    }

    private renderRemoveOrDeleteButton() {
        const {editor, target, onRemove} = this.props;
        if (!(target && onRemove)) {
            return null;
        }

        const isNewElement = AuthoringState.isNewElement(editor.authoringState, target.iri);
        return (
            <div className={isNewElement ? `${CLASS_NAME}__delete` : `${CLASS_NAME}__remove`}
                role='button'
                title={isNewElement ? 'Delete new element' : 'Remove an element from the diagram'}
                onClick={onRemove}>
            </div>
        );
    }

    private renderEstablishNewLinkButton() {
        const {onEstablishNewLink} = this.props;
        const {canLink} = this.state;
        if (!onEstablishNewLink) { return null; }
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
            <button className={`${CLASS_NAME}__establish-connection`} title={title}
                onMouseDown={this.onEstablishNewLink} disabled={!canLink} />
        );
    }

    private onEstablishNewLink = (e: React.MouseEvent<HTMLElement>) => {
        const {paperArea, onEstablishNewLink} = this.props as ProvidedProps;
        const point = paperArea.pageToPaperCoords(e.pageX, e.pageY);
        onEstablishNewLink!(point);
    }
}
