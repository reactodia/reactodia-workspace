import * as React from 'react';

import { mapAbortedToNull } from '../../coreUtils/async';
import { getOrCreateSetInMap } from '../../coreUtils/collections';
import { Debouncer } from '../../coreUtils/scheduler';
import { EventObserver, EventTrigger } from '../../coreUtils/events';

import { ElementTypeIri, ElementTypeModel, ElementTypeGraph, SubtypeEdge } from '../../data/model';
import { DataProvider } from '../../data/provider';

import { CanvasApi, CanvasDropEvent } from '../../diagram/canvasApi';
import { Element, ElementType } from '../../diagram/elements';
import { Vector, SizeProvider } from '../../diagram/geometry';
import { DiagramModel } from '../../diagram/model';
import { HtmlSpinner } from '../../diagram/spinner';

import { ProgressBar, ProgressState } from '../progressBar';
import type { InstancesSearchCommands } from '../instancesSearch';

import { WorkspaceContext } from '../../workspace/workspaceContext';

import { TreeNode } from './treeModel';
import { Forest } from './leaf';

export interface ClassTreeProps {
    instancesSearchCommands?: EventTrigger<InstancesSearchCommands>;
}

interface State {
    refreshingState: ProgressState;
    roots: ReadonlyArray<TreeNode>;
    filteredRoots: ReadonlyArray<TreeNode>;
    requestedSearchText: string;
    appliedSearchText?: string;
    selectedNode?: TreeNode;
    constructibleClasses: ReadonlyMap<ElementTypeIri, boolean>;
    showOnlyConstructible: boolean;
}

interface FetchedClassGraph {
    readonly dataProvider: DataProvider;
    readonly graph: ElementTypeGraph;
}

interface ClassTreeItem extends ElementTypeModel {
    children: ReadonlyArray<ClassTreeItem>;
}

const CLASS_NAME = 'reactodia-class-tree';
const MIN_TERM_LENGTH = 3;

export class ClassTree extends React.Component<ClassTreeProps, State> {
    static contextType = WorkspaceContext;
    declare readonly context: WorkspaceContext;

    private readonly listener = new EventObserver();
    private readonly delayedClassUpdate = new Debouncer();
    private readonly delayedSearch = new Debouncer(200 /* ms */);
    private fetchedGraph: FetchedClassGraph | undefined;
    private classTree: ReadonlyArray<ClassTreeItem> | undefined;

    private loadClassesOperation = new AbortController();
    private refreshOperation = new AbortController();
    private createElementCancellation = new AbortController();

    constructor(props: ClassTreeProps) {
        super(props);
        this.state = {
            refreshingState: 'none',
            roots: [],
            filteredRoots: [],
            requestedSearchText: '',
            appliedSearchText: '',
            constructibleClasses: new Map(),
            showOnlyConstructible: false,
        };
    }

    render() {
        const {editor} = this.context;
        const {
            refreshingState, requestedSearchText, appliedSearchText, filteredRoots, selectedNode, constructibleClasses,
            showOnlyConstructible
        } = this.state;
        const normalizedSearchText = normalizeSearchText(requestedSearchText);
        // highlight search term only if actual tree is already filtered by current or previous term:
        //  - this immediately highlights typed characters thus making it look more responsive,
        //  - prevents expanding non-filtered tree (which can be too large) just to highlight the term
        const searchText = appliedSearchText ? normalizedSearchText : undefined;

        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__filter`}>
                    <div className={`${CLASS_NAME}__filter-group`}>
                        <input type='text'
                            className='search-input reactodia-form-control'
                            placeholder='Search for...'
                            name='reactodia-class-tree-filter'
                            value={this.state.requestedSearchText}
                            onChange={this.onSearchTextChange}
                        />
                        {editor.inAuthoringMode ? (
                            <label className={`${CLASS_NAME}__only-creatable`}>
                                <input type='checkbox'
                                    name='reactodia-class-tree-only-constructible'
                                    checked={showOnlyConstructible}
                                    onChange={this.onShowOnlyCreatableChange}
                                /> Show only constructible
                            </label>
                        ) : null}
                    </div>
                </div>
                <ProgressBar state={refreshingState}
                    title='Loading element type tree'
                />
                {this.classTree ? (
                    <Forest className={`${CLASS_NAME}__tree reactodia-scrollable`}
                        nodes={filteredRoots}
                        searchText={searchText}
                        selectedNode={selectedNode}
                        onSelect={this.onSelectNode}
                        creatableClasses={constructibleClasses}
                        onClickCreate={this.onCreateInstance}
                        onDragCreate={this.onDragCreate}
                    />
                ) : (
                    <div className={`${CLASS_NAME}__spinner`}>
                        <HtmlSpinner width={30} height={30} />
                    </div>
                )}
            </div>
        );
    }

    componentDidMount() {
        const {model} = this.context;
        this.listener.listen(model.events, 'changeLanguage', () => this.refreshClassTree());
        this.listener.listen(model.events, 'loadingStart', () => {
            this.initClassTree();
        });
        this.listener.listen(model.events, 'elementTypeEvent', ({data}) => {
            if (data.changeLabel || data.changeCount) {
                this.delayedClassUpdate.call(this.refreshClassTree);
            }
        });
        this.initClassTree();
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.delayedClassUpdate.dispose();
        this.delayedSearch.dispose();
        this.loadClassesOperation.abort();
        this.refreshOperation.abort();
        this.createElementCancellation.abort();
    }

    private async initClassTree() {
        if (this.fetchedGraph && this.fetchedGraph.dataProvider === this.context.model.dataProvider) {
            this.createElementTypesIfNeeded(this.fetchedGraph.graph);
            this.refreshClassTree();
        } else if (this.context.model.dataProvider) {
            const dataProvider = this.context.model.dataProvider;
            this.classTree = undefined;

            const cancellation = new AbortController();
            this.loadClassesOperation.abort();
            this.loadClassesOperation = cancellation;

            const classGraph = await mapAbortedToNull(
                dataProvider.knownElementTypes({signal: cancellation.signal}),
                cancellation.signal
            );
            if (classGraph === null) {
                return;
            }

            this.fetchedGraph = {dataProvider, graph: classGraph};
            this.classTree = constructTree(classGraph);
            this.createElementTypesIfNeeded(classGraph);
            this.refreshClassTree();
        } else {
            this.refreshClassTree();
        }
    }

    private onSearchTextChange = (e: React.FormEvent<HTMLInputElement>) => {
        const requestedSearchText = e.currentTarget.value;
        this.setState({requestedSearchText});
        this.delayedSearch.call(this.performSearch);
    };

    private performSearch = () => {
        const {requestedSearchText} = this.state;
        const requested = normalizeSearchText(requestedSearchText);
        if (requested === this.state.appliedSearchText) {
            return;
        }

        const appliedSearchText = requested.length < MIN_TERM_LENGTH ? undefined : requested;
        this.setState((state): State => applyFilters(
            {...state, appliedSearchText}
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
                criteria: {elementType: node.model},
            });
        });
    };

    private onCreateInstance = (node: TreeNode) => {
        this.createInstanceAt(node.model.id);
    };

    private onDragCreate = (node: TreeNode) => {
        const {view} = this.context;
        view.setHandlerForNextDropOnPaper(e => {
            this.createInstanceAt(node.model.id,  e);
        });
    };

    private refreshClassTree = () => {
        const cancellation = new AbortController();
        const {model, editor} = this.context;
        this.refreshOperation.abort();
        this.refreshOperation = cancellation;

        this.setState((state, props) => {
            if (!this.classTree) {
                return {refreshingState: 'none'};
            }

            let refreshingState: ProgressState = 'none';
            if (editor.inAuthoringMode) {
                const newIris = getNewClassIris(state.constructibleClasses, this.classTree);

                if (newIris.size > 0) {
                    refreshingState = 'loading';
                    this.queryCreatableTypes(newIris, cancellation.signal);
                }
            }

            const roots = createRoots(this.classTree, model);
            return applyFilters({...state, roots: sortTree(roots), refreshingState});
        });
    };

    private createElementTypesIfNeeded(graph: ElementTypeGraph) {
        const {model} = this.context;
        for (const typeModel of graph.elementTypes) {
            const existing = model.getElementType(typeModel.id);
            if (!existing) {
                const {id, label, count} = typeModel;
                const richType = new ElementType({id, label, count});
                model.addElementType(richType);
            }
        }
    }

    private async queryCreatableTypes(typeIris: Set<ElementTypeIri>, signal: AbortSignal) {
        const {metadataApi} = this.context.editor;
        if (!metadataApi) {
            return;
        }
        try {
            const result = await mapAbortedToNull(
                metadataApi.filterConstructibleTypes(typeIris, signal),
                signal
            );
            if (result === null) { return; }
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

    private async createInstanceAt(classId: ElementTypeIri, dropEvent?: CanvasDropEvent) {
        const {model, view, editor, overlay} = this.context;
        const batch = model.history.startBatch();

        const signal = this.createElementCancellation.signal;
        const elementModel = await mapAbortedToNull(
            editor.metadataApi!.generateNewElement([classId], signal),
            signal
        );
        if (elementModel === null) {
            return;
        }

        const element = editor.createNewEntity({elementModel});
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
        editor.setSelection([element]);
        overlay.showEditEntityForm(element);
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
        getOrCreateSetInMap(childToParents, childId).add(parentId);
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
    model: DiagramModel
): TreeNode[] {
    const mapChildren = (children: Iterable<ClassTreeItem>): TreeNode[] => {
        const nodes: TreeNode[] = [];
        for (const item of children) {
            const richClass = model.getElementType(item.id);
            if (richClass) {
                nodes.push({
                    model: richClass,
                    label: model.locale.formatLabel(richClass.label, richClass.id),
                    derived: mapChildren(item.children),
                });
            }
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
        if (derived.length > 0 || creatableClasses.get(node.model.id)) {
            acc.push(TreeNode.setDerived(node, derived));
        }
        return acc;
    }
    return roots.reduce(collectOnlyCreatable, []);
}

function forceNonReactExecutionContext(): Promise<void> {
    // force non-React executing context to resolve forceUpdate() synchronously
    return Promise.resolve();
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
