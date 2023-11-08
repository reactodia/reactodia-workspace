import * as React from 'react';
import classnames from 'classnames';

import { EventObserver, Events } from '../coreUtils/events';

import { ElementModel, ElementIri } from '../data/model';
import { FilterParams, LinkedElement } from '../data/provider';
import { Element as DiagramElement, FatLinkType, FatClassModel } from '../diagram/elements';

import { ProgressBar, ProgressState } from '../widgets/progressBar';

import { WorkspaceContext, WorkspaceEventKey } from '../workspace/workspaceContext';

import { SearchResults } from './searchResults';

const DIRECTION_IN_ICON = require('@images/direction-in.png');
const DIRECTION_OUT_ICON = require('@images/direction-out.png');

export interface InstancesSearchProps {
    className?: string;
    commands: Events<InstancesSearchCommands>;
}

export interface InstancesSearchCommands {
    setCriteria: { readonly criteria: SearchCriteria };
}

export interface SearchCriteria {
    readonly text?: string;
    readonly elementType?: FatClassModel;
    readonly refElement?: DiagramElement;
    readonly refElementLink?: FatLinkType;
    readonly linkDirection?: 'in' | 'out';
}

interface State {
    readonly criteria: SearchCriteria;
    readonly inputText?: string;
    readonly querying?: boolean;
    readonly resultId: number;
    readonly error?: any;
    readonly items?: ReadonlyArray<ElementModel>;
    readonly selection: ReadonlySet<ElementIri>;
    readonly moreItemsAvailable?: boolean;
}

const CLASS_NAME = 'ontodia-instances-search';

const ITEMS_PER_PAGE = 100;

export class InstancesSearch extends React.Component<InstancesSearchProps, State> {
    static contextType = WorkspaceContext;
    declare readonly context: WorkspaceContext;

    private readonly listener = new EventObserver();

    private requestCancellation = new AbortController();
    private currentRequest: FilterParams | undefined;

    constructor(props: InstancesSearchProps, context: any) {
        super(props, context);
        this.state = {
            criteria: {},
            resultId: 0,
            selection: new Set<ElementIri>(),
        };
    }

    componentDidMount() {
        const {commands} = this.props;
        const {view, triggerWorkspaceEvent} = this.context;

        this.listener.listen(view.events, 'changeLanguage', () => this.forceUpdate());
        this.listener.listen(commands, 'setCriteria', ({criteria}) => {
            triggerWorkspaceEvent(WorkspaceEventKey.searchUpdateCriteria);
            this.setState({criteria, inputText: undefined});
        });

        this.queryItems(false);
    }

    componentDidUpdate(prevProps: InstancesSearchProps, prevState: State): void {
        if (this.state.criteria !== prevState.criteria) {
            this.queryItems(false)
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.requestCancellation.abort();
        this.currentRequest = undefined;
    }

    render() {
        const {view} = this.context;

        const ENTER_KEY_CODE = 13;

        const className = `${CLASS_NAME} ${this.props.className || ''}`;
        const progressState = (
            this.state.querying ? ProgressState.loading :
            this.state.error ? ProgressState.error :
            this.state.items ? ProgressState.completed :
            ProgressState.none
        );

        const searchTerm = this.state.inputText === undefined
            ? this.state.criteria.text : this.state.inputText;

        return <div className={className}>
            <ProgressBar state={progressState} />
            <div className={`${CLASS_NAME}__criteria`}>
                {this.renderCriteria()}
                <div className={`${CLASS_NAME}__text-criteria ontodia-input-group`}>
                    <input type='text' className='ontodia-form-control' placeholder='Search for...'
                        value={searchTerm || ''}
                        onChange={e => this.setState({inputText: e.currentTarget.value})}
                        onKeyUp={e => {
                            if (e.keyCode === ENTER_KEY_CODE) {
                               this.submitCriteriaUpdate();
                            }
                        }} />
                    <span className='ontodia-input-group-btn'>
                        <button type='button' title='Search'
                            className={classnames(
                                `${CLASS_NAME}__search-button`,
                                'ontodia-btn ontodia-btn-default'
                            )}
                            onClick={() => this.submitCriteriaUpdate()}>
                        </button>
                    </span>
                </div>
            </div>
            {/* specify resultId as key to reset scroll position when loaded new search results */}
            <div className={`${CLASS_NAME}__rest ontodia-scrollable`} key={this.state.resultId}>
                <SearchResults
                    view={view}
                    items={this.state.items}
                    highlightText={this.state.criteria.text}
                    selection={this.state.selection}
                    onSelectionChanged={this.onSelectionChanged}
                />
                <div className={`${CLASS_NAME}__rest-end`}>
                    <button type='button'
                        className={`${CLASS_NAME}__load-more ontodia-btn ontodia-btn-primary`}
                        disabled={this.state.querying}
                        style={{display: this.state.moreItemsAvailable ? undefined : 'none'}}
                        onClick={() => this.queryItems(true)}>
                        Show more
                    </button>
                </div>
            </div>
        </div>;
    }

    private onSelectionChanged = (newSelection: ReadonlySet<ElementIri>) => {
        this.setState({selection: newSelection});
    }

    private renderCriteria(): React.ReactElement<any> {
        const {view} = this.context;
        const {criteria} = this.state;
        const criterions: React.ReactElement<any>[] = [];

        if (criteria.elementType) {
            const classInfo = criteria.elementType;
            const classLabel = view.formatLabel(classInfo.label, classInfo.id);
            criterions.push(<div key='hasType' className={`${CLASS_NAME}__criterion`}>
                {this.renderRemoveCriterionButtons(() => this.setState({
                    criteria: {...criteria, elementType: undefined},
                }))}
                Has type <span className={`${CLASS_NAME}__criterion-class`}
                    title={classInfo.id}>{classLabel}</span>
            </div>);
        } else if (criteria.refElement) {
            const element = criteria.refElement;
            const elementLabel = view.formatLabel(element.data.label, element.iri);

            const linkType = criteria.refElementLink;
            const linkTypeLabel = linkType ? view.formatLabel(linkType.label, linkType.id) : undefined;

            criterions.push(<div key='hasLinkedElement' className={`${CLASS_NAME}__criterion`}>
                {this.renderRemoveCriterionButtons(() => this.setState({
                    criteria: {...criteria, refElement: undefined, refElementLink: undefined},
                }))}
                Connected to <span className={`${CLASS_NAME}__criterion-element`}
                    title={element ? element.iri : undefined}>{elementLabel}</span>
                {linkType && <span>
                    {' through '}
                    <span className={`${CLASS_NAME}__criterion-link-type`}
                        title={linkType ? linkType.id : undefined}>{linkTypeLabel}</span>
                    {criteria.linkDirection === 'in' && <span>
                        {' as '}<img className={`${CLASS_NAME}__link-direction`} src={DIRECTION_IN_ICON} />&nbsp;source
                    </span>}
                    {criteria.linkDirection === 'out' && <span>
                        {' as '}<img className={`${CLASS_NAME}__link-direction`} src={DIRECTION_OUT_ICON} />&nbsp;target
                    </span>}
                </span>}
            </div>);
        }

        return <div className={`${CLASS_NAME}__criterions`}>{criterions}</div>;
    }

    private renderRemoveCriterionButtons(onClick: () => void) {
        return <div className={`${CLASS_NAME}__criterion-remove ontodia-btn-group ontodia-btn-group-xs`}>
            <button type='button' title='Remove criteria'
                className={classnames(
                    `${CLASS_NAME}__criterion-remove-button`,
                    'ontodia-btn ontodia-btn-default'
                )}
                onClick={onClick}>
            </button>
        </div>;
    }

    private submitCriteriaUpdate() {
        this.setState(state => {
            let text = this.state.inputText === undefined ? state.criteria.text : state.inputText;
            text = text === '' ? undefined : text;
            return {
                criteria: {...state.criteria, text},
            };
        });
    }

    private queryItems(loadMoreItems: boolean) {
        const {model, triggerWorkspaceEvent} = this.context;

        this.requestCancellation.abort();

        let request: FilterParams;
        if (loadMoreItems) {
            if (!this.currentRequest) {
                throw new Error('Cannot request more items without initial request.');
            }
            const {limit} = this.currentRequest;
            request = {
                ...this.currentRequest,
                limit: typeof limit === 'number' ? (limit + ITEMS_PER_PAGE) : limit,
            };
        } else {
            request = createRequest(this.state.criteria);
        }

        if (!(request.text || request.elementTypeId || request.refElementId || request.refElementLinkId)) {
            this.setState({
                querying: false,
                error: undefined,
                items: undefined,
                selection: new Set<ElementIri>(),
                moreItemsAvailable: false,
            });
            return;
        }

        this.requestCancellation = new AbortController();
        const signal = this.requestCancellation.signal;
        request = {...request, signal};

        this.currentRequest = request;
        this.setState({
            querying: true,
            error: undefined,
            moreItemsAvailable: false,
        });

        model.dataProvider.filter(request).then(elements => {
            if (signal.aborted) { return; }
            this.processFilterData(elements);
            triggerWorkspaceEvent(WorkspaceEventKey.searchQueryItem);
        }).catch(error => {
            if (signal.aborted) { return; }
            // tslint:disable-next-line:no-console
            console.error(error);
            this.setState({querying: false, error});
        });
    }

    private processFilterData(elements: LinkedElement[]) {
        const requestedAdditionalItems =
            typeof this.currentRequest!.limit === 'number' &&
            this.currentRequest!.limit > ITEMS_PER_PAGE;

        const existingIris = new Set<ElementIri>();

        if (requestedAdditionalItems) {
            for (const item of this.state.items!) {
                existingIris.add(item.id);
            }
        }

        const items = requestedAdditionalItems ? [...this.state.items!] : [];
        for (const {element} of elements) {
            if (existingIris.has(element.id)) { continue; }
            items.push(element);
        }

        const moreItemsAvailable =
            typeof this.currentRequest!.limit === 'number' &&
            elements.length >= this.currentRequest!.limit;

        if (requestedAdditionalItems) {
            this.setState({querying: false, items, error: undefined, moreItemsAvailable});
        } else {
            this.setState({
                querying: false,
                resultId: this.state.resultId + 1,
                items,
                selection: new Set<ElementIri>(),
                error: undefined,
                moreItemsAvailable,
            });
        }
    }
}

export function createRequest(criteria: SearchCriteria): FilterParams {
    const {text, elementType, refElement, refElementLink, linkDirection} = criteria;
    return {
        text,
        elementTypeId: elementType ? elementType.id : undefined,
        refElementId: refElement ? refElement.iri : undefined,
        refElementLinkId: refElementLink ? refElementLink.id : undefined,
        linkDirection,
        limit: ITEMS_PER_PAGE,
    };
}
