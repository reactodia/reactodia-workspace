import * as React from 'react';
import classnames from 'classnames';

import { mapAbortedToNull } from '../coreUtils/async';
import { EventObserver } from '../coreUtils/events';

import { PLACEHOLDER_ELEMENT_TYPE } from '../data/schema';
import { ElementModel, ElementTypeIri } from '../data/model';
import { DataProviderLookupItem } from '../data/provider';

import { HtmlSpinner } from '../diagram/spinner';

import type { DataDiagramModel } from '../editor/dataDiagramModel';
import { EntityElement } from '../editor/dataElements';

import { ListElementView } from '../widgets/utility/listElementView';
import { NoSearchResults } from '../widgets/utility/noSearchResults';
import { SearchInput, SearchInputStore, useSearchInputStore } from '../widgets/utility/searchInput';
import { createRequest } from '../widgets/instancesSearch';

import { type WorkspaceContext, useWorkspace } from '../workspace/workspaceContext';

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

export function ElementTypeSelector(props: ElementTypeSelectorProps) {
    const searchStore = useSearchInputStore({
        initialValue: '',
        submitTimeout: 200,
    });
    const workspace = useWorkspace();
    return (
        <ElementTypeSelectorInner {...props}
            searchStore={searchStore}
            workspace={workspace}
        />
    );
}

interface ElementTypeSelectorInnerProps extends ElementTypeSelectorProps {
    searchStore: SearchInputStore;
    workspace: WorkspaceContext;
}

interface State {
    elementTypes?: ReadonlyArray<ElementTypeIri>;
    elementTypesState: 'none' | 'loading' | 'error';
    existingElements: ReadonlyArray<ElementModel>;
    existingElementsState: 'none' | 'loading' | 'error';
}

const CLASS_NAME = 'reactodia-element-selector';
const FORM_CLASS = 'reactodia-form';

export class ElementTypeSelectorInner extends React.Component<ElementTypeSelectorInnerProps, State> {
    private readonly listener = new EventObserver();
    private readonly cancellation = new AbortController();
    private filterCancellation = new AbortController();
    private loadingItemCancellation = new AbortController();

    constructor(props: ElementTypeSelectorInnerProps) {
        super(props);
        this.state = {
            elementTypesState: 'none',
            existingElements: [],
            existingElementsState: 'none',
        };
    }

    componentDidMount() {
        const {searchStore, workspace: {model}} = this.props;

        this.listener.listen(model.events, 'elementTypeEvent', ({data}) => {
            const {elementTypes} = this.state;
            const changeEvent = data.changeData;
            if (changeEvent && elementTypes && elementTypes.includes(changeEvent.source.id)) {
                this.forceUpdate();
            }
        });
        this.listener.listen(searchStore.events, 'changeValue', ({source}) => {
            if (source.value.length === 0) {
                // Clear the search
                this.searchExistingElements('');
            } else {
                this.forceUpdate();
            }
        });
        this.listener.listen(searchStore.events, 'executeSearch', ({value}) => {
            this.searchExistingElements(value);
        });

        this.fetchPossibleElementTypes();
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.cancellation.abort();
        this.filterCancellation.abort();
        this.loadingItemCancellation.abort();
    }

    private async fetchPossibleElementTypes() {
        const {source, workspace: {model, editor: {metadataProvider}}} = this.props;
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

    private async searchExistingElements(searchString: string) {
        const {workspace: {model}} = this.props;

        this.filterCancellation.abort();
        this.setState({existingElements: [], existingElementsState: 'none'});

        if (searchString.length > 0) {
            this.setState({existingElementsState: 'loading'});
            this.filterCancellation = new AbortController();
            const signal = this.filterCancellation.signal;

            const request = createRequest({text: searchString});
            let lookupItems: DataProviderLookupItem[] | null;
            try {
                lookupItems = await mapAbortedToNull(
                    model.dataProvider.lookup(request),
                    signal
                );
                if (lookupItems === null) {
                    return;
                }
            } catch (err) {
                console.error('Error looking up existing entities', err);
                this.setState({existingElementsState: 'error'});
                return;
            }

            const existingElements = lookupItems.map(linked => linked.element);
            this.setState({existingElements, existingElementsState: 'none'});
        }
    }

    private onElementTypeChange = async (e: React.FormEvent<HTMLSelectElement>) => {
        this.setState({elementTypesState: 'loading'});

        this.loadingItemCancellation.abort();
        this.loadingItemCancellation = new AbortController();
        const signal = this.loadingItemCancellation.signal;

        const {onChange, workspace: {editor: {metadataProvider}}} = this.props;
        const elementTypeIri = (e.target as HTMLSelectElement).value as ElementTypeIri;
        let elementModel: ElementModel | null;
        try {
            elementModel = await mapAbortedToNull(
                metadataProvider!.createEntity(elementTypeIri, {signal}),
                signal
            );
            if (elementModel === null) {
                return;
            }
        } catch (err) {
            console.error('Error calling MetadataProvider.createEntity()', err);
            this.setState({elementTypesState: 'error'});
            return;
        }

        this.setState({elementTypesState: 'none'});
        onChange({
            value: elementModel,
            isNew: true,
            loading: false,
        });
    };

    private renderPossibleElementType = (elementType: ElementTypeIri) => {
        const {workspace: {model, translation: t}} = this.props;
        const type = model.getElementType(elementType);
        const label = model.locale.formatLabel(type?.data?.label, elementType);
        return (
            <option key={elementType} value={elementType}>
                {t.template('visual_authoring.select_entity.entity_type.label', {
                    type: label,
                    typeIri: elementType,
                })}
            </option>
        );
    };

    private renderElementTypeSelector() {
        const {elementValue, workspace: {translation: t}} = this.props;
        const {elementTypes, elementTypesState} = this.state;
        const value = elementValue.value.types.length ? elementValue.value.types[0] : '';
        if (elementTypesState !== 'none') {
            return (
                <HtmlSpinner width={20} height={20}
                    errorOccurred={elementTypesState === 'error'}
                />
            );
        }
        return (
            <div className={`${FORM_CLASS}__control-row`}>
                <label>{t.text('visual_authoring.select_entity.type.label')}</label>
                {
                    elementTypes ? (
                        <select className='reactodia-form-control'
                            name='reactodia-element-type-selector-select'
                            value={value}
                            onChange={this.onElementTypeChange}>
                            <option value={PLACEHOLDER_ELEMENT_TYPE} disabled={true}>
                                {t.text('visual_authoring.select_entity.type.placeholder')}
                            </option>
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
        const {elementValue,  workspace: {model, editor}} = this.props;
        const {elementTypes, existingElements, existingElementsState} = this.state;
        if (existingElementsState !== 'none') {
            return (
                <div className={`${CLASS_NAME}__results-spinner`}>
                    <HtmlSpinner width={30} height={30}
                        errorOccurred={existingElementsState === 'error'}
                    />
                </div>
            );
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
        return <NoSearchResults hasQuery={true} />;
    }

    private async onSelectExistingItem(data: ElementModel) {
        const {onChange, workspace: {model}} = this.props;

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
        const {searchStore, workspace: {translation: t}} = this.props;
        return (
            <div className={classnames(`${FORM_CLASS}__row`, CLASS_NAME)}>
                <SearchInput store={searchStore}
                    className={`${CLASS_NAME}__search`}
                    inputProps={{
                        className: `${CLASS_NAME}__search-input`,
                        name: 'reactodia-element-type-selector-search',
                        autoFocus: true,
                    }}>
                    <span className={`${CLASS_NAME}__search-icon`} />
                </SearchInput>
                {
                    searchStore.value.length > 0 ? (
                        <div className={`${CLASS_NAME}__existing-elements-list`}
                            role='listbox'
                            aria-label={t.text('visual_authoring.select_entity.results.aria_label')}>
                            {this.renderExistingElementsList()}
                        </div>
                    ) : (
                        <div>
                            <div className={`${CLASS_NAME}__separator`}>
                                <i className={`${CLASS_NAME}__separator-text`}>
                                    {t.text('visual_authoring.select_entity.separator.label')}
                                </i>
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
    element: ElementModel,
    workspace: WorkspaceContext
): Promise<Pick<ElementValue, 'error' | 'allowChange'>> {
    const {translation: t} = workspace;
    const isElementTypeSelected = element.types.indexOf(PLACEHOLDER_ELEMENT_TYPE) < 0;
    const error = isElementTypeSelected
        ? undefined
        : t.text('visual_authoring.select_entity.validation.error_required');
    return Promise.resolve({error, allowChange: true});
}
