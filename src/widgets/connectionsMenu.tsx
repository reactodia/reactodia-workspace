import * as React from 'react';
import classnames from 'classnames';

import { Events, EventObserver, EventTrigger } from '../coreUtils/events';
import { Debouncer } from '../coreUtils/scheduler';

import { ElementModel, ElementIri, LinkTypeIri, LinkTypeModel } from '../data/model';
import { generate128BitID } from '../data/utils';

import { CanvasApi, useCanvas } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';
import { changeLinkTypeVisibility, placeElementsAroundTarget } from '../diagram/commands';
import { Element, VoidElement } from '../diagram/elements';
import { getContentFittingBox } from '../diagram/geometry';
import { DiagramModel } from '../diagram/model';
import { HtmlSpinner } from '../diagram/spinner';

import { BuiltinDialogType } from '../editor/builtinDialogType';
import { DataDiagramModel, requestElementData, restoreLinksBetweenElements } from '../editor/dataDiagramModel';
import { EntityElement, EntityGroup, iterateEntitiesOf } from '../editor/dataElements';
import { WithFetchStatus } from '../editor/withFetchStatus';

import { SearchInput, SearchInputStore, useSearchInputStore } from '../widgets/utility/searchInput';
import type { InstancesSearchCommands } from '../widgets/instancesSearch';

import { type WorkspaceContext, WorkspaceEventKey, useWorkspace } from '../workspace/workspaceContext';

import { highlightSubstring } from './utility/listElementView';
import { SearchResults } from './utility/searchResults';

/**
 * Props for {@link ConnectionsMenu} component.
 *
 * @see {@link ConnectionsMenu}
 */
export interface ConnectionsMenuProps {
    /**
     * Event bus to listen commands for this component.
     */
    commands: Events<ConnectionsMenuCommands>;
    /**
     * Whether to open (connected by) "All" link type by default.
     *
     * @default false
     */
    openAllByDefault?: boolean;
    /**
     * Smart link type suggestion provider when searching by the link type label.
     */
    suggestProperties?: PropertySuggestionHandler;
    /**
     * Event bus to send commands to {@link InstancesSearch} component.
     */
    instancesSearchCommands?: EventTrigger<InstancesSearchCommands>;
}

/**
 * Events for {@link ConnectionsMenu} event bus.
 *
 * @see {@link ConnectionsMenu}
 */
export interface ConnectionsMenuCommands {
    /**
     * Can be triggered to open connections menu for the target elements.
     */
    show: {
        /**
         * Target diagram elements to navigate from.
         */
        readonly targets: ReadonlyArray<Element>;
        /**
         * Whether to open (connected by) "All" link type.
         *
         * @default false
         */
        readonly openAll?: boolean;
    };
}

/**
 * Provides smart suggestions when searching by the link type label.
 *
 * @see {@link ConnectionsMenuProps.suggestProperties}
 */
export type PropertySuggestionHandler = (params: PropertySuggestionParams) => Promise<PropertyScore[]>;

/**
 * Parameters for the smart link type suggestion handler.
 *
 * @see {@link PropertySuggestionHandler}
 */
export interface PropertySuggestionParams {
    /**
     * Target connected entity IRI.
     */
    elementId: string;
    /**
     * Link type label search token.
     */
    token: string;
    /**
     * A collection of possible link type IRIs.
     */
    properties: readonly string[];
    /**
     * Current diagram model data language.
     */
    lang: string;
    /**
     * Cancellation signal.
     */
    signal: AbortSignal | undefined;
}

/**
 * Result entry for the smart link type suggestion handler.
 *
 * @see {@link PropertySuggestionHandler}
 */
export interface PropertyScore {
    /**
     * Link type IRI.
     */
    propertyIri: string;
    /**
     * Suggestion score (higher is more suggested for the top positions).
     */
    score: number;
}

/**
 * Canvas widget component to explore and navigate the graph by adding
 * connected entities to the diagram.
 *
 * @category Components
 */
export function ConnectionsMenu(props: ConnectionsMenuProps) {
    const {commands} = props;

    const workspace = useWorkspace();
    const {canvas} = useCanvas();

    const lastSortMode = React.useRef<SortMode>('alphabet');

    React.useEffect(() => {
        const listener = new EventObserver();
        listener.listen(commands, 'show', ({targets}) => {
            if (targets.length === 0) {
                return;
            }
            const {model, overlay, translation: t} = workspace;

            const virtualTarget = targets.length > 1
                ? new VirtualTarget(targets, model, canvas)
                : undefined;

            const placeTarget = virtualTarget ?? targets[0];

            const targetIris = new Set<ElementIri>();
            for (const target of targets) {
                for (const entity of iterateEntitiesOf(target)) {
                    targetIris.add(entity.id);
                }
            }

            overlay.showDialog({
                target: placeTarget,
                dialogType: BuiltinDialogType.connectionsMenu,
                style: {
                    caption: t.text('connections_menu.dialog.caption'),
                    defaultSize: {width: 310, height: 340},
                    minSize: {width: 300, height: 250},
                },
                content: (
                    <ConnectionsMenuContent {...props}
                        placeTarget={placeTarget}
                        targetIris={Array.from(targetIris)}
                        initialMode={lastSortMode.current}
                        onChangeMode={mode => {
                            lastSortMode.current = mode;
                        }}
                        onCancel={() => overlay.hideDialog()}
                        workspace={workspace}
                        canvas={canvas}
                    />
                ),
                onClose: () => virtualTarget?.removeFrom(model),
            });
        });
        return () => listener.stopListening();
    }, [commands]);

    return null;
}

defineCanvasWidget(ConnectionsMenu, element => ({element, attachment: 'viewport'}));

class VirtualTarget extends VoidElement {
    private readonly listener = new EventObserver();

    constructor(
        elements: ReadonlyArray<Element>,
        model: DiagramModel,
        canvas: CanvasApi
    ) {
        super({});

        const elementSet = new Set(elements);
        const updateTargetPosition = () => {
            const {x, y, width, height} = getContentFittingBox(elements, [], canvas.renderingState);
            this.setPosition({
                x: x + width,
                y: y + height / 2,
            });
        };
        updateTargetPosition();

        const batch = model.history.startBatch();
        model.addElement(this);
        batch.discard();
    
        this.listener.listen(model.events, 'changeCells', e => {
            if (e.changedElement === this || e.updateAll) {
                if (model.getElement(this.id) !== this) {
                    this.listener.stopListening();
                }
            }
        });
        this.listener.listen(model.events, 'elementEvent', ({data}) => {
            if (data.changePosition && elementSet.has(data.changePosition.source)) {
                updateTargetPosition();
            }
        });
        this.listener.listen(canvas.renderingState.events, 'changeElementSize', e => {
            if (elementSet.has(e.source)) {
                updateTargetPosition();
            }
        });
    }

    removeFrom(model: DiagramModel): void {
        this.listener.stopListening();
        if (model.getElement(this.id) === this) {
            const batch = model.history.startBatch();
            model.removeElement(this.id);
            batch.discard();
        }
    }
}

interface ConnectionsMenuContentProps extends ConnectionsMenuProps {
    placeTarget: Element;
    targetIris: ReadonlyArray<ElementIri>;
    initialMode: SortMode;
    onChangeMode: (mode: SortMode) => void;
    onCancel: () => void;
    workspace: WorkspaceContext;
    canvas: CanvasApi;
}

function ConnectionsMenuContent(props: ConnectionsMenuContentProps) {
    const connectionSearch = useSearchInputStore({
        initialValue: '',
        // this timeout will only apply to property suggestions
        submitTimeout: 200,
    });
    const objectSearch = useSearchInputStore({initialValue: ''});
    return (
        <ConnectionsMenuInner {...props}
            connectionSearch={connectionSearch}
            objectSearch={objectSearch}
        />
    );
}

interface ConnectionsMenuInnerProps extends ConnectionsMenuContentProps {
    readonly connectionSearch: SearchInputStore;
    readonly objectSearch: SearchInputStore;
}

interface MenuState {
    readonly panel: 'connections' | 'objects';
    readonly connectionSortMode: SortMode;
    readonly loadingState: 'none' | 'loading' | 'error' | 'completed';
    readonly connections?: ConnectionsData;
    readonly connectionSuggestions: ConnectionSuggestions;
    readonly objects?: ObjectsData;
}

type SortMode = 'alphabet' | 'smart';

interface ConnectionsData {
    readonly links: ReadonlyArray<LinkTypeModel>;
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
    readonly linkType: LinkTypeModel;
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
    private readonly ALL_RELATED_ELEMENTS_LINK: LinkTypeModel;

    private readonly handler = new EventObserver();
    private readonly linkTypesListener = new EventObserver();

    private readonly delayedUpdateAll = new Debouncer();
    private suggestionCancellation = new AbortController();

    private linksScrolledListRef = React.createRef<HTMLUListElement>();
    private linksScrollPosition: number | undefined;

    constructor(props: ConnectionsMenuInnerProps) {
        super(props);
        const {targetIris, initialMode, suggestProperties, workspace: {model, translation: t}} = this.props;
        this.ALL_RELATED_ELEMENTS_LINK = {
            id: 'urn:reactodia:allLinks' as LinkTypeIri,
            label: [model.factory.literal(t.text('connections_menu.all_link.label'))],
        };
        const allowSmartSort = Boolean(suggestProperties) && targetIris.length === 1;
        this.state = {
            loadingState: 'none',
            panel: 'connections',
            connectionSortMode: allowSmartSort ? initialMode : 'alphabet',
            connectionSuggestions: {
                filterKey: null,
                scores: new Map(),
            },
        };
    }

    private updateAll = () => this.forceUpdate();

    private scheduleUpdateAll = () => {
        this.delayedUpdateAll.call(this.updateAll);
    };

    componentDidMount() {
        const {connectionSearch, objectSearch, workspace: {model}} = this.props;
        this.handler.listen(model.events, 'changeLanguage', this.scheduleUpdateAll);
        this.handler.listen(connectionSearch.events, 'changeValue', this.updateAll);
        this.handler.listen(connectionSearch.events, 'executeSearch', ({value}) => {
            this.loadSuggestions(value);
        });
        this.handler.listen(objectSearch.events, 'changeValue', this.updateAll);

        this.loadLinks();
    }

    getSnapshotBeforeUpdate(
        prevProps: ConnectionsMenuInnerProps,
        prevState: MenuState
    ): number {
        if (this.state.panel === 'objects' && prevState.panel === 'connections') {
            if (this.linksScrolledListRef.current) {
                this.linksScrollPosition = this.linksScrolledListRef.current.scrollTop;
            }
        }
        return 0;
    }

    componentDidUpdate(
        prevProps: Readonly<ConnectionsMenuInnerProps>,
        prevState: Readonly<MenuState>
    ): void {
        if (this.state.panel === 'connections' && prevState.panel === 'objects') {
            if (this.linksScrollPosition !== undefined && this.linksScrolledListRef.current) {
                this.linksScrolledListRef.current.scrollTop = this.linksScrollPosition;
            }
        }
    }

    componentWillUnmount() {
        this.handler.stopListening();
        this.linkTypesListener.stopListening();
        this.delayedUpdateAll.dispose();
        this.suggestionCancellation.abort();
    }

    private async loadLinks() {
        const {targetIris, workspace: {model, triggerWorkspaceEvent}} = this.props;

        this.setState({
            loadingState: 'loading',
            connections: {
                links: [],
                counts: new Map(),
            },
        });

        const requestInexact = targetIris.length > 1;
        const counts = new Map<LinkTypeIri, ConnectionCount>();
        try {
            await Promise.all(targetIris.map(iri =>
                model.dataProvider
                    .connectedLinkStats({elementId: iri, inexactCount: requestInexact})
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
            (linkTypeId): LinkTypeModel => model.createLinkType(linkTypeId)?.data ?? {
                id: linkTypeId,
                label: [],
            }
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
            this.loadSuggestions('');
        });
    }

    private resubscribeOnLinkTypeEvents() {
        const {workspace: {model}} = this.props;
        const {connections} = this.state;
        this.linkTypesListener.stopListening();
        if (connections) {
            for (const {id: linkTypeIri} of connections.links) {
                const linkType = model.createLinkType(linkTypeIri);
                this.linkTypesListener.listen(linkType.events, 'changeData', this.scheduleUpdateAll);
            }

            const linkTypeIris = new Set(connections.links.map(link => link.id));
            this.linkTypesListener.listen(model.events, 'changeLinkVisibility', e => {
                if (linkTypeIris.has(e.source)) {
                    this.scheduleUpdateAll();
                }
            });
        }
    }

    private async loadObjects(chunk: LinkDataChunk) {
        const {targetIris, workspace: {model, triggerWorkspaceEvent}} = this.props;
        const {linkType, direction, pageCount} = chunk;

        this.setState({
            loadingState: 'loading',
            objects: {chunk, elements: []},
        });

        const loadedElements = new Map<ElementIri, ElementModel>();
        try {
            await Promise.all(targetIris.map(iri =>
                model.dataProvider.lookup({
                    refElementId: iri,
                    refElementLinkId: linkType.id === this.ALL_RELATED_ELEMENTS_LINK.id
                        ? undefined : linkType.id,
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

        const displayedEntities = new Set<ElementIri>();
        for (const element of model.elements) {
            if (element instanceof EntityElement) {
                displayedEntities.add(element.iri);
            }
        }
        const elements = Array.from(loadedElements.values(), element => ({
            model: element,
            presentOnDiagram: displayedEntities.has(element.id),
        }));

        this.setState({
            loadingState: 'completed',
            objects: {chunk, elements},
        }, () => {
            triggerWorkspaceEvent(WorkspaceEventKey.connectionsLoadElements);
        });
    }

    private async loadSuggestions(filterKey: string) {
        const {targetIris, suggestProperties, workspace: {model}} = this.props;
        const {
            loadingState, panel, connectionSortMode, connections, connectionSuggestions,
        } = this.state;

        this.suggestionCancellation.abort();

        if (
            suggestProperties &&
            targetIris.length === 1 &&
            panel === 'connections' &&
            loadingState === 'completed' &&
            connections &&
            (filterKey.length > 0 || connectionSortMode === 'smart') &&
            connectionSuggestions.filterKey !== filterKey
        ) {
            const singleTargetIri = targetIris[0];
            const lang = model.language;
            const token = filterKey.trim();
            const properties = connections.links.map(link => link.id);

            this.suggestionCancellation = new AbortController();
            const signal = this.suggestionCancellation.signal;
    
            const scoreList = await suggestProperties({
                elementId: singleTargetIri, token, properties, lang, signal,
            });
            
            const scores = new Map<LinkTypeIri, PropertyScore>();
            for (const score of scoreList) {
                scores.set(score.propertyIri as LinkTypeIri, score);
            }
            this.setState(state => ({
                connectionSuggestions: {
                    ...state.connectionSuggestions,
                    filterKey,
                    scores,
                }
            }));
        }
    }

    render() {
        const {connectionSearch, objectSearch} = this.props;
        const {panel} = this.state;
        return (
            <div className={CLASS_NAME}>
                {this.getBreadCrumbs()}
                <SearchInput className={`${CLASS_NAME}__search`}
                    store={panel === 'connections' ? connectionSearch : objectSearch}
                    inputProps={{
                        name: 'reactodia-connection-menu-filter',
                    }}>
                    {this.renderSortSwitches()}
                </SearchInput>
                {this.getBody()}
            </div>
        );
    }

    private getBreadCrumbs() {
        const {workspace: {model, translation: t}} = this.props;
        const {objects, panel} = this.state;
        if (objects && panel === 'objects') {
            const {linkType, direction} = objects.chunk;
            const {label} = model.getLinkType(linkType.id)?.data ?? linkType;
            const localizedText = model.locale.formatLabel(label, linkType.id);

            return <span className={`${CLASS_NAME}__breadcrumbs`}>
                <a className={`${CLASS_NAME}__breadcrumbs-link`}
                    onClick={this.onCollapseLink}>{t.text('connections_menu.breadcrumbs_root.label')}</a>
                {'\u00A0' + '/' + '\u00A0'}
                {localizedText} {direction ? `(${direction})` : null}
            </span>;
        } else {
            return null;
        }
    }

    private onExpandLink = (chunk: LinkDataChunk) => {
        const {objectSearch, workspace: {triggerWorkspaceEvent}} = this.props;
        const {objects} = this.state;

        this.setState(
            {panel: 'objects'},
            () => objectSearch.change({value: '', action: 'clear'})
        );
        const alreadyLoaded = (
            objects &&
            objects.chunk.linkType.id === chunk.linkType.id &&
            objects.chunk.direction === chunk.direction
        );
        if (!alreadyLoaded) {
            this.loadObjects(chunk);
        }

        triggerWorkspaceEvent(WorkspaceEventKey.connectionsExpandLink);
    };

    private onCollapseLink = () => {
        this.setState({panel: 'connections', loadingState: 'completed'});
    };

    private getBody() {
        const {
            targetIris, instancesSearchCommands, connectionSearch, objectSearch, workspace,
        } = this.props;
        const {
            panel, connectionSortMode, loadingState, objects, connections, connectionSuggestions,
        } = this.state;

        if (loadingState === 'error') {
            return <LoadingSpinner error={true} />;
        } else if (objects && panel === 'objects') {
            return (
                <ObjectsPanel
                    data={objects}
                    onMoveToFilter={this.onMoveToFilter}
                    workspace={workspace}
                    filterKey={objectSearch.value}
                    loading={loadingState === 'loading'}
                    onPressAddSelected={this.onAddSelectedElements}
                />
            );
        } else if (connections && panel === 'connections') {
            if (
                loadingState === 'loading' || (
                    connectionSortMode === 'smart' &&
                    connectionSuggestions.filterKey === null
                )
            ) {
                return <LoadingSpinner />;
            }
            return (
                <ConnectionsList
                    targetIris={targetIris}
                    data={connections}
                    suggestions={connectionSuggestions}
                    workspace={workspace}
                    filterKey={connectionSearch.value}
                    sortMode={connectionSortMode}
                    allRelatedLink={this.ALL_RELATED_ELEMENTS_LINK}
                    onExpandLink={this.onExpandLink}
                    onMoveToFilter={
                        instancesSearchCommands && targetIris.length === 1
                            ? this.onMoveToFilter
                            : undefined
                    }
                    scrolledListRef={this.linksScrolledListRef}
                />
            );
        } else {
            return <div />;
        }
    }

    private onAddSelectedElements = (
        selectedObjects: ElementOnDiagram[],
        mode: ObjectPlacingMode
    ) => {
        const {onCancel} = this.props;
        const {objects} = this.state;

        const addedElementsIris = selectedObjects.map(item => item.model.id);
        const linkTypeId = objects ? objects.chunk.linkType.id : undefined;
        const hasChosenLinkType = objects && linkTypeId !== this.ALL_RELATED_ELEMENTS_LINK.id;

        this.placeElements(addedElementsIris, hasChosenLinkType ? linkTypeId : undefined, mode);
        onCancel();
    };

    private placeElements(
        elementIris: ElementIri[],
        linkTypeId: LinkTypeIri | undefined,
        mode: ObjectPlacingMode
    ): void {
        const {
            placeTarget,
            canvas,
            workspace: {model, triggerWorkspaceEvent},
        } = this.props;
        const batch = model.history.startBatch({titleKey: 'connections_menu.place_elements.command'});

        let placedElements: Element[] = [];
        switch (mode) {
            case 'separately': {
                placedElements = elementIris.map(iri => model.createElement(iri));
                break;
            }
            case 'grouped': {
                const group = new EntityGroup({
                    items: elementIris.map(iri => ({data: EntityElement.placeholderData(iri)})),
                });
                model.addElement(group);
                placedElements = [group];
                break;
            }
        }

        canvas.renderingState.syncUpdate();
        batch.history.execute(placeElementsAroundTarget({
            target: placeTarget,
            elements: placedElements,
            graph: model,
            sizeProvider: canvas.renderingState,
        }));

        if (linkTypeId && model.getLinkVisibility(linkTypeId) === 'hidden') {
            batch.history.execute(changeLinkTypeVisibility(model, linkTypeId, 'visible'));
        }

        batch.history.execute(requestElementData(model, elementIris));
        batch.history.execute(restoreLinksBetweenElements(model, {
            addedElements: elementIris,
        }));
        batch.store();

        triggerWorkspaceEvent(WorkspaceEventKey.editorAddElements);
    }

    private onMoveToFilter = (linkDataChunk: LinkDataChunk) => {
        const {targetIris, instancesSearchCommands} = this.props;
        const {linkType, direction} = linkDataChunk;

        const singleTargetIri = targetIris.length === 1 ? targetIris[0] : undefined;
        if (!singleTargetIri) {
            return;
        }
        
        if (linkType.id === this.ALL_RELATED_ELEMENTS_LINK.id) {
            instancesSearchCommands?.trigger('setCriteria', {
                criteria: {refElement: singleTargetIri},
            });
        } else {
            instancesSearchCommands?.trigger('setCriteria', {
                criteria: {
                    refElement: singleTargetIri,
                    refElementLink: linkType.id,
                    linkDirection: direction,
                },
            });
        }
    };

    private renderSortSwitches() {
        const {targetIris, suggestProperties, workspace: {translation: t}} = this.props;
        const {panel} = this.state;
        if (!(panel === 'connections' && suggestProperties && targetIris.length === 1)) {
            return null;
        }
        return (
            <div className={`${CLASS_NAME}__sort-switches`}>
                {this.renderSortSwitch(
                    'alphabet',
                    `${CLASS_NAME}__sort-label-alpha`,
                    t.text('connections_menu.sort_alphabetically.title')
                )}
                {this.renderSortSwitch(
                    'smart',
                    `${CLASS_NAME}__sort-label-smart`,
                    t.text('connections_menu.sort_smart.title')
                )}
            </div>
        );
    }

    private renderSortSwitch(id: string, labelClass: string, title: string) {
        const {connectionSortMode} = this.state;
        return (
            <div>
                <input
                    type='radio'
                    name='sort'
                    id={id}
                    value={id}
                    className={`${CLASS_NAME}__sort-switch`}
                    onChange={this.onSortChange}
                    checked={connectionSortMode === id}
                />
                <label htmlFor={id} title={title}
                    className={classnames(`${CLASS_NAME}__sort-switch-label`, labelClass)}>
                </label>
            </div>
        );
    }

    private onSortChange = (e: React.FormEvent<HTMLInputElement>) => {
        const {onChangeMode, connectionSearch} = this.props;
        const {connectionSortMode} = this.state;
        const value = (e.target as HTMLInputElement).value as SortMode;

        if (connectionSortMode !== value) {
            this.setState(
                {connectionSortMode: value},
                () => {
                    onChangeMode(value);
                    connectionSearch.change({value: connectionSearch.value, action: 'submit'});
                }
            );
        }
    };
}

interface ConnectionsListProps {
    targetIris: ReadonlyArray<ElementIri>;
    data: ConnectionsData;
    filterKey: string;
    sortMode: SortMode;
    suggestions: ConnectionSuggestions;
    workspace: WorkspaceContext;

    allRelatedLink: LinkTypeModel;
    onExpandLink: (chunk: LinkDataChunk) => void;
    onMoveToFilter: ((chunk: LinkDataChunk) => void) | undefined;

    scrolledListRef: React.RefObject<HTMLUListElement>;
}

interface ConnectionSuggestions {
    readonly filterKey: string | null;
    readonly scores: ReadonlyMap<LinkTypeIri, PropertyScore>;
}

class ConnectionsList extends React.Component<ConnectionsListProps> {
    private isSmartMode(): boolean {
        return this.props.sortMode === 'smart' && !this.props.filterKey;
    }

    private compareLinks = (a: LinkTypeModel, b: LinkTypeModel) => {
        const {workspace: {model}} = this.props;
        const aText = model.locale.formatLabel(a.label, a.id);
        const bText = model.locale.formatLabel(b.label, b.id);
        return aText.localeCompare(bText);
    };

    private compareLinksByWeight = (a: LinkTypeModel, b: LinkTypeModel) => {
        const {workspace: {model}, suggestions} = this.props;
        const {scores} = suggestions;
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
        const {workspace: {model}, data, filterKey} = this.props;
        return (data.links || [])
            .map(link => model.getLinkType(link.id)?.data ?? link)
            .filter(link => {
                const text = model.locale.formatLabel(link.label, link.id).toLowerCase();
                return !filterKey || text.indexOf(filterKey.toLowerCase()) >= 0;
            })
            .sort(this.compareLinks);
    }

    private getProbableLinks() {
        const {workspace: {model}, data, suggestions} = this.props;
        const {scores} = suggestions;
        const isSmartMode = this.isSmartMode();
        return (data.links ?? [])
            .map(link => model.getLinkType(link.id)?.data ?? link)
            .filter(link => {
                return scores.has(link.id) && (scores.get(link.id)!.score > 0 || isSmartMode);
            })
            .sort(this.compareLinksByWeight);
    }

    private getViews = (links: LinkTypeModel[], notSure?: boolean) => {
        const {workspace, data, suggestions} = this.props;
        const {scores} = suggestions;

        const views: JSX.Element[] = [];
        const addView = (link: LinkTypeModel, direction: 'in' | 'out') => {
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
                    workspace={workspace}
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
        const {workspace, allRelatedLink, scrolledListRef} = this.props;
        const {translation: t} = workspace;
        const isSmartMode = this.isSmartMode();

        const links = isSmartMode ? [] : this.getLinks();
        const probableLinks = this.getProbableLinks().filter(link => links.indexOf(link) === -1);
        const views = this.getViews(links);
        const probableViews = this.getViews(probableLinks, true);

        let viewList: React.ReactElement<any> | React.ReactElement<any>[];
        if (views.length === 0 && probableViews.length === 0) {
            viewList = (
                <label className={`${CLASS_NAME}__links-no-results`}>
                    {t.text('connections_menu.links.no_results')}
                </label>
            );
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
                        workspace={workspace}
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
                    <li key='probable-links'
                        className={`${CLASS_NAME}__links-probably-label`}>
                        {t.text('connections_menu.links.suggest_similar')}
                    </li>
                ),
                probableViews,
            ];
        }
        return (
            <ul ref={scrolledListRef}
                className={classnames(
                    'reactodia-scrollable',
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
    link: LinkTypeModel;
    count: number | 'some';
    direction?: 'in' | 'out';
    workspace: WorkspaceContext;
    filterKey?: string;
    onExpandLink: (linkDataChunk: LinkDataChunk) => void;
    onMoveToFilter: ((linkDataChunk: LinkDataChunk) => void) | undefined;
    probability?: number;
}

class LinkInPopupMenu extends React.Component<LinkInPopupMenuProps> {
    render() {
        const {
            link, filterKey, direction, count, probability = 0,
            workspace: {model, translation: t},
        } = this.props;
        const relation = model.locale.formatLabel(link.label, link.id);
        const relationIri = model.locale.formatIri(link.id);
        const probabilityPercent = Math.round(probability * 100);
        const textLine = highlightSubstring(
            relation + (probabilityPercent > 0 ? ` (${probabilityPercent}%)` : ''),
            filterKey
        );
        const title = (
            direction === 'in' ? t.format('connections_menu.link.source_title', {relation, relationIri}) :
            direction === 'out' ? t.format('connections_menu.link.target_title', {relation, relationIri}) :
            t.format('connections_menu.link.both_title', {relation, relationIri})
        );
        const navigateTitle = (
            direction === 'in' ? t.format('connections_menu.link.source_navigate_title', {relation, relationIri}) :
            direction === 'out' ? t.format('connections_menu.link.target_navigate_title', {relation, relationIri}) :
            t.format('connections_menu.link.both_navigate_title', {relation, relationIri})
        );

        return (
            <li data-linktypeid={link.id}
                className={`${CLASS_NAME}__link`}
                title={title}
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
                        {count <= LINK_COUNT_PER_PAGE ? count : `${LINK_COUNT_PER_PAGE}+`}
                    </span>
                )}
                {this.props.onMoveToFilter ? (
                    <div className={`${CLASS_NAME}__link-filter-button`}
                        onClick={this.onMoveToFilter}
                        title={t.text('connections_menu.link.move_to_filter.title')}
                    />
                ) : null}
                <div className={`${CLASS_NAME}__link-navigate-button`}
                    title={navigateTitle}
                />
            </li>
        );
    }

    private onExpandLink() {
        const {count, direction} = this.props;
        this.props.onExpandLink({
            chunkId: generate128BitID(),
            linkType: this.props.link,
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
            linkType: link,
            direction,
            expectedCount: count,
            pageCount: 1,
        });
    };
}

interface ObjectsPanelProps {
    data: ObjectsData;
    loading?: boolean;
    workspace: WorkspaceContext;
    filterKey?: string;
    onPressAddSelected: (
        selectedObjects: ElementOnDiagram[],
        mode: ObjectPlacingMode
    ) => void;
    onMoveToFilter: ((linkDataChunk: LinkDataChunk) => void) | undefined;
}

type ObjectPlacingMode = 'separately' | 'grouped';

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
        const {workspace: {model}, data, filterKey} = this.props;
        if (!filterKey) {
            return data.elements;
        }
        const loweredFilterKey = filterKey.toLowerCase();
        return data.elements.filter(element => {
            const text = model.locale.formatLabel(
                element.model.label, element.model.id
            ).toLowerCase();
            return text && text.indexOf(loweredFilterKey) >= 0;
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
        const {data: {chunk, elements}, workspace: {translation: t}} = this.props;
        const countString = t.format('connections_menu.entities.counter_label', {
            count: activeObjCount,
            total: elements.length,
        });

        let extraCountInfo: JSX.Element | null = null;
        if (chunk.expectedCount !== 'some') {
            const extraCount =
                Math.min(LINK_COUNT_PER_PAGE, chunk.expectedCount) - elements.length;
            const extra = Math.abs(extraCount) > LINK_COUNT_PER_PAGE ?
                `${LINK_COUNT_PER_PAGE}+` : Math.abs(extraCount).toString();
            extraCountInfo = (
                <span className={`${CLASS_NAME}__objects-extra`}
                    title={extraCount === 0 ? undefined : (
                        extraCount > 0
                            ? t.format('connections_menu.entities.extra_title', {value: extra})
                            : t.format('connections_menu.entities.missing_title', {value: extra})
                    )}>
                    {extraCount === 0 ? null : (
                        extraCount > 0
                            ? t.format('connections_menu.entities.extra_label', {value: extra})
                            : t.format('connections_menu.entities.missing_label', {value: extra})
                    )}
                </span>
            );
        }

        return (
            <div className={`${CLASS_NAME}__objects-count`}>
                <span>{countString}</span>
                {extraCountInfo}
            </div>
        );
    }

    render() {
        const {data, filterKey, onPressAddSelected, onMoveToFilter, workspace: {translation: t}} = this.props;
        const {selection} = this.state;
        const objects = this.getFilteredObjects();
        const isAllSelected = allNonPresentedAreSelected(objects, selection);

        const nonPresented = objects.filter(el => !el.presentOnDiagram);
        const active = nonPresented.filter(el => selection.has(el.model.id));
        const selectedItems = active.length > 0 ? active : nonPresented;

        return <div className={`${CLASS_NAME}__objects`}>
            <div className={`${CLASS_NAME}__objects-select-all`}>
                <label>
                    <input type='checkbox'
                        name='reactodia-connections-menu-select-all'
                        checked={isAllSelected && nonPresented.length > 0}
                        onChange={this.onSelectAll}
                        disabled={nonPresented.length === 0}
                        title={t.text('connections_menu.select_all.title')}
                    />
                    {t.text('connections_menu.select_all.label')}
                </label>
            </div>
            {this.props.loading ? (
                <div className={`${CLASS_NAME}__objects-loading`}>
                    <LoadingSpinner />
                </div>
            ) : objects.length === 0 ? (
                <div className={`${CLASS_NAME}__objects-no-results`}>
                    {t.text('connections_menu.entities.no_results')}
                </div>
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
                                {t.format('connections_menu.entities.truncated_results_expand', {
                                    limit: LINK_COUNT_PER_PAGE,
                                })}
                            </div>
                        ) : (
                            <div className={`${CLASS_NAME}__move-to-filter`}>
                                {t.format('connections_menu.entities.truncated_results', {
                                    limit: LINK_COUNT_PER_PAGE,
                                })}
                            </div>
                        )
                    ) : null}
                </div>
            )}
            <div className={`${CLASS_NAME}__objects-statusbar`}>
                {this.renderCounter(active.length)}
                <div className={`${CLASS_NAME}__objects-spacer`} aria-hidden='true' />
                <button
                    className={classnames(
                        `${CLASS_NAME}__objects-add-button`,
                        'reactodia-btn reactodia-btn-secondary'
                    )}
                    disabled={this.props.loading || selectedItems.length <= 1}
                    onClick={() => onPressAddSelected(selectedItems, 'grouped')}>
                    {t.text('connections_menu.entities.add_all')}
                </button>
                <button
                    className={classnames(
                        `${CLASS_NAME}__objects-add-button`,
                        'reactodia-btn reactodia-btn-primary'
                    )}
                    disabled={this.props.loading || nonPresented.length === 0}
                    onClick={() => onPressAddSelected(selectedItems, 'separately')}>
                    {active.length > 0
                        ? t.text('connections_menu.entities.add_selected')
                        : t.text('connections_menu.entities.add_all')
                    }
                </button>
            </div>
        </div>;
    }
}

function LoadingSpinner(props: { error?: boolean }) {
    return (
        <div className={`${CLASS_NAME}__spinner`}>
            <HtmlSpinner width={30} height={30}
                errorOccurred={Boolean(props.error)}
            />
        </div>
    );
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
