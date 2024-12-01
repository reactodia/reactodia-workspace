import * as React from 'react';
import classnames from 'classnames';

import { mapAbortedToNull } from '../coreUtils/async';
import { EventObserver } from '../coreUtils/events';

import { PLACEHOLDER_ELEMENT_TYPE } from '../data/schema';
import { ElementModel, ElementTypeIri } from '../data/model';

import { HtmlSpinner } from '../diagram/spinner';

import type { DataDiagramModel } from '../editor/dataDiagramModel';
import { EntityElement } from '../editor/dataElements';

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

const CLASS_NAME = 'reactodia-element-selector';
const FORM_CLASS = 'reactodia-form';

export class ElementTypeSelector extends React.Component<ElementTypeSelectorProps, State> {
    static contextType = WorkspaceContext;
    declare readonly context: WorkspaceContext;

    private readonly listener = new EventObserver();
    private readonly cancellation = new AbortController();
    private filterCancellation = new AbortController();
    private loadingItemCancellation = new AbortController();

    constructor(props: ElementTypeSelectorProps, context: any) {
        super(props, context);
        this.state = {searchString: '', existingElements: []};
    }

    componentDidMount() {
        const {model} = this.context;
        this.fetchPossibleElementTypes();
        this.listener.listen(model.events, 'elementTypeEvent', ({data}) => {
            const {elementTypes} = this.state;
            const changeEvent = data.changeData;
            if (changeEvent && elementTypes && elementTypes.includes(changeEvent.source.id)) {
                this.forceUpdate();
            }
        });
    }

    componentDidUpdate(prevProps: ElementTypeSelectorProps, prevState: State) {
        const {searchString} = this.state;
        if (searchString !== prevState.searchString) {
            this.searchExistingElements();
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.cancellation.abort();
        this.filterCancellation.abort();
        this.loadingItemCancellation.abort();
    }

    private async fetchPossibleElementTypes() {
        const {model, editor: {metadataProvider}} = this.context;
        const {source} = this.props;
        if (!metadataProvider) {
            return;
        }
        const connections = await mapAbortedToNull(
            metadataProvider.canConnect(
                source,
                undefined,
                undefined,
                {signal: this.cancellation.signal}
            ),
            this.cancellation.signal
        );
        if (connections === null) {
            return;
        }
        const elementTypeSet = new Set<ElementTypeIri>();
        for (const {targetTypes} of connections) {
            for (const type of targetTypes) {
                elementTypeSet.add(type);
            }
        }
        const elementTypes = Array.from(elementTypeSet)
            .sort(makeElementTypeComparatorByLabel(model));
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

        const {editor: {metadataProvider}} = this.context;
        const {onChange} = this.props;
        const elementTypeIri = (e.target as HTMLSelectElement).value as ElementTypeIri;
        const elementModel = await mapAbortedToNull(
            metadataProvider!.createEntity(elementTypeIri, {signal}),
            signal
        );
        if (elementModel === null) {
            return;
        }
        this.setState({isLoading: false});
        onChange({
            value: elementModel,
            isNew: true,
            loading: false,
        });
    };

    private renderPossibleElementType = (elementType: ElementTypeIri) => {
        const {model} = this.context;
        const type = model.getElementType(elementType);
        const label = model.locale.formatLabel(type?.data?.label, elementType);
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
            <div className={`${FORM_CLASS}__control-row`}>
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
                {elementValue.error ? <span className={`${FORM_CLASS}__control-error`}>{elementValue.error}</span> : ''}
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
                    model.elements.find((el) => el instanceof EntityElement && el.iri === element.id)
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
            <div className={classnames(`${FORM_CLASS}__row`, CLASS_NAME)}>
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

function makeElementTypeComparatorByLabel(model: DataDiagramModel) {
    return (a: ElementTypeIri, b: ElementTypeIri) => {
        const typeA = model.getElementType(a);
        const typeB = model.getElementType(b);
        const labelA = model.locale.formatLabel(typeA?.data?.label, a);
        const labelB = model.locale.formatLabel(typeB?.data?.label, b);
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
