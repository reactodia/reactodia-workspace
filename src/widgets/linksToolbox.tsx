import * as React from 'react';
import classnames from 'classnames';

import { Debouncer } from '../coreUtils/scheduler';
import { EventObserver, EventTrigger } from '../coreUtils/events';

import { LinkCount } from '../data/model';
import { changeLinkTypeVisibility } from '../diagram/commands';
import { Element, LinkType, LinkTypeVisibility } from '../diagram/elements';
import { CommandHistory } from '../diagram/history';
import { DiagramModel } from '../diagram/model';

import { WithFetchStatus } from '../editor/withFetchStatus';

import { WorkspaceContext } from '../workspace/workspaceContext';

import type { InstancesSearchCommands } from './instancesSearch';
import { highlightSubstring } from './listElementView';
import { ProgressBar, ProgressState } from './progressBar';

interface LinkInToolBoxProps {
    model: DiagramModel;
    link: LinkType;
    count: number;
    onPressFilter?: (type: LinkType) => void;
    filterKey?: string;
}

const CLASS_NAME = 'link-types-toolbox';

class LinkInToolBox extends React.Component<LinkInToolBoxProps> {
    private onPressFilter = () => {
        if (this.props.onPressFilter) {
            this.props.onPressFilter(this.props.link);
        }
    };

    private changeState(state: LinkTypeVisibility) {
        const history = this.props.model.history;
        changeLinkTypeState(history, state, [this.props.link]);
    }

    private isChecked(stateName: LinkTypeVisibility): boolean {
        return this.props.link.visibility === stateName;
    }

    private getText() {
        const {link: linkType, model, filterKey} = this.props;
        const fullText = model.locale.formatLabel(linkType.label, linkType.id);
        return highlightSubstring(fullText, filterKey);
    }

    render() {
        return (
            <li data-linktypeid={this.props.link.id}
                className={classnames(`${CLASS_NAME}__link-item`, 'clearfix')}>
                <span data-toggle='buttons'
                    className={classnames(
                        `${CLASS_NAME}__link-buttons`,
                        'reactodia-btn-group reactodia-btn-group-xs'
                    )}>
                    <button id='hidden' title='Hide links and labels'
                        className={classnames(
                            `${CLASS_NAME}__toggle-invisible`,
                            'reactodia-btn reactodia-btn-default',
                            this.isChecked('hidden') ? 'active' : undefined
                        )}
                        onClick={() => this.changeState('hidden')}>
                    </button>
                    <button id='withoutLabel' title='Show only lines for links (without labels)'
                        className={classnames(
                            `${CLASS_NAME}__toggle-lines-only`,
                            'reactodia-btn reactodia-btn-default',
                            this.isChecked('withoutLabel') ? 'active' : undefined
                        )}
                        onClick={() => this.changeState('withoutLabel')}>
                    </button>
                    <button id='visible' title='Show links with labels'
                        className={classnames(
                            `${CLASS_NAME}__toggle-visible`,
                            'reactodia-btn reactodia-btn-default',
                            this.isChecked('visible') ? 'active' : undefined
                        )}
                        onClick={() => this.changeState('visible')}>
                    </button>
                </span>
                <WithFetchStatus type='linkType' target={this.props.link.id}>
                    <div className={`${CLASS_NAME}__link-title`}>{this.getText()}</div>
                </WithFetchStatus>
                {this.props.count === 0 ? null : (
                    <span className={classnames(`${CLASS_NAME}__count-badge`, 'reactodia-badge')}>
                        {this.props.count}
                    </span>
                )}
                {this.props.onPressFilter ? (
                    <div className={`${CLASS_NAME}__filter-button`}
                        onClick={this.onPressFilter}
                    />
                ) : null}
            </li>
        );
    }
}

interface LinkTypesToolboxViewProps {
    model: DiagramModel;
    links: ReadonlyArray<LinkType> | undefined;
    countMap: { readonly [linkTypeId: string]: number } | undefined;
    selectedElement: Element | undefined;
    dataState: ProgressState;
    filterCallback: ((type: LinkType) => void) | undefined;
}

class LinkTypesToolboxView extends React.Component<LinkTypesToolboxViewProps, { filterKey: string }> {
    constructor(props: LinkTypesToolboxViewProps) {
        super(props);
        this.state = {filterKey: ''};
    }

    private compareLinks = (a: LinkType, b: LinkType) => {
        const {model} = this.props;
        const aText = model.locale.formatLabel(a.label, a.id);
        const bText = model.locale.formatLabel(b.label, b.id);
        return aText.localeCompare(bText);
    };

    private onChangeInput = (e: React.SyntheticEvent<HTMLInputElement>) => {
        this.setState({filterKey: e.currentTarget.value});
    };

    private onDropFilter = () => {
        this.setState({filterKey: ''});
    };

    private getLinks() {
        const {model, links = []} = this.props;
        return links
            .filter(linkType => {
                const text = model.locale.formatLabel(linkType.label, linkType.id).toLowerCase();
                return !this.state.filterKey || text.indexOf(this.state.filterKey.toLowerCase()) >= 0;
            })
            .sort(this.compareLinks);
    }

    private getViews(links: LinkType[]) {
        const countMap = this.props.countMap || {};
        const views: React.ReactElement<any>[] = [];
        for (const link of links) {
            views.push(
                <LinkInToolBox key={link.id}
                    model={this.props.model}
                    link={link}
                    onPressFilter={this.props.filterCallback}
                    count={countMap[link.id] || 0}
                    filterKey={this.state.filterKey}
                    
                />
            );
        }
        return views;
    }

    render() {
        const {model, dataState, selectedElement} = this.props;
        const history = model.history;

        const links = this.getLinks();
        const views = this.getViews(links);

        let connectedTo: JSX.Element | null = null;
        if (selectedElement) {
            const selectedElementLabel = model.locale.formatLabel(
                selectedElement.data.label,
                selectedElement.iri
            );
            connectedTo = (
                <span role='heading'
                    className={`${CLASS_NAME}__links-heading`}
                    style={{display: 'block'}}>
                    Connected to{'\u00A0'}
                    <span>{selectedElementLabel}</span>
                </span>
            );
        }

        let dropButton: JSX.Element | null = null;
        if (this.state.filterKey) {
            dropButton = <button type='button' className={`${CLASS_NAME}__clearSearch`}
                onClick={this.onDropFilter}>
                <span aria-hidden='true'></span>
            </button>;
        }

        const enableVisibilityButtons = links.length > 0;
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__heading`}>
                    <div className={`${CLASS_NAME}__searching-box`}>
                        <input className='search-input reactodia-form-control'
                            type='text'
                            value={this.state.filterKey}
                            onChange={this.onChangeInput}
                            placeholder='Search for...' />
                        {dropButton}
                    </div>
                    <div className={`${CLASS_NAME}__switch-all`}>
                        <div className='reactodia-btn-group reactodia-btn-group-xs'>
                            <button title='Hide links and labels'
                                className={classnames(
                                    `${CLASS_NAME}__toggle-invisible`,
                                    'reactodia-btn reactodia-btn-default'
                                )}
                                disabled={!enableVisibilityButtons}
                                onClick={() => changeLinkTypeState(history, 'hidden', links)}>
                            </button>
                            <button title='Show only lines for links (without labels)'
                                className={classnames(
                                    `${CLASS_NAME}__toggle-lines-only`,
                                    'reactodia-btn reactodia-btn-default'
                                )}
                                disabled={!enableVisibilityButtons}
                                onClick={() => changeLinkTypeState(history, 'withoutLabel', links)}>
                            </button>
                            <button title='Show links with labels'
                                className={classnames(
                                    `${CLASS_NAME}__toggle-visible`,
                                    'reactodia-btn reactodia-btn-default'
                                )}
                                disabled={!enableVisibilityButtons}
                                onClick={() => changeLinkTypeState(history, 'visible', links)}>
                            </button>
                        </div>
                        <span>&nbsp;Switch all</span>
                    </div>
                </div>
                <ProgressBar state={dataState}
                    title='Loading connected links for the selected element'
                />
                <div className={`${CLASS_NAME}__rest`}>
                    {connectedTo}
                    <div className='reactodia-scrollable'>
                        <ul className={`${CLASS_NAME}__connected-links`}>{views}</ul>
                    </div>
                </div>
            </div>
        );
    }
}

export interface LinkTypesToolboxProps {
    instancesSearchCommands?: EventTrigger<InstancesSearchCommands>;
}

interface LinkTypesToolboxState {
    readonly dataState: ProgressState;
    readonly selectedElement?: Element;
    readonly linksOfElement?: ReadonlyArray<LinkType>;
    readonly countMap?: { readonly [linkTypeId: string]: number };
}

export class LinkTypesToolbox extends React.Component<LinkTypesToolboxProps, LinkTypesToolboxState> {
    static contextType = WorkspaceContext;
    declare readonly context: WorkspaceContext;

    private readonly listener = new EventObserver();
    private readonly linkListener = new EventObserver();
    private readonly debounceSelection = new Debouncer(50 /* ms */);

    private currentRequest: { elementId: string } | undefined;

    constructor(props: LinkTypesToolboxProps, context: any) {
        super(props, context);

        const {model, editor} = this.context;

        this.listener.listen(model.events, 'loadingSuccess', this.updateOnCurrentSelection);
        this.listener.listen(model.events, 'changeLanguage', this.updateOnCurrentSelection);
        this.listener.listen(editor.events, 'changeSelection', () => {
            this.debounceSelection.call(this.updateOnCurrentSelection);
        });

        this.state = {dataState: 'none'};
    }

    componentDidMount() {
        this.updateOnCurrentSelection();
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.linkListener.stopListening();
        this.debounceSelection.dispose();
    }

    private updateOnCurrentSelection = () => {
        const {editor} = this.context;
        const single = editor.selection.length === 1 ? editor.selection[0] : null;
        if (single !== this.state.selectedElement && single instanceof Element) {
            this.requestLinksOf(single);
        }
    };

    private requestLinksOf(selectedElement: Element) {
        const {model} = this.context;
        if (selectedElement) {
            const request = {elementId: selectedElement.iri};
            this.currentRequest = request;
            this.setState({dataState: 'loading', selectedElement});
            model.dataProvider.connectedLinkStats(request).then(linkTypes => {
                if (this.currentRequest !== request) { return; }
                const {linksOfElement, countMap} = this.computeStateFromRequestResult(linkTypes);
                this.subscribeOnLinksEvents(linksOfElement);
                this.setState({dataState: 'completed', linksOfElement, countMap});
            }).catch(error => {
                if (this.currentRequest !== request) { return; }
                console.error(error);
                this.setState({dataState: 'error', linksOfElement: undefined, countMap: {}});
            });
        } else {
            this.currentRequest = undefined;
            this.setState({
                dataState: 'completed',
                selectedElement,
                linksOfElement: undefined,
                countMap: {},
            });
        }
    }

    private computeStateFromRequestResult(linkTypes: ReadonlyArray<LinkCount>) {
        const {model} = this.context;

        const linksOfElement: LinkType[] = [];
        const countMap: { [linkTypeId: string]: number } = {};

        for (const linkType of linkTypes) {
            const type = model.createLinkType(linkType.id);
            linksOfElement.push(type);
            countMap[linkType.id] = linkType.inCount + linkType.outCount;
        }

        return {linksOfElement, countMap};
    }

    private subscribeOnLinksEvents(linksOfElement: LinkType[]) {
        this.linkListener.stopListening();

        const listener = this.linkListener;
        for (const link of linksOfElement) {
            listener.listen(link.events, 'changeLabel', this.onLinkChanged);
            listener.listen(link.events, 'changeVisibility', this.onLinkChanged);
        }
    }

    private onLinkChanged = () => {
        this.forceUpdate();
    };

    render() {
        const {instancesSearchCommands} = this.props;
        const {model} = this.context;
        const {selectedElement, dataState, linksOfElement, countMap} = this.state;
        return (
            <LinkTypesToolboxView model={model}
                dataState={dataState}
                links={linksOfElement}
                countMap={countMap}
                filterCallback={instancesSearchCommands ? this.onAddToFilter : undefined}
                selectedElement={selectedElement}
            />
        );
    }

    private onAddToFilter = (linkType: LinkType) => {
        const {instancesSearchCommands} = this.props;
        const {selectedElement} = this.state;
        instancesSearchCommands?.trigger('setCriteria', {
            criteria: {
                refElement: selectedElement,
                refElementLink: linkType,
            }
        });
    };
}

function changeLinkTypeState(history: CommandHistory, state: LinkTypeVisibility, links: ReadonlyArray<LinkType>) {
    const batch = history.startBatch('Change link types visibility');
    for (const linkType of links) {
        history.execute(changeLinkTypeVisibility(linkType, state));
    }
    batch.store();
}
