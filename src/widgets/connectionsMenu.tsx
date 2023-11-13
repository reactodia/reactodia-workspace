import * as React from 'react';
import classnames from 'classnames';

import { Events, EventObserver, EventTrigger } from '../coreUtils/events';

import { Dictionary, ElementModel, ElementIri, LinkTypeIri } from '../data/model';
import { generate128BitID } from '../data/utils';

import { CanvasApi, CanvasContext } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';
import { changeLinkTypeVisibility } from '../diagram/commands';
import { FatLinkType, Element } from '../diagram/elements';
import { placeElementsAround } from '../diagram/layout';
import { DiagramView } from '../diagram/view';

import { requestElementData, restoreLinksBetweenElements } from '../editor/asyncModel';

import type { InstancesSearchCommands } from '../widgets/instancesSearch';
import { ProgressBar, ProgressState } from '../widgets/progressBar';

import { WorkspaceContext, WorkspaceEventKey } from '../workspace/workspaceContext';

import { highlightSubstring } from './listElementView';
import { SearchResults } from './searchResults';

export interface ConnectionsMenuProps {
    commands: Events<ConnectionsMenuCommands>;
    suggestProperties?: PropertySuggestionHandler;
    instancesSearchCommands?: EventTrigger<InstancesSearchCommands>;
}

export interface ConnectionsMenuCommands {
    show: { readonly target: Element };
}

export type PropertySuggestionHandler = (params: PropertySuggestionParams) => Promise<PropertyScore[]>;
export interface PropertySuggestionParams {
    elementId: string;
    token: string;
    properties: string[];
    lang: string;
    signal: AbortSignal | undefined;
}
export interface PropertyScore {
    propertyIri: string;
    score: number;
}

export function ConnectionsMenu(props: ConnectionsMenuProps) {
    const {commands} = props;

    const workspace = React.useContext(WorkspaceContext)!;
    const {canvas} = React.useContext(CanvasContext)!;

    React.useEffect(() => {
        const listener = new EventObserver();
        listener.listen(commands, 'show', ({target}) => {
            const {overlayController} = workspace;
            const onClose = () => overlayController.hideDialog();
            overlayController.showDialog({
                target,
                dialogType: 'connectionsMenu',
                content: (
                    <ConnectionsMenuInner {...props}
                        target={target}
                        onClose={onClose}
                        workspace={workspace}
                        canvas={canvas}
                    />
                ),
                onClose,
            });
        });
        return () => listener.stopListening();
    }, [commands]);

    return null;
}

defineCanvasWidget(ConnectionsMenu, element => ({element, attachment: 'viewport'}));

interface ConnectionsMenuInnerProps extends ConnectionsMenuProps {
    target: Element;
    onClose: () => void;
    workspace: WorkspaceContext;
    canvas: CanvasApi;
}

interface ConnectionCount { inCount: number; outCount: number; }

interface ElementOnDiagram {
    model: ElementModel;
    presentOnDiagram: boolean;
}

type SortMode = 'alphabet' | 'smart';

interface LinkDataChunk {
    /**
     * Random key to check if chunk is different from another
     * (i.e. should be re-rendered).
     */
    chunkId: string;
    link: FatLinkType;
    direction?: 'in' | 'out';
    expectedCount: number;
    pageCount: number;
}

interface ObjectsData {
    linkDataChunk: LinkDataChunk;
    objects: ElementOnDiagram[];
}

const CLASS_NAME = 'reactodia-connections-menu';
const LINK_COUNT_PER_PAGE = 100;

class ConnectionsMenuInner extends React.Component<ConnectionsMenuInnerProps> {
    declare readonly context: never;

    private readonly ALL_RELATED_ELEMENTS_LINK: FatLinkType;

    private readonly handler = new EventObserver();
    private readonly linkTypesListener = new EventObserver();
    private loadingState = ProgressState.none;

    private links: FatLinkType[] | undefined;
    private countMap: { [linkTypeId: string]: ConnectionCount } | undefined;

    private linkDataChunk: LinkDataChunk | undefined;
    private objects: ElementOnDiagram[] | undefined;

    constructor(props: ConnectionsMenuInnerProps) {
        super(props);
        const {workspace: {model}} = this.props;
        this.ALL_RELATED_ELEMENTS_LINK = new FatLinkType({
            id: 'allRelatedElements' as LinkTypeIri,
            label: [model.factory.literal('All')],
        });
    }

    private updateAll = () => this.forceUpdate();

    componentDidMount() {
        const {workspace: {view}} = this.props;
        this.handler.listen(view.events, 'changeLanguage', this.updateAll);

        this.loadLinks();
    }

    componentWillUnmount() {
        this.handler.stopListening();
        this.linkTypesListener.stopListening();
    }

    private resubscribeOnLinkTypeEvents(linkTypesOfElement: ReadonlyArray<FatLinkType>) {
        this.linkTypesListener.stopListening();
        for (const linkType of linkTypesOfElement) {
            this.linkTypesListener.listen(linkType.events, 'changeLabel', this.updateAll);
            this.linkTypesListener.listen(linkType.events, 'changeVisibility', this.updateAll);
        }
    }

    private loadLinks() {
        const {target, workspace: {model, triggerWorkspaceEvent}} = this.props;

        this.loadingState = ProgressState.loading;
        this.links = [];
        this.countMap = {};
        model.dataProvider.connectedLinkStats({elementId: target.iri})
            .then(linkTypes => {
                this.loadingState = ProgressState.completed;

                const countMap: Dictionary<ConnectionCount> = {};
                const links: FatLinkType[] = [];
                for (const {id: linkTypeId, inCount, outCount} of linkTypes) {
                    countMap[linkTypeId] = {inCount, outCount};
                    links.push(model.createLinkType(linkTypeId));
                }

                countMap[this.ALL_RELATED_ELEMENTS_LINK.id] = Object.keys(countMap)
                    .map(key => countMap[key])
                    .reduce((a, b) => {
                        return {inCount: a.inCount + b.inCount, outCount: a.outCount + b.outCount};
                    }, {inCount: 0, outCount: 0});

                this.countMap = countMap;
                this.links = links;
                this.resubscribeOnLinkTypeEvents(this.links);

                this.updateAll();

                triggerWorkspaceEvent(WorkspaceEventKey.connectionsLoadLinks);
            })
            .catch(err => {
                // tslint:disable-next-line:no-console
                console.error(err);
                this.loadingState = ProgressState.error;
                this.updateAll();
            });
        this.updateAll();
    }

    private loadObjects(linkDataChunk: LinkDataChunk) {
        const {target, workspace: {model, triggerWorkspaceEvent}} = this.props;
        const {link, direction, pageCount} = linkDataChunk;

        this.loadingState = ProgressState.loading;
        this.linkDataChunk = linkDataChunk;
        this.objects = [];

        model.dataProvider.lookup({
            refElementId: target.iri,
            refElementLinkId: link === this.ALL_RELATED_ELEMENTS_LINK ? undefined : link.id,
            linkDirection: direction,
            limit: pageCount * LINK_COUNT_PER_PAGE,
        }).then(elements => {
            this.loadingState = ProgressState.completed;
            const presentOnDiagramIris = new Set(model.elements.map(el => el.iri));
            this.objects = elements.map(linked => ({
                model: linked.element,
                presentOnDiagram: presentOnDiagramIris.has(linked.element.id),
            }));
            this.updateAll();

            triggerWorkspaceEvent(WorkspaceEventKey.connectionsLoadElements);
        }).catch(err => {
            // tslint:disable-next-line:no-console
            console.error(err);
            this.loadingState = ProgressState.error;
            this.updateAll();
        });
    }

    private addSelectedElements = (selectedObjects: ElementOnDiagram[]) => {
        const {onClose} = this.props;

        const addedElementsIris = selectedObjects.map(item => item.model.id);
        const linkType = this.linkDataChunk ? this.linkDataChunk.link : undefined;
        const hasChosenLinkType = this.linkDataChunk && linkType !== this.ALL_RELATED_ELEMENTS_LINK;

        this.onAddElements(addedElementsIris, hasChosenLinkType ? linkType : undefined);
        onClose();
    };

    private onAddElements = (elementIris: ElementIri[], linkType: FatLinkType | undefined) => {
        const {target, workspace: {model, view, triggerWorkspaceEvent}, canvas} = this.props;
        const batch = model.history.startBatch('Add connected elements');

        const elements = elementIris.map(iri => model.createElement(iri));
        view.syncUpdateAllCanvases();

        placeElementsAround({
            elements,
            model,
            sizeProvider: canvas.renderingState,
            targetElement: target,
            preferredLinksLength: 300,
        });

        if (linkType && !linkType.visible) {
            batch.history.execute(changeLinkTypeVisibility({
                linkType,
                visible: true,
                showLabel: true,
            }));
        }

        batch.history.execute(requestElementData(model, elementIris));
        batch.history.execute(restoreLinksBetweenElements(model));
        batch.store();

        triggerWorkspaceEvent(WorkspaceEventKey.editorAddElements);
    };

    private onExpandLink = (linkDataChunk: LinkDataChunk) => {
        const {workspace: {triggerWorkspaceEvent}} = this.props;
        const alreadyLoaded = (
            this.objects &&
            this.linkDataChunk &&
            this.linkDataChunk.link === linkDataChunk.link &&
            this.linkDataChunk.direction === linkDataChunk.direction
        );
        if (!alreadyLoaded) {
            this.loadObjects(linkDataChunk);
        }
        this.updateAll();

        triggerWorkspaceEvent(WorkspaceEventKey.connectionsExpandLink);
    };

    private onMoveToFilter = (linkDataChunk: LinkDataChunk) => {
        const {target, instancesSearchCommands, workspace: {model}} = this.props;
        const {link, direction} = linkDataChunk;

        if (link === this.ALL_RELATED_ELEMENTS_LINK) {
            instancesSearchCommands?.trigger('setCriteria', {
                criteria: {refElement: target},
            });
        } else {
            const selectedElement = model.getElement(target.id)!;
            instancesSearchCommands?.trigger('setCriteria', {
                criteria: {
                    refElement: selectedElement,
                    refElementLink: link,
                    linkDirection: direction,
                },
            });
        }
    };

    render() {
        const {target, suggestProperties, instancesSearchCommands, workspace: {view}} = this.props;

        const connectionsData = {
            links: this.links || [],
            countMap: this.countMap || {},
        };

        let objectsData: ObjectsData | undefined;
        if (this.linkDataChunk && this.objects) {
            objectsData = {
                linkDataChunk: this.linkDataChunk,
                objects: this.objects,
            };
        }
        
        return (
            <MenuMarkup
                target={target}
                connectionsData={connectionsData}
                objectsData={objectsData}
                state={this.loadingState}
                view={view}
                allRelatedLink={this.ALL_RELATED_ELEMENTS_LINK}
                onExpandLink={this.onExpandLink}
                onPressAddSelected={this.addSelectedElements}
                onMoveToFilter={instancesSearchCommands ? this.onMoveToFilter : undefined}
                propertySuggestionCall={suggestProperties}
            />
        );
    }
}

interface MenuMarkupProps {
    target: Element;

    connectionsData: {
        links: FatLinkType[];
        countMap: { [linkTypeId: string]: ConnectionCount };
    };

    objectsData?: ObjectsData;

    view: DiagramView;
    state: ProgressState;
    allRelatedLink: FatLinkType;

    onExpandLink: (linkDataChunk: LinkDataChunk) => void;
    onPressAddSelected: (selectedObjects: ElementOnDiagram[]) => void;
    onMoveToFilter: ((linkDataChunk: LinkDataChunk) => void) | undefined;

    propertySuggestionCall?: PropertySuggestionHandler;
}

interface MenuMarkupState {
    filterKey: string;
    panel: string;
    sortMode: SortMode;
}

class MenuMarkup extends React.Component<MenuMarkupProps, MenuMarkupState> {
    constructor(props: MenuMarkupProps) {
        super(props);
        this.state = {
            filterKey: '',
            panel: 'connections',
            sortMode: 'alphabet',
        };
    }

    private onChangeFilter = (e: React.FormEvent<HTMLInputElement>) => {
        const filterKey = e.currentTarget.value;
        this.setState({filterKey});
    };

    private getTitle() {
        if (this.props.objectsData && this.state.panel === 'objects') {
            return 'Objects';
        } else if (this.props.connectionsData && this.state.panel === 'connections') {
            return 'Connections';
        }
        return 'Error';
    }

    private onExpandLink = (linkDataChunk: LinkDataChunk) => {
        this.setState({ filterKey: '',  panel: 'objects' });
        this.props.onExpandLink(linkDataChunk);
    };

    private onCollapseLink = () => {
        this.setState({ filterKey: '',  panel: 'connections' });
    };

    private getBreadCrumbs() {
        if (this.props.objectsData && this.state.panel === 'objects') {
            const {link, direction} = this.props.objectsData.linkDataChunk;
            const localizedText = this.props.view.formatLabel(link.label, link.id);

            return <span className={`${CLASS_NAME}__breadcrumbs`}>
                <a className={`${CLASS_NAME}__breadcrumbs-link`}
                    onClick={this.onCollapseLink}>Connections</a>
                {'\u00A0' + '/' + '\u00A0'}
                {localizedText} {direction ? `(${direction})` : null}
            </span>;
        } else {
            return null;
        }
    }

    private getBody() {
        if (this.props.state === 'error') {
            return <label className={`reactodia-label ${CLASS_NAME}__error`}>Error</label>;
        } else if (this.props.objectsData && this.state.panel === 'objects') {
            return <ObjectsPanel
                data={this.props.objectsData}
                onMoveToFilter={this.props.onMoveToFilter}
                view={this.props.view}
                filterKey={this.state.filterKey}
                loading={this.props.state === ProgressState.loading}
                onPressAddSelected={this.props.onPressAddSelected}
            />;
        } else if (this.props.connectionsData && this.state.panel === 'connections') {
            if (this.props.state === ProgressState.loading) {
                return <label className={`reactodia-label ${CLASS_NAME}__loading`}>Loading...</label>;
            }

            return (
                <ConnectionsList
                    id={this.props.target.id}
                    data={this.props.connectionsData}
                    view={this.props.view}
                    filterKey={this.state.filterKey}
                    allRelatedLink={this.props.allRelatedLink}
                    onExpandLink={this.onExpandLink}
                    onMoveToFilter={this.props.onMoveToFilter}
                    propertySuggestionCall={this.props.propertySuggestionCall}
                    sortMode={this.state.sortMode}
                />
            );
        } else {
            return <div/>;
        }
    }

    private onSortChange = (e: React.FormEvent<HTMLInputElement>) => {
        const value = (e.target as HTMLInputElement).value as SortMode;

        if (this.state.sortMode === value) { return; }

        this.setState({sortMode: value});
    };

    private renderSortSwitch(id: string, labelClass: string, title: string) {
        return (
            <div>
                <input
                    type='radio'
                    name='sort'
                    id={id}
                    value={id}
                    className={`${CLASS_NAME}__sort-switch`}
                    onChange={this.onSortChange}
                    checked={this.state.sortMode === id}
                />
                <label htmlFor={id} title={title}
                    className={classnames(`${CLASS_NAME}__sort-switch-label`, labelClass)}>
                </label>
            </div>
        );
    }

    private renderSortSwitches() {
        if (this.state.panel !== 'connections' || !this.props.propertySuggestionCall) { return null; }

        return (
            <div className={`${CLASS_NAME}__sort-switches`}>
                {this.renderSortSwitch('alphabet', `${CLASS_NAME}__sort-label-alpha`, 'Sort alphabetically')}
                {this.renderSortSwitch('smart', `${CLASS_NAME}__sort-label-smart`, 'Smart sort')}
            </div>
        );
    }

    render() {
        return (
            <div className={CLASS_NAME}>
                <label className={`reactodia-label ${CLASS_NAME}__title-label`}>{this.getTitle()}</label>
                {this.getBreadCrumbs()}
                <div className={`${CLASS_NAME}__search-line`}>
                    <input
                        type='text'
                        className={`search-input reactodia-form-control ${CLASS_NAME}__search-line-input`}
                        value={this.state.filterKey}
                        onChange={this.onChangeFilter}
                        placeholder='Search for...'
                    />
                    {this.renderSortSwitches()}
                </div>
                <ProgressBar state={this.props.state} height={10} />
                {this.getBody()}
            </div>
        );
    }
}

interface ConnectionsListProps {
    id: string;
    data: {
        links: FatLinkType[];
        countMap: { [linkTypeId: string]: ConnectionCount };
    };
    view: DiagramView;
    filterKey: string;

    allRelatedLink: FatLinkType;
    onExpandLink: (linkDataChunk: LinkDataChunk) => void;
    onMoveToFilter: ((linkDataChunk: LinkDataChunk) => void) | undefined;

    propertySuggestionCall?: PropertySuggestionHandler;
    sortMode: SortMode;
}

interface ConnectionsListState {
    readonly scores: ReadonlyMap<LinkTypeIri, PropertyScore>;
}

class ConnectionsList extends React.Component<ConnectionsListProps, ConnectionsListState> {
    private suggestionCancellation = new AbortController();

    constructor(props: ConnectionsListProps) {
        super(props);
        this.state = {
            scores: new Map(),
        };
        this.tryUpdateScores();
    }

    componentDidUpdate(prevProps: ConnectionsListProps) {
        if (!(
            this.props.filterKey === prevProps.filterKey &&
            this.props.sortMode === prevProps.sortMode
        )) {
            this.tryUpdateScores();
        }
    }

    componentWillUnmount() {
        this.suggestionCancellation.abort();
    }

    private tryUpdateScores() {
        const {propertySuggestionCall, filterKey, sortMode, id, data, view} = this.props;
        if (propertySuggestionCall && (filterKey || sortMode === 'smart')) {
            const lang = view.getLanguage();
            const token = filterKey.trim();
            const properties = data.links.map(l => l.id);

            this.suggestionCancellation.abort();
            this.suggestionCancellation = new AbortController();
            const signal = this.suggestionCancellation.signal;
    
            propertySuggestionCall({elementId: id, token, properties, lang, signal})
                .then(scoreList => {
                    const scores = new Map<LinkTypeIri, PropertyScore>();
                    for (const score of scoreList) {
                        scores.set(score.propertyIri as LinkTypeIri, score);
                    }
                    this.setState({scores});
                });
        }
    }

    private isSmartMode(): boolean {
        return this.props.sortMode === 'smart' && !this.props.filterKey;
    }

    private compareLinks = (a: FatLinkType, b: FatLinkType) => {
        const {view} = this.props;
        const aText = view.formatLabel(a.label, a.id);
        const bText = view.formatLabel(b.label, b.id);
        return aText.localeCompare(bText);
    };

    private compareLinksByWeight = (a: FatLinkType, b: FatLinkType) => {
        const {view} = this.props;
        const {scores} = this.state;
        const aText = view.formatLabel(a.label, a.id);
        const bText = view.formatLabel(b.label, b.id);

        const aWeight = scores.has(a.id) ? scores.get(a.id)!.score : 0;
        const bWeight = scores.has(b.id) ? scores.get(b.id)!.score : 0;

        return (
            aWeight > bWeight ? -1 :
            aWeight < bWeight ? 1 :
            aText.localeCompare(bText)
        );
    };

    private getLinks() {
        const {view, data, filterKey} = this.props;
        return (data.links || [])
            .filter(link => {
                const text = view.formatLabel(link.label, link.id).toLowerCase();
                return !filterKey || text.indexOf(filterKey.toLowerCase()) >= 0;
            })
            .sort(this.compareLinks);
    }

    private getProbableLinks() {
        const {data} = this.props;
        const {scores} = this.state;
        const isSmartMode = this.isSmartMode();
        return (data.links ?? [])
            .filter(link => {
                return scores.has(link.id) && (scores.get(link.id)!.score > 0 || isSmartMode);
            })
            .sort(this.compareLinksByWeight);
    }

    private getViews = (links: FatLinkType[], notSure?: boolean) => {
        const {view, data} = this.props;
        const {scores} = this.state;
        const countMap = data.countMap ?? {};

        const views: JSX.Element[] = [];
        const addView = (link: FatLinkType, direction: 'in' | 'out') => {
            const count = direction === 'in'
                ? countMap[link.id].inCount
                : countMap[link.id].outCount;
            if (count === 0) {
                return;
            }
            const postfix = notSure ? '-probable' : '';
            views.push(
                <LinkInPopupMenu
                    key={`${direction}-${link.id}-${postfix}`}
                    link={link}
                    onExpandLink={this.props.onExpandLink}
                    view={view}
                    count={count}
                    direction={direction}
                    filterKey={notSure ? '' : this.props.filterKey}
                    onMoveToFilter={this.props.onMoveToFilter}
                    probability={
                        scores.has(link.id) && notSure ? scores.get(link.id)!.score : 0
                    }
                />,
            );
        };

        for (const link of links) {
            addView(link, 'in');
            addView(link, 'out');
        }

        return views;
    };

    render() {
        const {view, allRelatedLink} = this.props;
        const isSmartMode = this.isSmartMode();

        const links = isSmartMode ? [] : this.getLinks();
        const probableLinks = this.getProbableLinks().filter(link => links.indexOf(link) === -1);
        const views = this.getViews(links);
        const probableViews = this.getViews(probableLinks, true);

        let viewList: React.ReactElement<any> | React.ReactElement<any>[];
        if (views.length === 0 && probableViews.length === 0) {
            viewList = <label className={`reactodia-label ${CLASS_NAME}__empty-label`}>List empty</label>;
        } else {
            viewList = views;
            if (views.length > 1 || (isSmartMode && probableViews.length > 1)) {
                const countMap = this.props.data.countMap || {};
                const allRelatedElements = countMap[allRelatedLink.id];
                viewList = [
                    <LinkInPopupMenu
                        key={allRelatedLink.id}
                        link={allRelatedLink}
                        onExpandLink={this.props.onExpandLink}
                        view={view}
                        count={allRelatedElements.inCount + allRelatedElements.outCount}
                        onMoveToFilter={this.props.onMoveToFilter}
                    />,
                    <hr key='reactodia-hr-line' className={`${CLASS_NAME}__links-list-hr`} />,
                ].concat(viewList);
            }
        }
        let probablePart = null;
        if (probableViews.length !== 0) {
            probablePart = [
                isSmartMode ? null : (
                    <li key='probable-links'>
                        <span className='reactodia-label'>Probably, you are looking for..</span>
                    </li>
                ),
                probableViews,
            ];
        }
        return (
            <ul className={classnames(
                `${CLASS_NAME}__links-list`,
                views.length === 0 && probableViews.length === 0
                    ? `${CLASS_NAME}__links-list-empty` : undefined
            )}>
                {viewList}{probablePart}
            </ul>
        );
    }
}

interface LinkInPopupMenuProps {
    link: FatLinkType;
    count: number;
    direction?: 'in' | 'out';
    view: DiagramView;
    filterKey?: string;
    onExpandLink: (linkDataChunk: LinkDataChunk) => void;
    onMoveToFilter: ((linkDataChunk: LinkDataChunk) => void) | undefined;
    probability?: number;
}

class LinkInPopupMenu extends React.Component<LinkInPopupMenuProps> {
    constructor(props: LinkInPopupMenuProps) {
        super(props);
    }

    private onExpandLink(expectedCount: number, direction?: 'in' | 'out') {
        this.props.onExpandLink({
            chunkId: generate128BitID(),
            link: this.props.link,
            direction,
            expectedCount,
            pageCount: 1,
        });
    }

    private onMoveToFilter = (evt: React.MouseEvent<any>) => {
        evt.stopPropagation();
        const {onMoveToFilter} = this.props;
        onMoveToFilter?.({
            chunkId: generate128BitID(),
            link: this.props.link,
            direction: this.props.direction,
            expectedCount: this.props.count,
            pageCount: 1,
        });
    };

    render() {
        const {view, link, filterKey, direction, count, probability = 0} = this.props;
        const fullText = view.formatLabel(link.label, link.id);
        const probabilityPercent = Math.round(probability * 100);
        const textLine = highlightSubstring(
            fullText + (probabilityPercent > 0 ? ' (' + probabilityPercent + '%)' : ''),
            filterKey
        );
        const directionName =
            direction === 'in' ? 'source' :
            direction === 'out' ? 'target' :
            'all connected';

        return (
            <li data-linktypeid={link.id}
                className={`${CLASS_NAME}__link`}
                title={`${directionName} of "${fullText}" ${view.formatIri(link.id)}`}
                onClick={() => this.onExpandLink(count, direction)}>
                {direction === 'in' || direction === 'out' ? (
                    <div className={`${CLASS_NAME}__link-direction`}>
                        {direction === 'in' && <div className={`${CLASS_NAME}__link-direction-in`} />}
                        {direction === 'out' && <div className={`${CLASS_NAME}__link-direction-out`} />}
                    </div>
                ) : null}
                <div className={`${CLASS_NAME}__link-title`}>{textLine}</div>
                <span className={`reactodia-badge ${CLASS_NAME}__link-count`}>
                    {count <= LINK_COUNT_PER_PAGE ? count : '100+'}
                </span>
                {this.props.onMoveToFilter ? (
                    <div className={`${CLASS_NAME}__link-filter-button`}
                        onClick={this.onMoveToFilter}
                        title='Set as filter in the Instances panel'
                    />
                ) : null}
                <div className={`${CLASS_NAME}__link-navigate-button`}
                    title={`Navigate to ${directionName} "${fullText}" elements`} />
            </li>
        );
    }
}

interface ObjectsPanelProps {
    data: ObjectsData;
    loading?: boolean;
    view: DiagramView;
    filterKey?: string;
    onPressAddSelected: (selectedObjects: ElementOnDiagram[]) => void;
    onMoveToFilter: ((linkDataChunk: LinkDataChunk) => void) | undefined;
}

interface ObjectsPanelState {
    chunkId: string;
    selection: ReadonlySet<ElementIri>;
}

class ObjectsPanel extends React.Component<ObjectsPanelProps, ObjectsPanelState> {
    constructor(props: ObjectsPanelProps) {
        super(props);
        this.state = ObjectsPanel.makeStateFromProps(props);
    }

    static getDerivedStateFromProps(
        props: ObjectsPanelProps,
        state: ObjectsPanelState | undefined
    ): ObjectsPanelState | null {
        if (state && state.chunkId === props.data.linkDataChunk.chunkId) {
            return null;
        }
        return ObjectsPanel.makeStateFromProps(props);
    }

    static makeStateFromProps(props: ObjectsPanelProps): ObjectsPanelState {
        return {
            chunkId: props.data.linkDataChunk.chunkId,
            selection: new Set<ElementIri>(),
        };
    }

    private onSelectAll = () => {
        const objects = this.props.data.objects;
        if (objects.length === 0) { return; }
        const allSelected = allNonPresentedAreSelected(objects, this.state.selection);
        const newSelection = allSelected
            ? new Set<ElementIri>()
            : selectNonPresented(this.props.data.objects);
        this.updateSelection(newSelection);
    };

    private getFilteredObjects(): ElementOnDiagram[] {
        if (!this.props.filterKey) {
            return this.props.data.objects;
        }
        const filterKey = this.props.filterKey.toLowerCase();
        return this.props.data.objects.filter(element => {
            const text = this.props.view.formatLabel(
                element.model.label, element.model.id
            ).toLowerCase();
            return text && text.indexOf(filterKey) >= 0;
        });
    }

    private getItems(list: ReadonlyArray<ElementOnDiagram>) {
        const added: { [id: string]: true } = {};
        const result: ElementModel[] = [];
        for (const obj of list) {
            if (added[obj.model.id]) { continue; }
            added[obj.model.id] = true;
            result.push(obj.model);
        }
        return result;
    }

    private updateSelection = (newSelection: ReadonlySet<ElementIri>) => {
        this.setState({selection: newSelection});
    };

    private renderCounter(activeObjCount: number) {
        const countString = `${activeObjCount}\u00A0of\u00A0${this.props.data.objects.length}`;

        const wrongNodes =
            Math.min(LINK_COUNT_PER_PAGE, this.props.data.linkDataChunk.expectedCount) - this.props.data.objects.length;
        const wrongNodesString = Math.abs(wrongNodes) > LINK_COUNT_PER_PAGE ?
            `${LINK_COUNT_PER_PAGE}+` : Math.abs(wrongNodes).toString();
        const wrongNodesCount = wrongNodes === 0 ? '' : (wrongNodes < 0 ?
            `\u00A0(${wrongNodesString})` : `\u00A0(${wrongNodesString})`);
        const wrongNodesTitle = wrongNodes === 0 ? '' : (wrongNodes > 0 ? 'Unavailable nodes' : 'Extra nodes');

        return <div className={`reactodia-label ${CLASS_NAME}__objects-count`}>
            <span>{countString}</span>
            <span className={`${CLASS_NAME}__objects-extra`}
                title={wrongNodesTitle}>
                {wrongNodesCount}
            </span>
        </div>;
    }

    render() {
        const {onPressAddSelected, filterKey, onMoveToFilter} = this.props;
        const {selection} = this.state;
        const objects = this.getFilteredObjects();
        const isAllSelected = allNonPresentedAreSelected(objects, selection);

        const nonPresented = objects.filter(el => !el.presentOnDiagram);
        const active = nonPresented.filter(el => selection.has(el.model.id));

        return <div className={`${CLASS_NAME}__objects`}>
            <div className={`${CLASS_NAME}__objects-select-all`}>
                <label>
                    <input type='checkbox'
                        checked={isAllSelected && nonPresented.length > 0}
                        onChange={this.onSelectAll}
                        disabled={nonPresented.length === 0} />
                    Select All
                </label>
            </div>
            {this.props.loading ? (
                <label className={`reactodia-label ${CLASS_NAME}__objects-loading`}>Loading...</label>
            ) : objects.length === 0 ? (
                <label className={`reactodia-label ${CLASS_NAME}__objects-loading`}>No available nodes</label>
            ) : (
                <div className={`${CLASS_NAME}__objects-list`}>
                    <SearchResults
                        view={this.props.view}
                        items={this.getItems(objects)}
                        selection={this.state.selection}
                        onSelectionChanged={this.updateSelection}
                        highlightText={filterKey}
                    />
                    {this.props.data.linkDataChunk.expectedCount > LINK_COUNT_PER_PAGE ? (
                        onMoveToFilter ? (
                            <div className={`${CLASS_NAME}__move-to-filter`}
                                onClick={() => onMoveToFilter(this.props.data.linkDataChunk)}>
                                The list was truncated, for more data click here to use the filter panel
                            </div>
                        ) : (
                            <div className={`${CLASS_NAME}__move-to-filter`}>
                                The list was truncated.
                            </div>
                        )
                    ) : null}
                </div>
            )}
            <div className={`${CLASS_NAME}__objects-statusbar`}>
                {this.renderCounter(active.length)}
                <button
                    className={classnames(
                        `${CLASS_NAME}__objects-add-button`,
                        'reactodia-btn reactodia-btn-primary pull-right'
                    )}
                    disabled={this.props.loading || nonPresented.length === 0}
                    onClick={() => onPressAddSelected(active.length > 0 ? active : nonPresented)}>
                    {active.length > 0 ? 'Add selected' : 'Add all'}
                </button>
            </div>
        </div>;
    }
}

function selectNonPresented(objects: ReadonlyArray<ElementOnDiagram>) {
    const selection = new Set<ElementIri>();
    for (const object of objects) {
        if (object.presentOnDiagram) { continue; }
        selection.add(object.model.id);
    }
    return selection;
}

function allNonPresentedAreSelected(
    objects: ReadonlyArray<ElementOnDiagram>,
    selection: ReadonlySet<ElementIri>
): boolean {
    let allSelected = true;
    for (const object of objects) {
        if (object.presentOnDiagram) { continue; }
        allSelected = allSelected && selection.has(object.model.id);
    }
    return allSelected;
}
