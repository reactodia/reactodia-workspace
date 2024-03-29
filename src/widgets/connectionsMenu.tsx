import * as React from 'react';
import classnames from 'classnames';

import { Events, EventObserver, EventTrigger } from '../coreUtils/events';

import { ElementModel, ElementIri, LinkTypeIri } from '../data/model';
import { generate128BitID } from '../data/utils';

import { CanvasApi, useCanvas } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';
import { changeLinkTypeVisibility } from '../diagram/commands';
import { LinkType, Element } from '../diagram/elements';
import { getContentFittingBox } from '../diagram/geometry';
import { placeElementsAround } from '../diagram/layout';
import { DiagramModel } from '../diagram/model';

import { requestElementData, restoreLinksBetweenElements } from '../editor/asyncModel';
import { WithFetchStatus } from '../editor/withFetchStatus';

import type { InstancesSearchCommands } from '../widgets/instancesSearch';
import { ProgressBar, ProgressState } from '../widgets/progressBar';

import { type WorkspaceContext, WorkspaceEventKey, useWorkspace } from '../workspace/workspaceContext';

import { highlightSubstring } from './listElementView';
import { SearchResults } from './searchResults';

export interface ConnectionsMenuProps {
    commands: Events<ConnectionsMenuCommands>;
    openAllByDefault?: boolean;
    suggestProperties?: PropertySuggestionHandler;
    instancesSearchCommands?: EventTrigger<InstancesSearchCommands>;
}

export interface ConnectionsMenuCommands {
    show: {
        readonly targets: ReadonlyArray<Element>;
        readonly openAll?: boolean;
    };
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

    const workspace = useWorkspace();
    const {canvas} = useCanvas();

    React.useEffect(() => {
        const listener = new EventObserver();
        listener.listen(commands, 'show', ({targets}) => {
            if (targets.length === 0) {
                return;
            }
            const {model, overlay} = workspace;

            const virtualTarget = targets.length > 1
                ? new VirtualTarget(targets, model, canvas)
                : undefined;
            const placeTarget = virtualTarget ? virtualTarget.target : targets[0];
            const onClose = () => {
                virtualTarget?.remove();
                overlay.hideDialog();
            };

            overlay.showDialog({
                target: placeTarget,
                dialogType: 'connectionsMenu',
                content: (
                    <ConnectionsMenuInner {...props}
                        placeTarget={placeTarget}
                        targets={targets}
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

class VirtualTarget {
    private readonly model: DiagramModel;

    readonly target: Element;

    constructor(
        elements: ReadonlyArray<Element>,
        model: DiagramModel,
        canvas: CanvasApi
    ) {
        this.model = model;
        const target = new Element({
            data: Element.placeholderData('' as ElementIri),
            temporary: true,
        });
        this.target = target;

        const elementSet = new Set(elements);
        const updateTargetPosition = () => {
            const {x, y, width, height} = getContentFittingBox(elements, [], canvas.renderingState);
            target.setPosition({
                x: x + width,
                y: y + height / 2,
            });
        };
        updateTargetPosition();

        const batch = model.history.startBatch();
        model.addElement(target);
        batch.discard();
    
        const listener = new EventObserver();
        listener.listen(model.events, 'changeCells', e => {
            if (e.changedElement === target || e.updateAll) {
                if (!model.elements.includes(target)) {
                    listener.stopListening();
                }
            }
        });
        listener.listen(model.events, 'elementEvent', ({data}) => {
            if (data.changePosition && elementSet.has(data.changePosition.source)) {
                updateTargetPosition();
            }
        });
        listener.listen(canvas.renderingState.events, 'changeElementSize', e => {
            if (elementSet.has(e.source)) {
                updateTargetPosition();
            }
        });
    }

    remove(): void {
        if (this.model.getElement(this.target.id)) {
            const batch = this.model.history.startBatch();
            this.model.removeElement(this.target.id);
            batch.discard();
        }
    }
}

interface ConnectionsMenuInnerProps extends ConnectionsMenuProps {
    placeTarget: Element;
    targets: ReadonlyArray<Element>;
    onClose: () => void;
    workspace: WorkspaceContext;
    canvas: CanvasApi;
}

interface MenuState {
    readonly loadingState: ProgressState;
    readonly connections?: ConnectionsData;
    readonly objects?: ObjectsData;
    readonly filterKey: string;
    readonly panel: 'connections' | 'objects';
    readonly sortMode: SortMode;
}

type SortMode = 'alphabet' | 'smart';

interface ConnectionsData {
    readonly links: ReadonlyArray<LinkType>;
    readonly counts: ReadonlyMap<LinkTypeIri, ConnectionCount>;
}

interface ConnectionCount {
    readonly inexact: boolean;
    readonly inCount: number;
    readonly outCount: number;
}

interface ObjectsData {
    readonly chunk: LinkDataChunk;
    readonly elements: ReadonlyArray<ElementOnDiagram>;
}

interface LinkDataChunk {
    /**
     * Random key to check if chunk is different from another
     * (i.e. should be re-rendered).
     */
    readonly chunkId: string;
    readonly link: LinkType;
    readonly direction?: 'in' | 'out';
    readonly expectedCount: number | 'some';
    readonly pageCount: number;
}

interface ElementOnDiagram {
    readonly model: ElementModel;
    readonly presentOnDiagram: boolean;
}

const CLASS_NAME = 'reactodia-connections-menu';
const LINK_COUNT_PER_PAGE = 100;

class ConnectionsMenuInner extends React.Component<ConnectionsMenuInnerProps, MenuState> {
    private readonly ALL_RELATED_ELEMENTS_LINK: LinkType;

    private readonly handler = new EventObserver();
    private readonly linkTypesListener = new EventObserver();

    constructor(props: ConnectionsMenuInnerProps) {
        super(props);
        const {workspace: {model}} = this.props;
        this.ALL_RELATED_ELEMENTS_LINK = new LinkType({
            id: 'urn:reactodia:allLinks' as LinkTypeIri,
            label: [model.factory.literal('All')],
        });
        this.state = {
            loadingState: 'none',
            filterKey: '',
            panel: 'connections',
            sortMode: 'alphabet',
        };
    }

    private updateAll = () => this.forceUpdate();

    componentDidMount() {
        const {workspace: {model}} = this.props;
        this.handler.listen(model.events, 'changeLanguage', this.updateAll);

        this.loadLinks();
    }

    componentWillUnmount() {
        this.handler.stopListening();
        this.linkTypesListener.stopListening();
    }

    private async loadLinks() {
        const {targets, workspace: {model, triggerWorkspaceEvent}} = this.props;

        this.setState({
            loadingState: 'loading',
            connections: {
                links: [],
                counts: new Map(),
            },
        });

        const requestInexact = targets.length > 1;
        const counts = new Map<LinkTypeIri, ConnectionCount>();
        try {
            await Promise.all(targets.map(target =>
                model.dataProvider
                    .connectedLinkStats({elementId: target.iri, inexactCount: requestInexact})
                    .then(linkTypes => {
                        for (const {id: linkTypeId, inCount, outCount, inexact} of linkTypes) {
                            const previous: ConnectionCount = counts.get(linkTypeId)
                                ?? {inCount: 0, outCount: 0, inexact: false};
                            counts.set(linkTypeId, {
                                inexact: Boolean(requestInexact || previous.inexact || inexact),
                                inCount: previous.inCount + inCount,
                                outCount: previous.outCount + outCount,
                            });
                        }
                    })
            ));
        } catch (err) {
            console.error(err);
            this.setState({loadingState: 'error'});
            return;
        }

        const links = Array.from(
            counts.keys(),
            linkTypeId => model.createLinkType(linkTypeId)
        );
        counts.set(
            this.ALL_RELATED_ELEMENTS_LINK.id,
            Array.from(counts.values())
                .reduce<ConnectionCount>(
                    (a, b) => ({
                        inexact: Boolean(a.inexact || b.inexact),
                        inCount: a.inCount + b.inCount,
                        outCount: a.outCount + b.outCount,
                    }),
                    {inCount: 0, outCount: 0, inexact: false}
                )
        );

        this.setState({
            loadingState: 'completed',
            connections: {links, counts},
        }, () => {
            this.resubscribeOnLinkTypeEvents();
            triggerWorkspaceEvent(WorkspaceEventKey.connectionsLoadLinks);
        });
    }

    private resubscribeOnLinkTypeEvents() {
        const {connections} = this.state;
        this.linkTypesListener.stopListening();
        if (connections) {
            for (const linkType of connections.links) {
                this.linkTypesListener.listen(linkType.events, 'changeLabel', this.updateAll);
                this.linkTypesListener.listen(linkType.events, 'changeVisibility', this.updateAll);
            }
        }
    }

    private async loadObjects(chunk: LinkDataChunk) {
        const {targets, workspace: {model, triggerWorkspaceEvent}} = this.props;
        const {link, direction, pageCount} = chunk;

        this.setState({
            loadingState: 'loading',
            objects: {chunk, elements: []},
        });

        const loadedElements = new Map<ElementIri, ElementModel>();
        try {
            await Promise.all(targets.map(target =>
                model.dataProvider.lookup({
                    refElementId: target.iri,
                    refElementLinkId: link === this.ALL_RELATED_ELEMENTS_LINK ? undefined : link.id,
                    linkDirection: direction,
                    limit: pageCount * LINK_COUNT_PER_PAGE,
                }).then(linkedElements => {
                    for (const {element} of linkedElements) {
                        loadedElements.set(element.id, element);
                    }
                })
            ));
        } catch (err) {
            console.error(err);
            this.setState({loadingState: 'error'});
            return;
        }

        const presentOnDiagramIris = new Set(model.elements.map(el => el.iri));
        const elements = Array.from(loadedElements.values(), element => ({
            model: element,
            presentOnDiagram: presentOnDiagramIris.has(element.id),
        }));

        this.setState({
            loadingState: 'completed',
            objects: {chunk, elements},
        }, () => {
            triggerWorkspaceEvent(WorkspaceEventKey.connectionsLoadElements);
        });
    }

    render() {
        const {loadingState, filterKey} = this.state;
        return (
            <div className={CLASS_NAME}>
                <span id='reactodia-dialog-caption'
                    className={`reactodia-label ${CLASS_NAME}__title-label`}>
                    {this.getTitle()}
                </span>
                {this.getBreadCrumbs()}
                <div className={`${CLASS_NAME}__search-line`}>
                    <input type='text'
                        className={`search-input reactodia-form-control ${CLASS_NAME}__search-line-input`}
                        name='reactodia-connection-menu-filter'
                        value={filterKey}
                        onChange={this.onChangeFilter}
                        placeholder='Search for...'
                    />
                    {this.renderSortSwitches()}
                </div>
                <ProgressBar state={loadingState}
                    title='Loading element connections'
                    height={10}
                />
                {this.getBody()}
            </div>
        );
    }

    private onChangeFilter = (e: React.FormEvent<HTMLInputElement>) => {
        const filterKey = e.currentTarget.value;
        this.setState({filterKey});
    };

    private getTitle() {
        const {connections, objects, panel} = this.state;
        if (objects && panel === 'objects') {
            return 'Objects';
        } else if (connections && panel === 'connections') {
            return 'Connections';
        }
        return 'Error';
    }

    private getBreadCrumbs() {
        const {workspace: {model}} = this.props;
        const {objects, panel} = this.state;
        if (objects && panel === 'objects') {
            const {link, direction} = objects.chunk;
            const localizedText = model.locale.formatLabel(link.label, link.id);

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

    private onExpandLink = (chunk: LinkDataChunk) => {
        const {workspace: {triggerWorkspaceEvent}} = this.props;
        const {objects} = this.state;

        this.setState({filterKey: '',  panel: 'objects'});
        const alreadyLoaded = (
            objects &&
            objects.chunk.link === chunk.link &&
            objects.chunk.direction === chunk.direction
        );
        if (!alreadyLoaded) {
            this.loadObjects(chunk);
        }

        triggerWorkspaceEvent(WorkspaceEventKey.connectionsExpandLink);
    };

    private onCollapseLink = () => {
        this.setState({filterKey: '',  panel: 'connections'});
    };

    private getBody() {
        const {
            targets, suggestProperties,instancesSearchCommands, workspace: {model},
        } = this.props;
        const {loadingState, objects, connections, filterKey, panel, sortMode} = this.state;

        if (loadingState === 'error') {
            return <label className={`reactodia-label ${CLASS_NAME}__error`}>Error</label>;
        } else if (objects && panel === 'objects') {
            return (
                <ObjectsPanel
                    data={objects}
                    onMoveToFilter={this.onMoveToFilter}
                    model={model}
                    filterKey={filterKey}
                    loading={loadingState === 'loading'}
                    onPressAddSelected={this.onAddSelectedElements}
                />
            );
        } else if (connections && panel === 'connections') {
            if (loadingState === 'loading') {
                return <label className={`reactodia-label ${CLASS_NAME}__loading`}>Loading...</label>;
            }
            return (
                <ConnectionsList
                    targets={targets}
                    data={connections}
                    model={model}
                    filterKey={filterKey}
                    allRelatedLink={this.ALL_RELATED_ELEMENTS_LINK}
                    onExpandLink={this.onExpandLink}
                    onMoveToFilter={
                        instancesSearchCommands && targets.length === 1
                            ? this.onMoveToFilter
                            : undefined
                    }
                    propertySuggestionCall={suggestProperties}
                    sortMode={sortMode}
                />
            );
        } else {
            return <div/>;
        }
    }

    private onAddSelectedElements = (selectedObjects: ElementOnDiagram[]) => {
        const {onClose} = this.props;
        const {objects} = this.state;

        const addedElementsIris = selectedObjects.map(item => item.model.id);
        const linkType = objects ? objects.chunk.link : undefined;
        const hasChosenLinkType = objects && linkType !== this.ALL_RELATED_ELEMENTS_LINK;

        this.placeElements(addedElementsIris, hasChosenLinkType ? linkType : undefined);
        onClose();
    };

    private placeElements(elementIris: ElementIri[], linkType: LinkType | undefined) {
        const {placeTarget, workspace: {model, triggerWorkspaceEvent}, canvas} = this.props;
        const batch = model.history.startBatch('Add connected elements');

        const elements = elementIris.map(iri => model.createElement(iri));
        canvas.renderingState.syncUpdate();

        placeElementsAround({
            elements,
            model,
            sizeProvider: canvas.renderingState,
            targetElement: placeTarget,
            preferredLinksLength: 300,
        });

        if (linkType && linkType.visibility === 'hidden') {
            batch.history.execute(changeLinkTypeVisibility(linkType, 'visible'));
        }

        batch.history.execute(requestElementData(model, elementIris));
        batch.history.execute(restoreLinksBetweenElements(model));
        batch.store();

        triggerWorkspaceEvent(WorkspaceEventKey.editorAddElements);
    }

    private onMoveToFilter = (linkDataChunk: LinkDataChunk) => {
        const {targets, instancesSearchCommands, workspace: {model}} = this.props;
        const {link, direction} = linkDataChunk;

        const singleTarget = targets.length === 1 ? targets[0] : undefined;
        if (!singleTarget) {
            return;
        }
        
        if (link === this.ALL_RELATED_ELEMENTS_LINK) {
            instancesSearchCommands?.trigger('setCriteria', {
                criteria: {refElement: singleTarget},
            });
        } else {
            const selectedElement = model.getElement(singleTarget.id)!;
            instancesSearchCommands?.trigger('setCriteria', {
                criteria: {
                    refElement: selectedElement,
                    refElementLink: link,
                    linkDirection: direction,
                },
            });
        }
    };

    private renderSortSwitches() {
        const {suggestProperties} = this.props;
        const {panel} = this.state;
        if (!(panel === 'connections' && suggestProperties)) {
            return null;
        }
        return (
            <div className={`${CLASS_NAME}__sort-switches`}>
                {this.renderSortSwitch('alphabet', `${CLASS_NAME}__sort-label-alpha`, 'Sort alphabetically')}
                {this.renderSortSwitch('smart', `${CLASS_NAME}__sort-label-smart`, 'Smart sort')}
            </div>
        );
    }

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

    private onSortChange = (e: React.FormEvent<HTMLInputElement>) => {
        const value = (e.target as HTMLInputElement).value as SortMode;

        if (this.state.sortMode === value) { return; }

        this.setState({sortMode: value});
    };
}

interface ConnectionsListProps {
    targets: ReadonlyArray<Element>;
    data: ConnectionsData;
    model: DiagramModel;
    filterKey: string;

    allRelatedLink: LinkType;
    onExpandLink: (chunk: LinkDataChunk) => void;
    onMoveToFilter: ((chunk: LinkDataChunk) => void) | undefined;

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
        const {propertySuggestionCall, filterKey, sortMode, targets, data, model} = this.props;
        if (
            propertySuggestionCall &&
            (filterKey || sortMode === 'smart') &&
            targets.length === 1
        ) {
            const singleTarget = targets[0];
            const lang = model.language;
            const token = filterKey.trim();
            const properties = data.links.map(l => l.id);

            this.suggestionCancellation.abort();
            this.suggestionCancellation = new AbortController();
            const signal = this.suggestionCancellation.signal;
    
            propertySuggestionCall({elementId: singleTarget.id, token, properties, lang, signal})
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

    private compareLinks = (a: LinkType, b: LinkType) => {
        const {model} = this.props;
        const aText = model.locale.formatLabel(a.label, a.id);
        const bText = model.locale.formatLabel(b.label, b.id);
        return aText.localeCompare(bText);
    };

    private compareLinksByWeight = (a: LinkType, b: LinkType) => {
        const {model} = this.props;
        const {scores} = this.state;
        const aText = model.locale.formatLabel(a.label, a.id);
        const bText = model.locale.formatLabel(b.label, b.id);

        const aWeight = scores.has(a.id) ? scores.get(a.id)!.score : 0;
        const bWeight = scores.has(b.id) ? scores.get(b.id)!.score : 0;

        return (
            aWeight > bWeight ? -1 :
            aWeight < bWeight ? 1 :
            aText.localeCompare(bText)
        );
    };

    private getLinks() {
        const {model, data, filterKey} = this.props;
        return (data.links || [])
            .filter(link => {
                const text = model.locale.formatLabel(link.label, link.id).toLowerCase();
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

    private getViews = (links: LinkType[], notSure?: boolean) => {
        const {model, data} = this.props;
        const {scores} = this.state;

        const views: JSX.Element[] = [];
        const addView = (link: LinkType, direction: 'in' | 'out') => {
            const {inCount, outCount, inexact} = data.counts.get(link.id) ?? {
                inCount: 0,
                outCount: 0,
                inexact: false,
            };
            const count = direction === 'in' ? inCount : outCount;
            if (count === 0) {
                return;
            }

            const postfix = notSure ? '-probable' : '';
            views.push(
                <LinkInPopupMenu
                    key={`${direction}-${link.id}-${postfix}`}
                    link={link}
                    onExpandLink={this.props.onExpandLink}
                    model={model}
                    count={inexact && count > 0 ? 'some' : count}
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
        const {model, allRelatedLink} = this.props;
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
                const countMap = this.props.data.counts;
                const {inCount, outCount, inexact} = countMap.get(allRelatedLink.id)!;
                const totalCount = inCount + outCount;
                viewList = [
                    <LinkInPopupMenu
                        key={allRelatedLink.id}
                        link={allRelatedLink}
                        onExpandLink={this.props.onExpandLink}
                        model={model}
                        count={inexact && totalCount > 0 ? 'some' : totalCount}
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
    link: LinkType;
    count: number | 'some';
    direction?: 'in' | 'out';
    model: DiagramModel;
    filterKey?: string;
    onExpandLink: (linkDataChunk: LinkDataChunk) => void;
    onMoveToFilter: ((linkDataChunk: LinkDataChunk) => void) | undefined;
    probability?: number;
}

class LinkInPopupMenu extends React.Component<LinkInPopupMenuProps> {
    render() {
        const {model, link, filterKey, direction, count, probability = 0} = this.props;
        const fullText = model.locale.formatLabel(link.label, link.id);
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
                title={`${directionName} of "${fullText}" ${model.locale.formatIri(link.id)}`}
                onClick={() => this.onExpandLink()}>
                {direction === 'in' || direction === 'out' ? (
                    <div className={`${CLASS_NAME}__link-direction`}>
                        {direction === 'in' && <div className={`${CLASS_NAME}__link-direction-in`} />}
                        {direction === 'out' && <div className={`${CLASS_NAME}__link-direction-out`} />}
                    </div>
                ) : null}
                <WithFetchStatus type='linkType' target={link.id}>
                    <div className={`${CLASS_NAME}__link-title`}>{textLine}</div>
                </WithFetchStatus>
                {count === 'some' ? null : (
                    <span className={`reactodia-badge ${CLASS_NAME}__link-count`}>
                        {count <= LINK_COUNT_PER_PAGE ? count : '100+'}
                    </span>
                )}
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

    private onExpandLink() {
        const {count, direction} = this.props;
        this.props.onExpandLink({
            chunkId: generate128BitID(),
            link: this.props.link,
            direction,
            expectedCount: count,
            pageCount: 1,
        });
    }

    private onMoveToFilter = (evt: React.MouseEvent<any>) => {
        evt.stopPropagation();
        const {link, count, direction, onMoveToFilter} = this.props;
        onMoveToFilter?.({
            chunkId: generate128BitID(),
            link,
            direction,
            expectedCount: count,
            pageCount: 1,
        });
    };
}

interface ObjectsPanelProps {
    data: ObjectsData;
    loading?: boolean;
    model: DiagramModel;
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
        if (state && state.chunkId === props.data.chunk.chunkId) {
            return null;
        }
        return ObjectsPanel.makeStateFromProps(props);
    }

    static makeStateFromProps(props: ObjectsPanelProps): ObjectsPanelState {
        return {
            chunkId: props.data.chunk.chunkId,
            selection: new Set<ElementIri>(),
        };
    }

    private onSelectAll = () => {
        const objects = this.props.data.elements;
        if (objects.length === 0) { return; }
        const allSelected = allNonPresentedAreSelected(objects, this.state.selection);
        const newSelection = allSelected
            ? new Set<ElementIri>()
            : selectNonPresented(this.props.data.elements);
        this.updateSelection(newSelection);
    };

    private getFilteredObjects(): ReadonlyArray<ElementOnDiagram> {
        if (!this.props.filterKey) {
            return this.props.data.elements;
        }
        const filterKey = this.props.filterKey.toLowerCase();
        return this.props.data.elements.filter(element => {
            const text = this.props.model.locale.formatLabel(
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
        const {data: {chunk, elements}} = this.props;
        const countString = `${activeObjCount}\u00A0of\u00A0${elements.length}`;

        let extraCountInfo: JSX.Element | null = null;
        if (chunk.expectedCount !== 'some') {
            const wrongNodes =
                Math.min(LINK_COUNT_PER_PAGE, chunk.expectedCount) - elements.length;
            const wrongNodesString = Math.abs(wrongNodes) > LINK_COUNT_PER_PAGE ?
                `${LINK_COUNT_PER_PAGE}+` : Math.abs(wrongNodes).toString();
            extraCountInfo = (
                <span className={`${CLASS_NAME}__objects-extra`}
                    title={wrongNodes === 0
                        ? undefined
                        : (wrongNodes > 0 ? 'Unavailable nodes' : 'Extra nodes')
                    }>
                    {wrongNodes === 0 ? null : (
                        wrongNodes < 0
                            ? `\u00A0(${wrongNodesString})`
                            : `\u00A0(${wrongNodesString})`
                    )}
                </span>
            );
        }

        return (
            <div className={`reactodia-label ${CLASS_NAME}__objects-count`}>
                <span>{countString}</span>
                {extraCountInfo}
            </div>
        );
    }

    render() {
        const {data, filterKey, onPressAddSelected, onMoveToFilter} = this.props;
        const {selection} = this.state;
        const objects = this.getFilteredObjects();
        const isAllSelected = allNonPresentedAreSelected(objects, selection);

        const nonPresented = objects.filter(el => !el.presentOnDiagram);
        const active = nonPresented.filter(el => selection.has(el.model.id));

        return <div className={`${CLASS_NAME}__objects`}>
            <div className={`${CLASS_NAME}__objects-select-all`}>
                <label>
                    <input type='checkbox'
                        name='reactodia-connections-menu-select-all'
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
                        items={this.getItems(objects)}
                        selection={this.state.selection}
                        onSelectionChanged={this.updateSelection}
                        highlightText={filterKey}
                    />
                    {data.chunk.expectedCount !== 'some' && data.chunk.expectedCount > LINK_COUNT_PER_PAGE ? (
                        onMoveToFilter ? (
                            <div className={`${CLASS_NAME}__move-to-filter`}
                                onClick={() => onMoveToFilter(data.chunk)}>
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
