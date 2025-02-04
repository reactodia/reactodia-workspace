import * as React from 'react';
import classnames from 'classnames';

import { mapAbortedToNull } from '../../coreUtils/async';
import { multimapAdd } from '../../coreUtils/collections';
import { EventObserver, EventTrigger } from '../../coreUtils/events';
import { useObservedProperty } from '../../coreUtils/hooks';
import { Debouncer } from '../../coreUtils/scheduler';

import { ElementTypeIri, ElementTypeModel, ElementTypeGraph, SubtypeEdge } from '../../data/model';
import { DataProvider } from '../../data/provider';

import { CanvasApi, CanvasDropEvent } from '../../diagram/canvasApi';
import { Element } from '../../diagram/elements';
import { Vector, SizeProvider } from '../../diagram/geometry';
import { HtmlSpinner } from '../../diagram/spinner';

import { DataDiagramModel } from '../../editor/dataDiagramModel';

import { NoSearchResults } from '../utility/noSearchResults';
import { ProgressBar, ProgressState } from '../utility/progressBar';
import { SearchInput, SearchInputStore, useSearchInputStore } from '../utility/searchInput';
import type { InstancesSearchCommands } from '../instancesSearch';

import { WorkspaceContext, useWorkspace } from '../../workspace/workspaceContext';

import { TreeNode } from './treeModel';
import { Forest } from './leaf';

/**
 * Props for {@link ClassTree} component.
 *
 * @see {@link ClassTree}
 */
export interface ClassTreeProps {
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
     * @default 200
     */
    searchTimeout?: number;
    /**
     * Minimum number of characters in the search term to initiate the search.
     *
     * @default 2
     */
    minSearchTermLength?: number;
    /**
     * Event bus to send commands to {@link InstancesSearch} component.
     */
    instancesSearchCommands?: EventTrigger<InstancesSearchCommands>;
}

/**
 * Component to display an element type (class) tree for the workspace.
 *
 * Element type graph is loaded from {@link DataProvider} associated with
 * the diagram model.
 *
 * In graph authoring mode, the class tree can be used to create entity
 * elements that are instances of the displayed types.
 *
 * @category Components
 */
export function ClassTree(props: ClassTreeProps) {
    const {
        searchStore,
        searchTimeout = 200,
        minSearchTermLength = 2,
    } = props;
    const uncontrolledSearch = useSearchInputStore({
        initialValue: '',
        submitTimeout: searchTimeout,
        allowSubmit: term => normalizeSearchText(term).length >= minSearchTermLength,
    });
    const effectiveSearchStore = searchStore ?? uncontrolledSearch;
    const normalizedTerm = useObservedProperty(
        effectiveSearchStore.events,
        'changeValue',
        () => normalizeSearchText(effectiveSearchStore.value)
    );
    const workspace = useWorkspace();
    return (
        <ClassTreeInner {...props}
            isControlled={Boolean(searchStore)}
            searchStore={effectiveSearchStore}
            normalizedTerm={normalizedTerm}
            minSearchTermLength={minSearchTermLength}
            workspace={workspace}
        />
    );
}

interface ClassTreeInnerProps extends ClassTreeProps {
    isControlled: boolean;
    searchStore: SearchInputStore;
    normalizedTerm: string;
    minSearchTermLength: number;
    workspace: WorkspaceContext;
}

interface State {
    fetchedGraph: FetchedClassGraph | undefined;
    refreshingState: ProgressState;
    roots: ReadonlyArray<TreeNode>;
    filteredRoots: ReadonlyArray<TreeNode>;
    appliedSearchText?: string;
    selectedNode?: TreeNode;
    constructibleClasses: ReadonlyMap<ElementTypeIri, boolean>;
    showOnlyConstructible: boolean;
}

interface FetchedClassGraph {
    readonly dataProvider: DataProvider;
    readonly classTree?: ReadonlyArray<ClassTreeItem> | undefined;
    readonly fetchError?: unknown;
}

interface ClassTreeItem extends ElementTypeModel {
    children: ReadonlyArray<ClassTreeItem>;
}

const CLASS_NAME = 'reactodia-class-tree';
const EMPTY_CREATABLE_TYPES: ReadonlyMap<ElementTypeIri, boolean> = new Map();

class ClassTreeInner extends React.Component<ClassTreeInnerProps, State> {
    private readonly listener = new EventObserver();
    private readonly searchListener = new EventObserver();
    private readonly delayedClassUpdate = new Debouncer();

    private loadClassesOperation = new AbortController();
    private refreshOperation = new AbortController();
    private createElementCancellation = new AbortController();

    constructor(props: ClassTreeInnerProps) {
        super(props);
        this.state = {
            fetchedGraph: undefined,
            refreshingState: 'none',
            roots: [],
            filteredRoots: [],
            appliedSearchText: '',
            constructibleClasses: new Map(),
            showOnlyConstructible: false,
        };
    }

    render() {
        const {
            className, isControlled, searchStore, normalizedTerm, minSearchTermLength,
            workspace: {editor, translation: t},
        } = this.props;
        const {
            fetchedGraph, refreshingState, appliedSearchText, roots, filteredRoots, selectedNode,
            constructibleClasses, showOnlyConstructible
        } = this.state;
        // highlight search term only if actual tree is already filtered by current or previous term:
        //  - this immediately highlights typed characters thus making it look more responsive,
        //  - prevents expanding non-filtered tree (which can be too large) just to highlight the term
        const searchText = appliedSearchText ? normalizedTerm : undefined;

        return (
            <div
                className={classnames(
                    CLASS_NAME,
                    isControlled ? `${CLASS_NAME}--controlled` : undefined,
                    className
                )}>
                <div className={`${CLASS_NAME}__filter`}>
                    <div className={`${CLASS_NAME}__filter-group`}>
                        {isControlled ? null : (
                            <SearchInput store={searchStore}
                                inputProps={{
                                    name: 'reactodia-class-tree-filter',
                                }}
                            />
                        )}
                        {editor.inAuthoringMode ? (
                            <label className={`${CLASS_NAME}__only-creatable`}>
                                <input type='checkbox'
                                    name='reactodia-class-tree-only-constructible'
                                    checked={showOnlyConstructible}
                                    onChange={this.onShowOnlyCreatableChange}
                                /> {t.text('search_element_types.show_only_creatable')}
                            </label>
                        ) : null}
                    </div>
                </div>
                <ProgressBar state={refreshingState}
                    title={t.text('search_element_types.refresh_progress.title')}
                />
                {fetchedGraph?.classTree ? (
                    <Forest className={`${CLASS_NAME}__tree reactodia-scrollable`}
                        nodes={filteredRoots}
                        searchText={searchText}
                        selectedNode={selectedNode}
                        onSelect={this.onSelectNode}
                        creatableClasses={
                            editor.inAuthoringMode ? constructibleClasses : EMPTY_CREATABLE_TYPES
                        }
                        onClickCreate={this.onCreateInstance}
                        onDragCreate={this.onDragCreate}
                        footer={
                            filteredRoots.length === 0 ? (
                                <NoSearchResults className={`${CLASS_NAME}__no-results`}
                                    hasQuery={filteredRoots !== roots}
                                    minSearchTermLength={minSearchTermLength}
                                    message={
                                        roots.length === 0
                                            ? t.text('search_element_types.no_results')
                                            : undefined
                                    }
                                />
                            ) : null
                        }
                    />
                ) : (
                    <div className={`${CLASS_NAME}__spinner`}>
                        <HtmlSpinner width={30} height={30}
                            errorOccurred={Boolean(fetchedGraph?.fetchError)}
                        />
                    </div>
                )}
            </div>
        );
    }

    componentDidMount() {
        const {workspace: {model, editor}} = this.props;
        this.listener.listen(model.events, 'changeLanguage', () => this.refreshClassTree());
        this.listener.listen(model.events, 'loadingStart', () => {
            this.initClassTree();
        });
        this.listener.listen(editor.events, 'changeMode', () => this.refreshClassTree());
        
        this.listenSearch();
        this.initClassTree();
    }

    componentDidUpdate(prevProps: ClassTreeInnerProps): void {
        if (this.props.searchStore.events !== prevProps.searchStore.events) {
            this.listenSearch();
        }
    }

    private listenSearch() {
        const {searchStore} = this.props;
        this.searchListener.stopListening();
        this.searchListener.listen(searchStore.events, 'executeSearch', ({value}) => {
            this.performSearch(value);
        });
        this.searchListener.listen(searchStore.events, 'clearSearch', () => {
            this.performSearch('');
        });
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.searchListener.stopListening();
        this.delayedClassUpdate.dispose();
        this.loadClassesOperation.abort();
        this.refreshOperation.abort();
        this.createElementCancellation.abort();
    }

    private async initClassTree() {
        const {workspace: {model}} = this.props;
        const {fetchedGraph} = this.state;
        const {dataProvider} = model;
        if (fetchedGraph && fetchedGraph.dataProvider === dataProvider) {
            this.refreshClassTree();
        } else if (dataProvider) {
            this.setState({fetchedGraph: undefined}, () => {
                this.fetchTypeGraph(dataProvider);
            });
        } else {
            this.refreshClassTree();
        }
    }

    private async fetchTypeGraph(dataProvider: DataProvider): Promise<void> {
        const cancellation = new AbortController();
        this.loadClassesOperation.abort();
        this.loadClassesOperation = cancellation;

        let classGraph: ElementTypeGraph | null = null;
        try {
            classGraph = await mapAbortedToNull(
                dataProvider.knownElementTypes({signal: cancellation.signal}),
                cancellation.signal
            );
        } catch (error) {
            console.error(error);
            this.setState({fetchedGraph: {dataProvider, fetchError: error}});
            return;
        }

        if (classGraph === null) {
            return;
        }

        const classTree = constructTree(classGraph);
        this.setState({fetchedGraph: {dataProvider, classTree}}, () => {
            this.refreshClassTree();
        });
    }

    private performSearch = (requestedTerm: string) => {
        const normalizedTerm = normalizeSearchText(requestedTerm);
        this.setState((state): State => applyFilters(
            {...state, appliedSearchText: normalizedTerm}
        ));
    };

    private onShowOnlyCreatableChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.setState((state): State => applyFilters(
            {...state, showOnlyConstructible: !state.showOnlyConstructible}
        ));
    };

    private onSelectNode = (node: TreeNode) => {
        const {instancesSearchCommands} = this.props;
        this.setState({selectedNode: node}, () => {
            instancesSearchCommands?.trigger('setCriteria', {
                criteria: {elementType: node.iri},
            });
        });
    };

    private onCreateInstance = (node: TreeNode) => {
        this.createInstanceAt(node.iri);
    };

    private onDragCreate = (node: TreeNode) => {
        const {workspace: {view}} = this.props;
        view.setHandlerForNextDropOnPaper(e => {
            this.createInstanceAt(node.iri, e);
        });
    };

    private refreshClassTree = () => {
        const cancellation = new AbortController();
        this.refreshOperation.abort();
        this.refreshOperation = cancellation;

        this.setState((state, props) => {
            const {workspace: {model, editor}} = props;
            const classTree = state.fetchedGraph?.classTree;
            if (!classTree) {
                return {refreshingState: 'none'};
            }

            let refreshingState: ProgressState = 'none';
            if (editor.inAuthoringMode) {
                const newIris = getNewClassIris(state.constructibleClasses, classTree);

                if (newIris.size > 0) {
                    refreshingState = 'loading';
                    this.queryCreatableTypes(newIris, cancellation.signal);
                }
            }

            const roots = createRoots(classTree, model);
            return applyFilters({...state, roots: sortTree(roots), refreshingState});
        });
    };

    private async queryCreatableTypes(typeIris: Set<ElementTypeIri>, signal: AbortSignal) {
        const {workspace: {editor}} = this.props;
        const {metadataProvider} = editor;
        if (!metadataProvider) {
            return;
        }
        try {
            const result = await mapAbortedToNull(
                metadataProvider.filterConstructibleTypes(typeIris, {signal}),
                signal
            );
            if (result === null) {
                return;
            }
            this.setState((state): State => {
                const constructibleClasses = new Map(state.constructibleClasses);
                typeIris.forEach(type => {
                    constructibleClasses.set(type, result.has(type));
                });
                return applyFilters({...state, constructibleClasses, refreshingState: 'completed'});
            });
        } catch (err) {
            console.error(err);
            this.setState((state): State => applyFilters({...state, refreshingState: 'error'}));
        }
    }

    private async createInstanceAt(elementType: ElementTypeIri, dropEvent?: CanvasDropEvent) {
        const {workspace: {model, view, editor}} = this.props;
        const batch = model.history.startBatch();

        const signal = this.createElementCancellation.signal;
        const elementModel = await mapAbortedToNull(
            editor.metadataProvider!.createEntity(elementType, {signal}),
            signal
        );
        if (elementModel === null) {
            return;
        }

        const element = editor.createEntity(elementModel);
        let createAt: [CanvasApi, Vector] | undefined;

        if (dropEvent) {
            createAt = [dropEvent.source, dropEvent.position];
        } else {
            const canvas = view.findAnyCanvas();
            if (canvas) {
                createAt = [canvas, getViewportCenterInPaperCoords(canvas)];
            }
        }

        if (createAt) {
            const [canvas, targetPosition] = createAt;
            element.setPosition(targetPosition);
            canvas.renderingState.syncUpdate();
            moveElementCenterToPosition(element, targetPosition, canvas.renderingState);
        }

        batch.store();
        model.setSelection([element]);
        editor.authoringCommands.trigger('editEntity', {target: element});
    }
}

function constructTree(graph: ElementTypeGraph): ClassTreeItem[] {
    interface MutableClassItem extends ElementTypeModel {
        children: MutableClassItem[];
    }

    const items = new Map<ElementTypeIri, MutableClassItem>();
    for (const model of graph.elementTypes) {
        const item: MutableClassItem = {
            id: model.id,
            label: model.label,
            count: model.count,
            children: [],
        };
        items.set(item.id, item);
    }

    const childToParents = new Map<ElementTypeIri, Set<ElementTypeIri>>();
    for (const [childId, parentId] of graph.subtypeOf) {
        multimapAdd(childToParents, childId, parentId);
    }

    const edgesToDelete: SubtypeEdge[] = [];
    const visiting = new Set<ElementTypeIri>();
    const visited = new Set<ElementTypeIri>();

    const visit = (childId: ElementTypeIri) => {
        if (visited.has(childId)) {
            return;
        }
        visiting.add(childId);
        const parents = childToParents.get(childId);
        if (parents) {
            for (const parentId of parents) {
                if (visiting.has(parentId)) {
                    edgesToDelete.push([childId, parentId]);
                } else {
                    visit(parentId);
                }
            }
        }
        visiting.delete(childId);
    };
    for (const classId of items.keys()) {
        visit(classId);
    }

    for (const [childId, parentId] of edgesToDelete) {
        const parents = childToParents.get(childId);
        if (parents) {
            parents.delete(parentId);
        }
    }

    const roots: MutableClassItem[] = [];
    for (const item of items.values()) {
        const parents = childToParents.get(item.id);
        if (!parents || parents.size === 0) {
            roots.push(item);
        } else {
            for (const parentId of parents) {
                const parentItem = items.get(parentId);
                if (parentItem) {
                    parentItem.children.push(item);
                }
            }
        }
    }

    return roots;
}

function createRoots(
    classTree: ReadonlyArray<ClassTreeItem>,
    model: DataDiagramModel
): TreeNode[] {
    const mapChildren = (children: Iterable<ClassTreeItem>): TreeNode[] => {
        const nodes: TreeNode[] = [];
        for (const item of children) {
            nodes.push({
                iri: item.id,
                data: item,
                label: model.locale.formatLabel(item.label, item.id),
                derived: mapChildren(item.children),
            });
        }
        return nodes;
    };
    return mapChildren(classTree);
}

function getNewClassIris(
    existingClasses: ReadonlyMap<ElementTypeIri, boolean>,
    classTree: ReadonlyArray<ClassTreeItem>,
) {
    const classIris = new Set<ElementTypeIri>();
    const visitClass = (model: ClassTreeItem) => {
        if (!existingClasses.has(model.id)) {
            classIris.add(model.id);
        }
        model.children.forEach(visitClass);
    };
    classTree.forEach(visitClass);
    return classIris;
}

function normalizeSearchText(text: string) {
    return text.trim().toLowerCase();
}

function sortTree(roots: ReadonlyArray<TreeNode>): ReadonlyArray<TreeNode> {
    function mapNodes(nodes: ReadonlyArray<TreeNode>): ReadonlyArray<TreeNode> {
        if (nodes.length === 0) { return nodes; }
        const mapped = nodes.map(mapNode);
        mapped.sort(compareByLabel);
        return mapped;
    }
    function mapNode(node: TreeNode): TreeNode {
        return TreeNode.setDerived(node, mapNodes(node.derived));
    }
    function compareByLabel(left: TreeNode, right: TreeNode) {
        return left.label.localeCompare(right.label);
    }
    return mapNodes(roots);
}

function applyFilters(state: State): State {
    let filteredRoots = state.roots;
    if (state.appliedSearchText) {
        filteredRoots = filterByKeyword(filteredRoots, state.appliedSearchText);
    }
    if (state.showOnlyConstructible) {
        filteredRoots = filterOnlyCreatable(filteredRoots, state.constructibleClasses);
    }
    return {...state, filteredRoots};
}

function filterByKeyword(roots: ReadonlyArray<TreeNode>, searchText: string): ReadonlyArray<TreeNode> {
    if (roots.length === 0) {
        return roots;
    }
    function collectByKeyword(acc: TreeNode[], node: TreeNode) {
        const derived = node.derived.reduce(collectByKeyword, []);
        // keep parent if children is included or label contains keyword
        if (derived.length > 0 || node.label.toLowerCase().indexOf(searchText) >= 0) {
            acc.push(TreeNode.setDerived(node, derived));
        }
        return acc;
    }
    return roots.reduce(collectByKeyword, []);
}

function filterOnlyCreatable(
    roots: ReadonlyArray<TreeNode>,
    creatableClasses: ReadonlyMap<ElementTypeIri, boolean>
): ReadonlyArray<TreeNode> {
    function collectOnlyCreatable(acc: TreeNode[], node: TreeNode) {
        const derived = node.derived.reduce(collectOnlyCreatable, []);
        if (derived.length > 0 || creatableClasses.get(node.iri)) {
            acc.push(TreeNode.setDerived(node, derived));
        }
        return acc;
    }
    return roots.reduce(collectOnlyCreatable, []);
}

function getViewportCenterInPaperCoords(canvas: CanvasApi): Vector {
    const viewport = canvas.metrics.area;
    return canvas.metrics.clientToPaperCoords(
        viewport.clientWidth / 2,
        viewport.clientHeight / 2
    );
}

function moveElementCenterToPosition(
    element: Element,
    center: Vector,
    sizeProvider: SizeProvider
): void {
    const size = sizeProvider.getElementSize(element) ?? {width: 0, height: 0};
    element.setPosition({
        x: center.x - size.width / 2,
        y: center.y - size.height / 2,
    });
}
