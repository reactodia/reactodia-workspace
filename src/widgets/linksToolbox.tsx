import * as React from 'react';
import classnames from 'classnames';

import { EventObserver, EventTrigger } from '../coreUtils/events';
import { useTranslation } from '../coreUtils/i18n';
import { Debouncer } from '../coreUtils/scheduler';

import type { ElementIri, ElementModel, LinkTypeIri } from '../data/model';
import { changeLinkTypeVisibility } from '../diagram/commands';
import { Element, LinkTypeVisibility } from '../diagram/elements';

import { LinkType, iterateEntitiesOf } from '../editor/dataElements';
import { WithFetchStatus } from '../editor/withFetchStatus';

import { WorkspaceContext, useWorkspace } from '../workspace/workspaceContext';

import { InlineEntity } from './utility/inlineEntity';
import { highlightSubstring } from './utility/listElementView';
import { NoSearchResults } from './utility/noSearchResults';
import { SearchInput, SearchInputStore, useSearchInputStore } from './utility/searchInput';
import type { InstancesSearchCommands } from './instancesSearch';

/**
 * Props for {@link LinkTypesToolbox} component.
 *
 * @see {@link LinkTypesToolbox}
 */
export interface LinkTypesToolboxProps {
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Whether the component should listen to the diagram selection to
     * display links connected to the selected items first.
     *
     * @default true
     */
    trackSelected?: boolean;
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
     * @default 200
     */
    searchTimeout?: number;
    /**
     * Minimum number of characters in the search term to initiate the search.
     *
     * @default 1
     */
    minSearchTermLength?: number;
    /**
     * Event bus to send commands to {@link InstancesSearch} component.
     */
    instancesSearchCommands?: EventTrigger<InstancesSearchCommands>;
}

/**
 * Component to display incoming and outgoing link types from selected elements,
 * toggle their visibility and initiate the lookup for connected entities.
 *
 * @category Components
 */
export function LinkTypesToolbox(props: LinkTypesToolboxProps) {
    const {
        searchStore,
        searchTimeout = 200,
        minSearchTermLength = 1,
    } = props;
    const uncontrolledSearch = useSearchInputStore({
        initialValue: '',
        submitTimeout: searchTimeout,
        allowSubmit: term => term.length >= minSearchTermLength,
    });
    const effectiveSearchStore = searchStore ?? uncontrolledSearch;
    const workspace = useWorkspace();
    return (
        <LinkTypesToolboxInner {...props}
            isControlled={Boolean(searchStore)}
            searchStore={effectiveSearchStore}
            minSearchTermLength={minSearchTermLength}
            workspace={workspace}
        />
    );
}

const CLASS_NAME = 'reactodia-links-toolbox';
const DEFAULT_TRACK_SELECTED = true;

interface LinkTypesToolboxInnerProps extends LinkTypesToolboxProps {
    isControlled: boolean;
    searchStore: SearchInputStore;
    minSearchTermLength: number;
    workspace: WorkspaceContext;
}

interface State {
    readonly filteredLinks: FilteredLinkTypes;
}

interface FilteredLinkTypes {
    readonly term: string;
    readonly diagramHasLink: boolean;
    readonly selection: ReadonlyArray<ElementModel>;
    readonly selectionLinks: ReadonlySet<LinkTypeIri>;
    readonly links: ReadonlyArray<LabelledLinkType>;
}

interface LabelledLinkType {
    readonly iri: LinkTypeIri;
    readonly type: LinkType;
    readonly label: string;
}

class LinkTypesToolboxInner extends React.Component<LinkTypesToolboxInnerProps, State> {
    private readonly listener = new EventObserver();
    private readonly selectionListener = new EventObserver();
    private readonly searchListener = new EventObserver();
    private readonly linkListener = new EventObserver();

    private readonly debounceSelection = new Debouncer(50 /* ms */);
    private readonly delayedUpdateAll = new Debouncer();

    constructor(props: LinkTypesToolboxInnerProps) {
        super(props);
        this.state = {
            filteredLinks: {
                term: '',
                diagramHasLink: false,
                selection: [],
                selectionLinks: new Set(),
                links: [],
            },
        };
    }

    componentDidMount() {
        const {workspace: {model}} = this.props;
        this.listener.listen(model.events, 'loadingSuccess', this.updateOnCurrentSelection);
        this.listener.listen(model.events, 'changeLanguage', this.updateOnCurrentSelection);

        this.subscribeToSelectionChanges();
        this.listenSearch();
        this.updateOnCurrentSelection();
    }

    componentDidUpdate(
        prevProps: LinkTypesToolboxInnerProps,
        prevState: State
    ): void {
        const {trackSelected = DEFAULT_TRACK_SELECTED, searchStore} = this.props;

        if (trackSelected !== prevProps.trackSelected) {
            this.subscribeToSelectionChanges();
        }

        if (searchStore.events !== prevProps.searchStore.events) {
            this.listenSearch();
        }
        
        if (this.state.filteredLinks !== prevState.filteredLinks) {
            this.subscribeOnFilteredLinksEvents();
        }
    }

    private listenSearch() {
        const {searchStore} = this.props;
        this.searchListener.stopListening();
        this.searchListener.listen(searchStore.events, 'executeSearch', ({value}) => {
            this.setState((state, props) => applyFilter(state, value, props));
        });
        this.searchListener.listen(searchStore.events, 'clearSearch', () => {
            this.setState((state, props) => applyFilter(state, '', props));
        });
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.selectionListener.stopListening();
        this.searchListener.stopListening();
        this.linkListener.stopListening();
        this.debounceSelection.dispose();
        this.delayedUpdateAll.dispose();
    }

    subscribeToSelectionChanges() {
        const {trackSelected = DEFAULT_TRACK_SELECTED, workspace: {model}} = this.props;
        this.selectionListener.stopListening();
        if (trackSelected) {
            this.selectionListener.listen(model.events, 'changeSelection', () => {
                this.debounceSelection.call(this.updateOnCurrentSelection);
            });
        }
    }

    private updateOnCurrentSelection = () => {
        this.setState((state, props) => applyFilter(state, props.searchStore.value, props));
    };

    private subscribeOnFilteredLinksEvents() {
        const {workspace: {model}} = this.props;
        const {filteredLinks} = this.state;

        this.linkListener.stopListening();
    
        const linkTypeIris = new Set<LinkTypeIri>();
        for (const linkType of filteredLinks.links) {
            linkTypeIris.add(linkType.iri);
            this.linkListener.listen(linkType.type.events, 'changeData', this.onLinkChanged);
        }

        this.linkListener.listen(model.events, 'changeLinkVisibility', e => {
            if (linkTypeIris.has(e.source)) {
                this.onLinkChanged();
            }
        });
    }

    private onLinkChanged = () => {
        this.delayedUpdateAll.call(() => this.forceUpdate());
    };

    render() {
        const {
            className, isControlled, searchStore, minSearchTermLength, workspace,
        } = this.props;
        const {translation: t} = workspace;
        const {filteredLinks} = this.state;

        const connectedLinks = filteredLinks.links.filter(link =>
            filteredLinks.selectionLinks.has(link.iri)
        );
        const otherLinks = filteredLinks.links.filter(link =>
            !filteredLinks.selectionLinks.has(link.iri)
        );

        return (
            <div
                className={classnames(
                    CLASS_NAME,
                    isControlled ? `${CLASS_NAME}--controlled` : undefined,
                    className
                )}>
                <div className={`${CLASS_NAME}__heading`}>
                    {isControlled ? null : (
                        <SearchInput store={searchStore}
                            className={`${CLASS_NAME}__filter`}
                            inputProps={{
                                name: 'reactodia-link-types-filter',
                            }}
                        />
                    )}
                    <div className={`${CLASS_NAME}__switch-all`}>
                        <VisibilityControl
                            onSetVisibility={mode => changeLinkTypeState(filteredLinks.links, mode, workspace)}
                            disabled={filteredLinks.links.length === 0}
                        />
                        <span>&nbsp;{t.text('search_link_types.switch_all.label')}</span>
                    </div>
                </div>
                <div className={`${CLASS_NAME}__rest`}>
                    <div className='reactodia-scrollable'>
                        {connectedLinks.length > 0 ? (
                            <>
                                <div role='heading'
                                    className={`${CLASS_NAME}__links-heading`}>
                                    {filteredLinks.selection.length === 1 ? (
                                        t.template('search_link_types.heading_connected_on_single', {
                                            entity: <InlineEntity target={filteredLinks.selection[0]} />,
                                        })
                                    ) : (
                                        t.template('search_link_types.heading_connected', {
                                            count: filteredLinks.selection.length,
                                        })
                                    )}
                                </div>
                                {this.renderLinks(connectedLinks)}
                            </>
                        ) : null}
                        {connectedLinks.length > 0 && otherLinks.length > 0 ? (
                            <div role='heading'
                                className={`${CLASS_NAME}__links-heading`}>
                                {t.template('search_link_types.heading_other', {
                                    count: otherLinks.length,
                                })}
                            </div>
                        ) : null}
                        {this.renderLinks(otherLinks)}
                        {filteredLinks.links.length === 0 ? (
                            <NoSearchResults className={`${CLASS_NAME}__no-results`}
                                hasQuery={filteredLinks.term.length > 0}
                                minSearchTermLength={minSearchTermLength}
                                message={
                                    filteredLinks.diagramHasLink
                                        ? undefined
                                        : t.text('search_link_types.no_results')
                                }
                            />
                        ) : null}
                    </div>
                </div>
            </div>
        );
    }

    private renderLinks(links: ReadonlyArray<LabelledLinkType>) {
        const {instancesSearchCommands} = this.props;
        const {filteredLinks} = this.state;
        return (
            <ul className={`${CLASS_NAME}__links`}>
                {links.map(link => (
                    <LinkInToolBox key={link.iri}
                        link={link}
                        onAddToFilter={
                            instancesSearchCommands && filteredLinks.selectionLinks.has(link.iri)
                                ? this.onAddToFilter : undefined
                        }
                        filterKey={filteredLinks.term}  
                    />
                ))}
            </ul>
        );
    }

    private onAddToFilter = (linkType: LinkTypeIri) => {
        const {instancesSearchCommands} = this.props;
        const {filteredLinks} = this.state;
        if (filteredLinks.selection.length === 1) {
            instancesSearchCommands?.trigger('setCriteria', {
                criteria: {
                    refElement: filteredLinks.selection[0].id,
                    refElementLink: linkType,
                }
            });
        }
    };
}

function applyFilter(state: State, term: string, props: LinkTypesToolboxInnerProps): State {
    const {
        trackSelected = DEFAULT_TRACK_SELECTED,
        workspace: {model},
    } = props;

    const allLinkTypeIris = new Set<LinkTypeIri>();
    for (const link of model.links) {
        allLinkTypeIris.add(link.typeId);
    }

    const allLinkTypes = Array.from(allLinkTypeIris, iri => model.createLinkType(iri))
        .map((link): LabelledLinkType => ({
            iri: link.id,
            type: link,
            label: model.locale.formatLabel(link.data?.label, link.id)
        }))
        .filter(link => link.label.toLowerCase().indexOf(term.toLowerCase()) >= 0)
        .sort((a, b) => {
            return a.label.localeCompare(b.label);
        });

    const entities = new Map<ElementIri, ElementModel>();
    const selectionLinks = new Set<LinkTypeIri>();
    if (trackSelected) {
        for (const item of model.selection) {
            if (item instanceof Element) {
                for (const entity of iterateEntitiesOf(item)) {
                    entities.set(entity.id, entity);
                }
                for (const link of model.getElementLinks(item)) {
                    selectionLinks.add(link.typeId);
                }
            }
        }
    }

    const filteredLinks: FilteredLinkTypes = {
        term,
        diagramHasLink: allLinkTypeIris.size > 0,
        selection: Array.from(entities.values()),
        selectionLinks,
        links: allLinkTypes,
    };
    return {...state, filteredLinks};
}

function LinkInToolBox(props: {
    link: LabelledLinkType;
    onAddToFilter?: (type: LinkTypeIri) => void;
    filterKey?: string;
}) {
    const {link, filterKey, onAddToFilter} = props;
    const workspace = useWorkspace();
    const {model, translation: t} = workspace;
    return (
        <li data-linktypeid={link.iri}
            className={`${CLASS_NAME}__link-item`}>
            <VisibilityControl className={`${CLASS_NAME}__link-buttons`}
                visibility={model.getLinkVisibility(link.iri)}
                onSetVisibility={mode => changeLinkTypeState([link], mode, workspace)}
            />
            <WithFetchStatus type='linkType' target={link.iri}>
                <div className={`${CLASS_NAME}__link-title`}>
                    {highlightSubstring(link.label, filterKey)}
                </div>
            </WithFetchStatus>
            {onAddToFilter ? (
                <div className={`${CLASS_NAME}__filter-button`}
                    title={t.text('search_link_types.add_to_filter.title')}
                    onClick={() => onAddToFilter(link.iri)}
                />
            ) : null}
        </li>
    );
}

function VisibilityControl(props: {
    className?: string;
    visibility?: LinkTypeVisibility | undefined;
    onSetVisibility: (value: LinkTypeVisibility) => void;
    disabled?: boolean;
}) {
    const {className, visibility, onSetVisibility, disabled} = props;
    const t = useTranslation();
    return (
        <div className={classnames(className, 'reactodia-btn-group reactodia-btn-group-xs')}>
            <button title={t.text('search_link_types.switch_hidden.title')}
                className={classnames(
                    `${CLASS_NAME}__toggle-invisible`,
                    'reactodia-btn reactodia-btn-default',
                    visibility === 'hidden' ? 'active' : undefined
                )}
                disabled={disabled}
                onClick={() => onSetVisibility('hidden')}>
            </button>
            <button title={t.text('search_link_types.switch_without_label.title')}
                className={classnames(
                    `${CLASS_NAME}__toggle-lines-only`,
                    'reactodia-btn reactodia-btn-default',
                    visibility === 'withoutLabel' ? 'active' : undefined
                )}
                disabled={disabled}
                onClick={() => onSetVisibility('withoutLabel')}>
            </button>
            <button title={t.text('search_link_types.switch_visible.title')}
                className={classnames(
                    `${CLASS_NAME}__toggle-visible`,
                    'reactodia-btn reactodia-btn-default',
                    visibility === 'visible' ? 'active' : undefined
                )}
                disabled={disabled}
                onClick={() => onSetVisibility('visible')}>
            </button>
        </div>
    );
}

function changeLinkTypeState(
    linkTypes: ReadonlyArray<LabelledLinkType>,
    state: LinkTypeVisibility,
    workspace: WorkspaceContext
): void {
    const {model} = workspace;
    const batch = model.history.startBatch({titleKey: 'search_link_types.switch.command'});
    for (const linkType of linkTypes) {
        model.history.execute(changeLinkTypeVisibility(model, linkType.iri, state));
    }
    batch.store();
}
