import * as React from 'react';
import classnames from 'classnames';

import { EventObserver, Events } from '../coreUtils/events';
import { Debouncer } from '../coreUtils/scheduler';

import { ElementModel, ElementIri, ElementTypeIri, LinkTypeIri } from '../data/model';
import { DataProviderLookupParams, DataProviderLookupItem } from '../data/provider';

import type { CanvasApi } from '../diagram/canvasApi';
import { placeElementsAroundTarget } from '../diagram/commands';
import { Element, VoidElement } from '../diagram/elements';
import { Vector, boundsOf } from '../diagram/geometry';

import {
    DataGraphStructure, requestElementData, restoreLinksBetweenElements,
} from '../editor/dataDiagramModel';
import { EntityElement, EntityGroup, iterateEntitiesOf } from '../editor/dataElements';

import { WorkspaceContext, WorkspaceEventKey, useWorkspace } from '../workspace/workspaceContext';

import { InlineEntity } from './utility/inlineEntity';
import { NoSearchResults } from './utility/noSearchResults';
import { ProgressBar, ProgressState } from './utility/progressBar';
import { SearchInput, SearchInputStore, useSearchInputStore } from './utility/searchInput';
import { SearchResults } from './utility/searchResults';

const DIRECTION_IN_ICON = require('@images/direction-in.svg');
const DIRECTION_OUT_ICON = require('@images/direction-out.svg');

/**
 * Props for {@link InstancesSearch} component.
 *
 * @see {@link InstancesSearch}
 */
export interface InstancesSearchProps {
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Controlled search input state store.
     *
     * If specified, renders the component in "headless" mode
     * without a text filter input.
     */
    searchStore?: SearchInputStore;
    /**
     * Debounce timeout in milliseconds after input to perform the text search.
     *
     * If set to `explicit`, the search will require explicit `Enter` keypress or
     * submit button click to initiate.
     *
     * @default "explicit"
     */
    searchTimeout?: number | 'explicit';
    /**
     * Minimum number of characters in the search term to initiate the search.
     *
     * @default 3
     */
    minSearchTermLength?: number;
    /**
     * Handler for the search criteria changes.
     */
    onChangeCriteria?: (criteria: SearchCriteria) => void;
    /**
     * Handler to call when elements are added from the results onto the canvas.
     *
     * This handler is called only when elements are added by explicit "Add ..."
     * button press and not via drag and drop.
     */
    onAddElements?: (elements: Element[]) => void;
    /**
     * Event bus to listen commands for this component.
     */
    commands: Events<InstancesSearchCommands>;
}

/**
 * Events for {@link InstancesSearch} event bus.
 */
export interface InstancesSearchCommands {
    /**
     * Can be triggered to set filter criteria and initiate the search.
     */
    setCriteria: {
        /**
         * Filter criteria to use for the search.
         */
        readonly criteria: SearchCriteria;
    };
}

/**
 * A filter criteria for the entity lookup from a {@link DataProvider}.
 *
 * @see {@link DataProviderLookupParams}
 */
export interface SearchCriteria {
    /**
     * Filter by a text lookup.
     */
    readonly text?: string;
    /**
     * Filter by an element type.
     */
    readonly elementType?: ElementTypeIri;
    /**
     * Filter by having a connected element with specified IRI.
     */
    readonly refElement?: ElementIri;
    /**
     * Filter by connection link type.
     *
     * Only applicable when {@link refElement} is set.
     */
    readonly refElementLink?: LinkTypeIri;
    /**
     * Reference element link type direction ('in' | 'out').
     * 
     * Only when {@link refElementLink} is set.
     */
    readonly linkDirection?: 'in' | 'out';
}

/**
 * Component to search for entities by various filter criteria
 * to add them as elements to the diagram.
 *
 * @category Components
 */
export function InstancesSearch(props: InstancesSearchProps) {
    const {
        searchStore,
        searchTimeout = 'explicit',
        minSearchTermLength = 3,
    } = props;
    const uncontrolledSearch = useSearchInputStore({
        initialValue: '',
        submitTimeout: searchTimeout,
        allowSubmit: term => term.length >= minSearchTermLength,
    });
    const effectiveSearchStore = searchStore ?? uncontrolledSearch;
    const workspace = useWorkspace();
    return (
        <InstancesSearchInner {...props}
            isControlled={Boolean(searchStore)}
            searchStore={effectiveSearchStore}
            minSearchTermLength={minSearchTermLength}
            workspace={workspace}
        />
    );
}

interface InstancesSearchInnerProps extends InstancesSearchProps {
    isControlled: boolean;
    searchStore: SearchInputStore;
    minSearchTermLength: number;
    workspace: WorkspaceContext;
}

interface State {
    readonly criteria: SearchCriteria;
    readonly querying?: boolean;
    readonly resultId: number;
    readonly error?: any;
    readonly items?: ReadonlyArray<ElementModel>;
    readonly selection: ReadonlySet<ElementIri>;
    readonly moreItemsAvailable?: boolean;
}

const CLASS_NAME = 'reactodia-instances-search';

const ITEMS_PER_PAGE = 100;

class InstancesSearchInner extends React.Component<InstancesSearchInnerProps, State> {
    private readonly listener = new EventObserver();
    private readonly criteriaListener = new EventObserver();
    private readonly searchListener = new EventObserver();
    private readonly delayedUpdateAll = new Debouncer();

    private requestCancellation = new AbortController();
    private currentRequest: DataProviderLookupParams | undefined;

    constructor(props: InstancesSearchInnerProps) {
        super(props);
        this.state = {
            criteria: {},
            resultId: 0,
            selection: new Set<ElementIri>(),
        };
    }

    componentDidMount() {
        const {commands, workspace} = this.props;
        const {model, triggerWorkspaceEvent} = workspace;

        this.listener.listen(model.events, 'changeLanguage', () => this.forceUpdate());
        this.listener.listen(model.events, 'loadingStart', () => {
            // Clear results when loading a new diagram
            // (potentially with a different data provider)
            this.setState(
                {criteria: {}},
                () => this.props.searchStore.change({value: '', action: 'clear'})
            );
        });
        this.listener.listen(commands, 'setCriteria', ({criteria}) => {
            triggerWorkspaceEvent(WorkspaceEventKey.searchUpdateCriteria);
            this.setState(
                {criteria},
                () => {
                    this.props.searchStore.change({
                        value: criteria.text ?? '',
                        action: 'clear',
                    });
                    this.props.onChangeCriteria?.(this.state.criteria);
                }
            );
        });

        this.listenSearch();
        this.resubscribeToCriteria();
        this.queryItems(false);
    }

    componentDidUpdate(prevProps: InstancesSearchInnerProps, prevState: State): void {
        if (this.props.searchStore.events !== prevProps.searchStore.events) {
            this.listenSearch();
        }

        if (this.state.criteria !== prevState.criteria) {
            this.resubscribeToCriteria();
            this.queryItems(false);
        }
    }

    private listenSearch() {
        const {searchStore} = this.props;
        this.searchListener.stopListening();
        this.searchListener.listen(searchStore.events, 'executeSearch', ({value}) => {
            this.submitCriteriaUpdate(value, {triggerChange: false});
        });
        this.searchListener.listen(searchStore.events, 'clearSearch', () => {
            this.submitCriteriaUpdate('', {triggerChange: false});
        });
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.criteriaListener.stopListening();
        this.searchListener.stopListening();
        this.requestCancellation.abort();
        this.currentRequest = undefined;
    }

    private resubscribeToCriteria() {
        const {workspace: {model}} = this.props;
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
        const {
            className, isControlled, searchStore, minSearchTermLength,
            workspace: {translation: t},
        } = this.props;

        const progressState: ProgressState = (
            this.state.querying ? 'loading' :
            this.state.error ? 'error':
            this.state.items ? 'completed' :
            'none'
        );
        
        const resultItems = this.state.items ?? [];
        const actionsAreHidden = this.state.querying || this.state.selection.size === 0;

        return <div
            className={classnames(
                CLASS_NAME,
                isControlled ? `${CLASS_NAME}--controlled` : undefined,
                className
            )}>
            <div className={`${CLASS_NAME}__criteria`}>
                {this.renderCriteria()}
                {isControlled ? null : (
                    <SearchInput store={searchStore}
                        className={`${CLASS_NAME}__text-criteria`}
                        inputProps={{
                            name: 'reactodia-instances-search-text',
                        }}
                    />
                )}
            </div>
            <ProgressBar state={progressState}
                title={t.text('search_entities.query_progress.title')}
            />
            {/* specify resultId as key to reset scroll position when loaded new search results */}
            <div key={this.state.resultId}
                className={`${CLASS_NAME}__rest reactodia-scrollable`}>
                <SearchResults
                    items={resultItems}
                    highlightText={this.state.criteria.text}
                    selection={this.state.selection}
                    onSelectionChanged={this.onSelectionChanged}
                    footer={
                        resultItems.length === 0 ? (
                            <NoSearchResults hasQuery={this.state.items !== undefined}
                                minSearchTermLength={minSearchTermLength}
                            />
                        ) : null
                    }
                />
                <div className={`${CLASS_NAME}__rest-end`}>
                    <button type='button'
                        className={`${CLASS_NAME}__load-more reactodia-btn reactodia-btn-primary`}
                        disabled={this.state.querying}
                        style={{display: this.state.moreItemsAvailable ? undefined : 'none'}}
                        title={t.text('search_entities.show_more_results.title')}
                        onClick={() => this.queryItems(true)}>
                        {t.text('search_entities.show_more_results.label')}
                    </button>
                </div>
            </div>
            <div
                className={classnames(
                    `${CLASS_NAME}__actions`,
                    actionsAreHidden ? `${CLASS_NAME}__actions-hidden` : undefined
                )}
                aria-hidden={actionsAreHidden ? 'true' : undefined}>
                <button type='button'
                    className={`${CLASS_NAME}__action reactodia-btn reactodia-btn-secondary`}
                    disabled={this.state.querying || this.state.selection.size <= 1}
                    title={t.text('search_entities.add_group.title')}
                    onClick={() => this.placeSelectedItems('group')}>
                    {t.text('search_entities.add_group.label')}
                </button>
                <button type='button'
                    className={`${CLASS_NAME}__action reactodia-btn reactodia-btn-primary`}
                    disabled={this.state.querying || this.state.selection.size === 0}
                    title={t.text('search_entities.add_selected.title')}
                    onClick={() => this.placeSelectedItems('separately')}>
                    {t.text('search_entities.add_selected.label')}
                </button>
            </div>
        </div>;
    }

    private onSelectionChanged = (newSelection: ReadonlySet<ElementIri>) => {
        this.setState({selection: newSelection});
    };

    private renderCriteria(): React.ReactElement<any> {
        const {workspace: {model, translation: t}} = this.props;
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
                    {this.renderRemoveCriterionButtons(() => this.setState(
                        {
                            criteria: {...criteria, elementType: undefined},
                        },
                        () => this.props.onChangeCriteria?.(this.state.criteria)
                    ))}
                    {t.template('search_entities.criteria_has_type', {
                        entityType: (
                            <span className={`${CLASS_NAME}__criterion-class`}
                                title={criteria.elementType}>
                                {elementTypeLabel}
                            </span>
                        )
                    })}
                </div>
            );
        } else if (criteria.refElement) {
            const refElementData = findEntityData(model, criteria.refElement)
                ?? EntityElement.placeholderData(criteria.refElement);

            let linkTypeLabel: string | undefined;
            if (criteria.refElementLink) {
                const linkTypeData = model.getLinkType(criteria.refElementLink);
                linkTypeLabel = model.locale.formatLabel(linkTypeData?.data?.label, criteria.refElementLink);
            }

            const entity = <InlineEntity target={refElementData} />;
            const relationType = criteria.refElementLink ? (
                <span className={`${CLASS_NAME}__criterion-link-type`}
                    title={criteria.refElementLink}>
                    {linkTypeLabel}
                </span>
            ) : undefined;
            const sourceIcon = <img className={`${CLASS_NAME}__link-direction`} src={DIRECTION_IN_ICON} />;
            const targetIcon = <img className={`${CLASS_NAME}__link-direction`} src={DIRECTION_OUT_ICON} />;

            criterions.push(
                <div key='hasLinkedElement' className={`${CLASS_NAME}__criterion`}>
                    {this.renderRemoveCriterionButtons(() => this.setState(
                        {
                            criteria: {...criteria, refElement: undefined, refElementLink: undefined},
                        },
                        () => this.props.onChangeCriteria?.(this.state.criteria)
                    ))}
                    {!criteria.refElementLink ? (
                        t.template('search_entities.criteria_connected', {
                            entity, relationType, sourceIcon, targetIcon,
                        })
                    ) : criteria.linkDirection === 'in' ? (
                        t.template('search_entities.criteria_connected_to_source', {
                            entity, relationType, sourceIcon, targetIcon,
                        })
                    ) : criteria.linkDirection == 'out' ? (
                        t.template('search_entities.criteria_connected_to_target', {
                            entity, relationType, sourceIcon, targetIcon,
                        })
                    ) : (
                        t.template('search_entities.criteria_connected_via', {
                            entity, relationType, sourceIcon, targetIcon,
                        })
                    )}
                </div>
            );
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

    private submitCriteriaUpdate(term: string, options: { triggerChange: boolean }): void {
        const {onChangeCriteria} = this.props;
        this.setState(
            (state) => {
                const text = term === '' ? undefined : term;
                return {
                    criteria: {...state.criteria, text},
                };
            },
            options.triggerChange
                ? () => onChangeCriteria?.(this.state.criteria)
                : undefined
        );
    }

    private queryItems(loadMoreItems: boolean) {
        const {workspace: {model, triggerWorkspaceEvent}} = this.props;

        this.requestCancellation.abort();

        let request: DataProviderLookupParams;
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

    private processFilterData(elements: readonly DataProviderLookupItem[]) {
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

    private placeSelectedItems(mode: 'separately' | 'group'): void {
        const {onAddElements, workspace: {model, view}} = this.props;
        const canvas = view.findAnyCanvas();
        const {items, selection} = this.state;

        if (!canvas || selection.size === 0) {
            return;
        }

        const batch = model.history.startBatch({titleKey: 'search_entities.place_elements.command'});
        const selectedEntities = items
            ? items.filter(item => selection.has(item.id))
            : Array.from(selection, EntityElement.placeholderData);

        let elements: Element[];
        if (mode === 'separately') {
            const target = new VoidElement({
                position: getViewportPlacementPosition(canvas, 0.3, 0.5),
            });

            elements = selectedEntities.map(entity => model.createElement(entity));
            canvas.renderingState.syncUpdate();

            batch.history.execute(placeElementsAroundTarget({
                target,
                elements,
                graph: model,
                sizeProvider: canvas.renderingState,
                distance: 150,
            }));
        } else {
            const group = new EntityGroup({
                items: selectedEntities.map(data => ({data})),
                position: getViewportPlacementPosition(canvas, 0.5, 0.5),
            });

            elements = [group];
            model.addElement(group);
            canvas.renderingState.syncUpdate();

            const {x, y, width, height} = boundsOf(group, canvas.renderingState);
            group.setPosition({
                x: x - width / 2,
                y: y - height / 2,
            });
        }

        const addedElements = Array.from(selection);
        batch.history.execute(requestElementData(model, addedElements));
        batch.history.execute(restoreLinksBetweenElements(model, {addedElements}));

        batch.store();

        onAddElements?.(elements);
    }
}

function findEntityData(graph: DataGraphStructure, iri: ElementIri): ElementModel | undefined {
    for (const element of graph.elements) {
        for (const entity of iterateEntitiesOf(element)) {
            if (entity.id === iri) {
                return entity;
            }
        }
    }
    return undefined;
}

export function createRequest(criteria: SearchCriteria): DataProviderLookupParams {
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

function getViewportPlacementPosition(canvas: CanvasApi, fractionX: number, fractionY: number): Vector {
    const viewport = canvas.metrics.area;
    return canvas.metrics.clientToPaperCoords(
        viewport.clientWidth * fractionX,
        viewport.clientHeight * fractionY
    );
}
