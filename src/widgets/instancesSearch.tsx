import * as React from 'react';
import classnames from 'classnames';

import { EventObserver, Events } from '../coreUtils/events';
import { Debouncer } from '../coreUtils/scheduler';

import { ElementModel, ElementIri, ElementTypeIri, LinkTypeIri, LinkedElement } from '../data/model';
import { LookupParams } from '../data/provider';

import { WorkspaceContext, WorkspaceEventKey } from '../workspace/workspaceContext';

import { ProgressBar, ProgressState } from './progressBar';
import { SearchResults } from './searchResults';
import { EntityElement } from '../workspace';

const DIRECTION_IN_ICON = require('@images/direction-in.svg');
const DIRECTION_OUT_ICON = require('@images/direction-out.svg');

export interface InstancesSearchProps {
    className?: string;
    commands: Events<InstancesSearchCommands>;
}

export interface InstancesSearchCommands {
    setCriteria: { readonly criteria: SearchCriteria };
}

export interface SearchCriteria {
    readonly text?: string;
    readonly elementType?: ElementTypeIri;
    readonly refElement?: ElementIri;
    readonly refElementLink?: LinkTypeIri;
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

const CLASS_NAME = 'reactodia-instances-search';

const ITEMS_PER_PAGE = 100;

export class InstancesSearch extends React.Component<InstancesSearchProps, State> {
    static contextType = WorkspaceContext;
    declare readonly context: WorkspaceContext;

    private readonly listener = new EventObserver();
    private readonly criteriaListener = new EventObserver();
    private readonly delayedUpdateAll = new Debouncer();

    private requestCancellation = new AbortController();
    private currentRequest: LookupParams | undefined;

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
        const {model, triggerWorkspaceEvent} = this.context;

        this.listener.listen(model.events, 'changeLanguage', () => this.forceUpdate());
        this.listener.listen(model.events, 'loadingStart', () => {
            // Clear results when loading a new diagram
            // (potentially with a different data provider)
            this.setState({criteria: {}, inputText: undefined});
        });
        this.listener.listen(commands, 'setCriteria', ({criteria}) => {
            triggerWorkspaceEvent(WorkspaceEventKey.searchUpdateCriteria);
            this.setState({criteria, inputText: undefined});
        });

        this.resubscribeToCriteria();
        this.queryItems(false);
    }

    componentDidUpdate(prevProps: InstancesSearchProps, prevState: State): void {
        if (this.state.criteria !== prevState.criteria) {
            this.resubscribeToCriteria();
            this.queryItems(false);
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.criteriaListener.stopListening();
        this.requestCancellation.abort();
        this.currentRequest = undefined;
    }

    private resubscribeToCriteria() {
        const {model} = this.context;
        const {criteria} = this.state;
        this.criteriaListener.stopListening();

        if (criteria.elementType) {
            const elementType = model.createElementType(criteria.elementType);
            if (elementType) {
                this.criteriaListener.listen(elementType.events, 'changeData', this.scheduleUpdateAll);
            }
        }

        if (criteria.refElement) {
            const element = model.elements.find((element): element is EntityElement =>
                element instanceof EntityElement && element.iri === criteria.refElement
            );
            if (element) {
                this.criteriaListener.listen(element.events, 'changeData', this.scheduleUpdateAll);
            }
        }

        if (criteria.refElementLink) {
            const linkType = model.createLinkType(criteria.refElementLink);
            if (linkType) {
                this.criteriaListener.listen(linkType.events, 'changeData', this.scheduleUpdateAll);
            }
        }
    }

    private scheduleUpdateAll = () => {
        this.delayedUpdateAll.call(this.updateAll);
    };

    private updateAll = () => this.forceUpdate();

    render() {
        const ENTER_KEY_CODE = 13;

        const className = `${CLASS_NAME} ${this.props.className || ''}`;
        const progressState: ProgressState = (
            this.state.querying ? 'loading' :
            this.state.error ? 'error':
            this.state.items ? 'completed' :
            'none'
        );

        const searchTerm = this.state.inputText === undefined
            ? this.state.criteria.text : this.state.inputText;

        return <div className={className}>
            <ProgressBar state={progressState}
                title='Querying for elements'
            />
            <div className={`${CLASS_NAME}__criteria`}>
                {this.renderCriteria()}
                <div className={`${CLASS_NAME}__text-criteria reactodia-input-group`}>
                    <input type='text'
                        className='reactodia-form-control'
                        placeholder='Search for...'
                        name='reactodia-instances-search-text'
                        value={searchTerm || ''}
                        onChange={e => this.setState({inputText: e.currentTarget.value})}
                        onKeyUp={e => {
                            if (e.keyCode === ENTER_KEY_CODE) {
                                this.submitCriteriaUpdate();
                            }
                        }} />
                    <span className='reactodia-input-group-btn'>
                        <button type='button' title='Search'
                            className={classnames(
                                `${CLASS_NAME}__search-button`,
                                'reactodia-btn reactodia-btn-default'
                            )}
                            onClick={() => this.submitCriteriaUpdate()}>
                        </button>
                    </span>
                </div>
            </div>
            {/* specify resultId as key to reset scroll position when loaded new search results */}
            <div className={`${CLASS_NAME}__rest reactodia-scrollable`} key={this.state.resultId}>
                <SearchResults
                    items={this.state.items ?? []}
                    highlightText={this.state.criteria.text}
                    selection={this.state.selection}
                    onSelectionChanged={this.onSelectionChanged}
                />
                <div className={`${CLASS_NAME}__rest-end`}>
                    <button type='button'
                        className={`${CLASS_NAME}__load-more reactodia-btn reactodia-btn-primary`}
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
    };

    private renderCriteria(): React.ReactElement<any> {
        const {model} = this.context;
        const {criteria} = this.state;
        const criterions: React.ReactElement<any>[] = [];

        if (criteria.elementType) {
            const elementTypeInfo = model.getElementType(criteria.elementType);
            const elementTypeLabel = model.locale.formatLabel(
                elementTypeInfo?.data?.label,
                criteria.elementType
            );
            criterions.push(
                <div key='hasType' className={`${CLASS_NAME}__criterion`}>
                    {this.renderRemoveCriterionButtons(() => this.setState({
                        criteria: {...criteria, elementType: undefined},
                    }))}
                    Has type <span className={`${CLASS_NAME}__criterion-class`}
                        title={criteria.elementType}>{elementTypeLabel}</span>
                </div>
            );
        } else if (criteria.refElement) {
            const element = model.elements.find((element): element is EntityElement =>
                element instanceof EntityElement && element.iri === criteria.refElement
            );
            const elementLabel = model.locale.formatLabel(element?.data.label, criteria.refElement);

            let linkTypeLabel: string | undefined;
            if (criteria.refElementLink) {
                const linkTypeData = model.getLinkType(criteria.refElementLink);
                linkTypeLabel = model.locale.formatLabel(linkTypeData?.data?.label, criteria.refElementLink);
            }

            criterions.push(<div key='hasLinkedElement' className={`${CLASS_NAME}__criterion`}>
                {this.renderRemoveCriterionButtons(() => this.setState({
                    criteria: {...criteria, refElement: undefined, refElementLink: undefined},
                }))}
                Connected to <span className={`${CLASS_NAME}__criterion-element`}
                    title={criteria.refElement}>{elementLabel}</span>
                {criteria.refElementLink && <span>
                    {' through '}
                    <span className={`${CLASS_NAME}__criterion-link-type`}
                        title={criteria.refElementLink}>{linkTypeLabel}</span>
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
        return <div className={`${CLASS_NAME}__criterion-remove reactodia-btn-group reactodia-btn-group-xs`}>
            <button type='button' title='Remove criteria'
                className={classnames(
                    `${CLASS_NAME}__criterion-remove-button`,
                    'reactodia-btn reactodia-btn-default'
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

        let request: LookupParams;
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

        model.dataProvider.lookup(request).then(elements => {
            if (signal.aborted) { return; }
            this.processFilterData(elements);
            triggerWorkspaceEvent(WorkspaceEventKey.searchQueryItem);
        }).catch(error => {
            if (signal.aborted) { return; }
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

export function createRequest(criteria: SearchCriteria): LookupParams {
    const {text, elementType, refElement, refElementLink, linkDirection} = criteria;
    return {
        text,
        elementTypeId: elementType,
        refElementId: refElement,
        refElementLinkId: refElementLink,
        linkDirection,
        limit: ITEMS_PER_PAGE,
    };
}
