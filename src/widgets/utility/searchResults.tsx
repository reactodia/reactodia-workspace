import * as React from 'react';

import { EventObserver } from '../../coreUtils/events';
import { Debouncer } from '../../coreUtils/scheduler';

import { ElementModel, ElementIri } from '../../data/model';

import type { DataGraphStructure } from '../../editor/dataDiagramModel';
import { EntityElement, iterateEntitiesOf } from '../../editor/dataElements';

import { WorkspaceContext, useWorkspace } from '../../workspace/workspaceContext';

import { ListElementView, startDragElements } from './listElementView';

const CLASS_NAME = 'reactodia-search-results';

/**
 * Props for {@link SearchResults} component.
 *
 * @see {@link SearchResults}
 */
export interface SearchResultsProps {
    /**
     * List of entities to display.
     */
    items: ReadonlyArray<ElementModel>;
    /**
     * Set of selected entities from {@link items}.
     */
    selection: ReadonlySet<ElementIri>;
    /**
     * Handler to change a selected set of entities.
     */
    onSelectionChanged: (newSelection: ReadonlySet<ElementIri>) => void;
    /**
     * Text sub-string to highlight in the displayed entities.
     */
    highlightText?: string;
    /**
     * Whether to allow to drag entities from the list (e.g. onto the diagram canvas).
     *
     * @default true
     */
    useDragAndDrop?: boolean;
    /**
     * Whether to unselect previously selected item on click and require
     * to click with Control/Meta key to select multiple items.
     * 
     * It is also always possible to select a range of items by holding Shift
     * when selecting a second item to select all other items in between as well.
     *
     * @default false
     */
    singleSelectOnClick?: boolean;
    /**
     * Additional components to render after the result items.
     */
    footer?: React.ReactNode;
}

/**
 * Utility component to display a list of selectable entities.
 *
 * @category Components
 */
export function SearchResults(props: SearchResultsProps) {
    const workspace = useWorkspace();
    return (
        <SearchResultsInner {...props}
            workspace={workspace}
        />
    );
}

interface SearchResultsInnerProps extends SearchResultsProps {
    workspace: WorkspaceContext;
}

const DEFAULT_USE_DRAG_AND_DROP = true;

const enum Direction { Up, Down }

class SearchResultsInner extends React.Component<SearchResultsInnerProps> {
    private readonly listener = new EventObserver();
    private readonly delayedChangeCells = new Debouncer();

    private root: HTMLElement | undefined | null;

    private startSelection = 0;
    private endSelection = 0;

    render(): React.ReactElement<any> {
        const {items, footer, workspace: {model}} = this.props;
        const presentOnDiagram = computePresentOnDiagramEntities(model);
        return (
            <ul ref={this.onRootMount}
                className={CLASS_NAME}
                role='listbox'
                aria-multiselectable={true}
                tabIndex={-1}
                onFocus={this.addKeyListener}
                onBlur={this.removeKeyListener}>
                {items.map(item => this.renderResultItem(item, presentOnDiagram))}
                {footer}
            </ul>
        );
    }

    private onRootMount = (root: HTMLElement | null) => {
        this.root = root;
    };

    private renderResultItem(model: ElementModel, presentOnDiagram: ReadonlySet<ElementIri>) {
        const {useDragAndDrop = DEFAULT_USE_DRAG_AND_DROP} = this.props;
        const canBeSelected = this.canBeSelected(model, presentOnDiagram);
        return (
            <ListElementView key={model.id}
                element={model}
                highlightText={this.props.highlightText}
                disabled={!canBeSelected}
                selected={this.props.selection.has(model.id)}
                onClick={canBeSelected ? this.onItemClick : undefined}
                onDragStart={useDragAndDrop ? e => {
                    const {selection} = this.props;
                    const iris: ElementIri[] = [];
                    selection.forEach(iri => iris.push(iri));
                    if (!selection.has(model.id)) {
                        iris.push(model.id);
                    }
                    return startDragElements(e, iris);
                } : undefined}
            />
        );
    }

    componentDidMount() {
        const {workspace: {model}} = this.props;
        this.listener.listen(model.events, 'changeCells', () => {
            this.delayedChangeCells.call(this.onChangeCells);
        });
    }

    private onChangeCells = () => {
        const {items, selection, workspace: {model}} = this.props;
        if (selection.size === 0) {
            if (items.length > 0) {
                // redraw "already on diagram" state
                this.forceUpdate();
            }
        } else {
            const newSelection = new Set(selection);
            for (const element of model.elements) {
                if (element instanceof EntityElement && selection.has(element.iri)) {
                    newSelection.delete(element.iri);
                }
            }
            this.updateSelection(newSelection);
        }
    };

    componentWillUnmount() {
        this.removeKeyListener();
        this.listener.stopListening();
        this.delayedChangeCells.dispose();
    }

    private updateSelection(selection: ReadonlySet<ElementIri>) {
        const {onSelectionChanged} = this.props;
        onSelectionChanged(selection);
    }

    private addKeyListener = () => {
        document.addEventListener('keydown', this.onKeyDown);
    };

    private removeKeyListener = () => {
        document.removeEventListener('keydown', this.onKeyDown);
    };

    private onKeyDown = (event: KeyboardEvent) => {
        const {items} = this.props;
        const isPressedUp = event.keyCode === 38 || event.which === 38;
        const isPressDown = event.keyCode === 40 || event.which === 40;

        if (isPressedUp || isPressDown) {
            if (event.shiftKey) { // select range
                if (isPressedUp) {
                    this.endSelection = this.getNextIndex(this.endSelection, Direction.Up);
                } else if (isPressDown) {
                    this.endSelection = this.getNextIndex(this.endSelection, Direction.Down);
                }
                const startIndex = Math.min(this.startSelection, this.endSelection);
                const finishIndex = Math.max(this.startSelection, this.endSelection);
                const selection = this.selectRange(startIndex, finishIndex);

                this.updateSelection(selection);
                this.focusOn(this.endSelection);
            } else { // change focus
                const startIndex = Math.min(this.startSelection, this.endSelection);
                const finishIndex = Math.max(this.startSelection, this.endSelection);

                if (isPressedUp) {
                    this.startSelection = this.getNextIndex(startIndex, Direction.Up);
                } else if (isPressDown) {
                    this.startSelection = this.getNextIndex(finishIndex, Direction.Down);
                }
                this.endSelection = this.startSelection;

                const focusElement = items[this.startSelection];
                const newSelection = new Set<ElementIri>();
                newSelection.add(focusElement.id);

                this.updateSelection(newSelection);
                this.focusOn(this.startSelection);
            }
        }
        event.preventDefault();
    };

    private onItemClick = (event: React.MouseEvent<any>, model: ElementModel) => {
        event.preventDefault();

        const {items, selection, onSelectionChanged, singleSelectOnClick} = this.props;
        const modelIndex = items.indexOf(model);

        let newSelection: Set<ElementIri>;

        if (event.shiftKey && this.startSelection !== -1) { // select range
            const start = Math.min(this.startSelection, modelIndex);
            const end = Math.max(this.startSelection, modelIndex);
            newSelection = this.selectRange(start, end);
        } else {
            this.endSelection = this.startSelection = modelIndex;
            const ctrlKey = event.ctrlKey || event.metaKey;

            if (!singleSelectOnClick || ctrlKey) {
                // select/deselect
                newSelection = new Set(selection);
                if (selection.has(model.id)) {
                    newSelection.delete(model.id);
                } else {
                    newSelection.add(model.id);
                }
            } else {
                // single click
                newSelection = new Set<ElementIri>();
                newSelection.add(model.id);
            }
        }

        onSelectionChanged(newSelection);
    };

    private selectRange(start: number, end: number): Set<ElementIri> {
        const {items, workspace: {model}} = this.props;
        const presentOnDiagram = computePresentOnDiagramEntities(model);
        const selection = new Set<ElementIri>();
        for (let i = start; i <= end; i++) {
            const selectedModel = items[i];
            if (this.canBeSelected(selectedModel, presentOnDiagram)) {
                selection.add(selectedModel.id);
            }
        }
        return selection;
    }

    private getNextIndex(startIndex: number, direction: Direction) {
        const {items, workspace: {model}} = this.props;
        if (items.length === 0) {
            return startIndex;
        }
        const presentOnDiagram = computePresentOnDiagramEntities(model);
        const indexDelta = direction === Direction.Up ? -1 : 1;
        for (let step = 1; step < items.length; step++) {
            let nextIndex = startIndex + step * indexDelta;
            if (nextIndex < 0) { nextIndex += items.length; }
            if (nextIndex >= items.length) { nextIndex -= items.length; }
            if (this.canBeSelected(items[nextIndex], presentOnDiagram)) {
                return nextIndex;
            }
        }
        return startIndex;
    }

    private canBeSelected(item: ElementModel, presentOnDiagram: ReadonlySet<ElementIri>) {
        const {useDragAndDrop = DEFAULT_USE_DRAG_AND_DROP} = this.props;
        return !useDragAndDrop || !presentOnDiagram.has(item.id);
    }

    private focusOn(index: number) {
        const scrollableContainer = this.root!.parentElement!;

        const containerBounds = scrollableContainer.getBoundingClientRect();

        const item = this.root!.children.item(index) as HTMLElement;
        const itemBounds = item.getBoundingClientRect();
        const itemTop = itemBounds.top - containerBounds.top;
        const itemBottom = itemBounds.bottom - containerBounds.top;

        if (itemTop < 0) {
            scrollableContainer.scrollTop += itemTop;
        } else if (itemBottom > containerBounds.height) {
            scrollableContainer.scrollTop += (itemBottom - containerBounds.height);
        }

        item.focus();
    }
}

function computePresentOnDiagramEntities(graph: DataGraphStructure): Set<ElementIri> {
    const presentOnDiagram = new Set<ElementIri>();
    for (const element of graph.elements) {
        for (const entity of iterateEntitiesOf(element)) {
            presentOnDiagram.add(entity.id);
        }
    }
    return presentOnDiagram;
}
