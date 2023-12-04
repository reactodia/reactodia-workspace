import * as React from 'react';

import { mapAbortedToNull } from '../coreUtils/async';

import { PLACEHOLDER_ELEMENT_TYPE } from '../data/schema';
import { ElementModel, ElementTypeIri } from '../data/model';

import { DiagramModel } from '../diagram/model';
import { HtmlSpinner } from '../diagram/spinner';

import { createRequest } from '../widgets/instancesSearch';
import { ListElementView } from '../widgets/listElementView';

import { WorkspaceContext } from '../workspace/workspaceContext';

export interface ElementTypeSelectorProps {
    source: ElementModel;
    elementValue: ElementValue;
    onChange: (state: Pick<ElementValue, 'value' | 'isNew' | 'loading'>) => void;
}

export interface ElementValue {
    value: ElementModel;
    isNew: boolean;
    loading: boolean;
    error?: string;
    validated: boolean;
    allowChange: boolean;
}

interface State {
    elementTypes?: ReadonlyArray<ElementTypeIri>;
    searchString: string;
    isLoading?: boolean;
    existingElements: ReadonlyArray<ElementModel>;
}

const CLASS_NAME = 'reactodia-edit-form';

export class ElementTypeSelector extends React.Component<ElementTypeSelectorProps, State> {
    static contextType = WorkspaceContext;
    declare readonly context: WorkspaceContext;

    private readonly cancellation = new AbortController();
    private filterCancellation = new AbortController();
    private loadingItemCancellation = new AbortController();

    constructor(props: ElementTypeSelectorProps, context: any) {
        super(props, context);
        this.state = {searchString: '', existingElements: []};
    }

    componentDidMount() {
        this.fetchPossibleElementTypes();
    }

    componentDidUpdate(prevProps: ElementTypeSelectorProps, prevState: State) {
        const {searchString} = this.state;
        if (searchString !== prevState.searchString) {
            this.searchExistingElements();
        }
    }

    componentWillUnmount() {
        this.cancellation.abort();
        this.filterCancellation.abort();
        this.loadingItemCancellation.abort();
    }

    private async fetchPossibleElementTypes() {
        const {model, editor: {metadataApi}} = this.context;
        const {source} = this.props;
        if (!metadataApi) {
            return;
        }
        const elementTypes = await mapAbortedToNull(
            metadataApi.typesOfElementsDraggedFrom(source, this.cancellation.signal),
            this.cancellation.signal
        );
        if (elementTypes === null) { return; }
        elementTypes.sort(makeElementTypeComparatorByLabel(model));
        this.setState({elementTypes});
    }

    private searchExistingElements() {
        const {model} = this.context;
        const {searchString} = this.state;
        this.setState({existingElements: []});
        if (searchString.length > 0) {
            this.setState({isLoading: true});

            this.filterCancellation.abort();
            this.filterCancellation = new AbortController();
            const signal = this.filterCancellation.signal;

            const request = createRequest({text: searchString});
            model.dataProvider.lookup(request).then(elements => {
                if (signal.aborted) { return; }
                const existingElements = elements.map(linked => linked.element);
                this.setState({existingElements, isLoading: false});
            });
        }
    }

    private onElementTypeChange = async (e: React.FormEvent<HTMLSelectElement>) => {
        this.setState({isLoading: true});

        this.loadingItemCancellation.abort();
        this.loadingItemCancellation = new AbortController();
        const signal = this.loadingItemCancellation.signal;

        const {editor: {metadataApi}} = this.context;
        const {onChange} = this.props;
        const classId = (e.target as HTMLSelectElement).value as ElementTypeIri;
        const elementModel = await mapAbortedToNull(
            metadataApi!.generateNewElement([classId], signal),
            signal
        );
        if (elementModel === null) { return; }
        this.setState({isLoading: false});
        onChange({
            value: elementModel,
            isNew: true,
            loading: false,
        });
    };

    private renderPossibleElementType = (elementType: ElementTypeIri) => {
        const {model} = this.context;
        const type = model.createElementType(elementType);
        const label = model.locale.formatLabel(type.label, type.id);
        return <option key={elementType} value={elementType}>{label}</option>;
    };

    private renderElementTypeSelector() {
        const {elementValue} = this.props;
        const {elementTypes, isLoading} = this.state;
        const value = elementValue.value.types.length ? elementValue.value.types[0] : '';
        if (isLoading) {
            return <HtmlSpinner width={20} height={20} />;
        }
        return (
            <div className={`${CLASS_NAME}__control-row`}>
                <label>Entity Type</label>
                {
                    elementTypes ? (
                        <select className='reactodia-form-control'
                            name='reactodia-element-type-selector-select'
                            value={value}
                            onChange={this.onElementTypeChange}>
                            <option value={PLACEHOLDER_ELEMENT_TYPE} disabled={true}>Select entity type</option>
                            {
                                elementTypes.map(this.renderPossibleElementType)
                            }
                        </select>
                    ) : <div><HtmlSpinner width={20} height={20} /></div>
                }
                {elementValue.error ? <span className={`${CLASS_NAME}__control-error`}>{elementValue.error}</span> : ''}
            </div>
        );
    }

    private renderExistingElementsList() {
        const {model, editor} = this.context;
        const {elementValue} = this.props;
        const {elementTypes, isLoading, existingElements} = this.state;
        if (isLoading) {
            return <HtmlSpinner width={20} height={20} />;
        }
        if (existingElements.length > 0) {
            return existingElements.map(element => {
                const isAlreadyOnDiagram = !editor.temporaryState.elements.has(element.id) && Boolean(
                    model.elements.find(({iri, group}) => iri === element.id && group === undefined)
                );
                const hasAppropriateType = Boolean(
                    elementTypes && elementTypes.find(type => element.types.indexOf(type) >= 0)
                );
                return (
                    <ListElementView key={element.id}
                        element={element}
                        disabled={isAlreadyOnDiagram || !hasAppropriateType}
                        selected={element.id === elementValue.value.id}
                        onClick={(e, model) => this.onSelectExistingItem(model)}
                    />
                );
            });
        }
        return <span>No results</span>;
    }

    private async onSelectExistingItem(data: ElementModel) {
        const {model} = this.context;
        const {onChange} = this.props;

        this.loadingItemCancellation.abort();
        this.loadingItemCancellation = new AbortController();
        const signal = this.loadingItemCancellation.signal;

        onChange({value: data, isNew: false, loading: true});
        const result = await model.dataProvider.elements({elementIds: [data.id]});
        if (signal.aborted) { return; }

        const loadedModel = result.get(data.id)!;
        onChange({value: loadedModel, isNew: false, loading: false});
    }

    render() {
        const {searchString} = this.state;
        return (
            <div className={`${CLASS_NAME}__form-row ${CLASS_NAME}__element-selector`}>
                <div className={`${CLASS_NAME}__search`}>
                    <span className={`${CLASS_NAME}__search-icon`} />
                    <input className={`reactodia-form-control ${CLASS_NAME}__search-input`}
                        placeholder='Search for...'
                        name='reactodia-element-type-selector-search'
                        autoFocus
                        value={searchString}
                        onChange={e => this.setState({searchString: (e.target as HTMLInputElement).value})}
                    />
                </div>
                {
                    searchString.length > 0 ? (
                        <div className={`${CLASS_NAME}__existing-elements-list`}
                            role='listbox'
                            aria-label='Select an existing element to put on a diagram'>
                            {this.renderExistingElementsList()}
                        </div>
                    ) : (
                        <div>
                            <div className={`${CLASS_NAME}__separator`}>
                                <i className={`${CLASS_NAME}__separator-text`}>or create new entity</i>
                            </div>
                            {this.renderElementTypeSelector()}
                        </div>
                    )
                }
            </div>
        );
    }
}

function makeElementTypeComparatorByLabel(model: DiagramModel) {
    return (a: ElementTypeIri, b: ElementTypeIri) => {
        const typeA = model.createElementType(a);
        const typeB = model.createElementType(b);
        const labelA = model.locale.formatLabel(typeA.label, typeA.id);
        const labelB = model.locale.formatLabel(typeB.label, typeB.id);
        return labelA.localeCompare(labelB);
    };
}

export function validateElementType(
    element: ElementModel
): Promise<Pick<ElementValue, 'error' | 'allowChange'>> {
    const isElementTypeSelected = element.types.indexOf(PLACEHOLDER_ELEMENT_TYPE) < 0;
    const error = !isElementTypeSelected ? 'Required.' : undefined;
    return Promise.resolve({error, allowChange: true});
}
