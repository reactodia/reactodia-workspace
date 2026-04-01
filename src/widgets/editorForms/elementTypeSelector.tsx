import cx from 'clsx';
import * as React from 'react';

import { mapAbortedToNull } from '../../coreUtils/async';
import { EventObserver } from '../../coreUtils/events';
import {
    useEventStore, useFrameDebouncedStore, useObservedProperty, useSyncStore,
} from '../../coreUtils/hooks';
import { useTranslation, type Translation } from '../../coreUtils/i18n';
import { useKeyedSyncStore } from '../../coreUtils/keyedObserver';

import { PlaceholderEntityType } from '../../data/schema';
import type { ElementModel, ElementTypeIri } from '../../data/model';
import type { DataProviderLookupItem } from '../../data/dataProvider';
import type { MetadataCreatedEntity } from '../../data/metadataProvider';

import { HtmlSpinner } from '../../diagram/spinner';

import { type DataDiagramModel, getAllPresentEntities } from '../../editor/dataDiagramModel';
import { EntityElement } from '../../editor/dataElements';
import { subscribeElementTypes } from '../../editor/observedElement';

import { ListElementView } from '../utility/listElementView';
import { NoSearchResults } from '../utility/noSearchResults';
import { SearchInput, SearchInputStore, useSearchInputStore } from '../utility/searchInput';
import { SearchResults } from '../utility/searchResults';
import { createRequest } from '../instancesSearch';

import { type WorkspaceContext, useWorkspace } from '../../workspace/workspaceContext';

export interface ElementTypeSelectorProps {
    source: ElementModel;
    elementValue: ElementValue;
    onChange: (state: Pick<ElementValue, 'value' | 'isNew' | 'loading'>) => void;
}

export interface ElementValue {
    value: MetadataCreatedEntity;
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
    const translation = useTranslation();
    return (
        <ElementTypeSelectorInner {...props}
            searchStore={searchStore}
            workspace={workspace}
            translation={translation}
        />
    );
}

interface ElementTypeSelectorInnerProps extends ElementTypeSelectorProps {
    searchStore: SearchInputStore;
    workspace: WorkspaceContext;
    translation: Translation;
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
    private fetchTypesCancellation = new AbortController();
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

        this.listener.listen(searchStore.events, 'changeValue', ({source}) => {
            if (source.value.length === 0) {
                // Clear the search
                void this.searchExistingElements('');
            } else {
                this.forceUpdate();
            }
        });
        this.listener.listen(searchStore.events, 'executeSearch', ({value}) => {
            void this.searchExistingElements(value);
        });

        void this.fetchPossibleElementTypes();
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.fetchTypesCancellation.abort();
        this.filterCancellation.abort();
        this.loadingItemCancellation.abort();
    }

    private async fetchPossibleElementTypes() {
        const {
            source, workspace: {editor: {metadataProvider}}, translation: t,
        } = this.props;
        if (!metadataProvider) {
            return;
        }

        this.fetchTypesCancellation.abort();
        this.fetchTypesCancellation = new AbortController();
        const signal = this.fetchTypesCancellation.signal;

        const connections = await mapAbortedToNull(
            metadataProvider.canConnect(
                source,
                undefined,
                undefined,
                {signal}
            ),
            signal
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
        this.setState({elementTypes: Array.from(elementTypeSet)});
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

        const {
            onChange, workspace: {model, editor: {metadataProvider}}, translation: t,
        } = this.props;
        const elementTypeIri: ElementTypeIri = (e.target as HTMLSelectElement).value;
        let createdEntity: MetadataCreatedEntity | null;
        try {
            createdEntity = await mapAbortedToNull(
                metadataProvider!.createEntity(elementTypeIri, {
                    translation: t,
                    language: model.language,
                    signal,
                }),
                signal
            );
            if (createdEntity === null) {
                return;
            }
        } catch (err) {
            console.error('Error calling MetadataProvider.createEntity()', err);
            this.setState({elementTypesState: 'error'});
            return;
        }

        this.setState({elementTypesState: 'none'});
        onChange({
            value: createdEntity,
            isNew: true,
            loading: false,
        });
    };

    private renderElementTypeSelector() {
        const {elementValue, translation: t} = this.props;
        const {elementTypes, elementTypesState} = this.state;
        const value = elementValue.value.data.types.length ? elementValue.value.data.types[0] : '';
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
                            onChange={e => void this.onElementTypeChange(e)}>
                            <option value={PlaceholderEntityType} disabled={true}>
                                {t.text('visual_authoring.select_entity.type.placeholder')}
                            </option>
                            <ElementTypeOptions elementTypes={elementTypes} />
                        </select>
                    ) : <div><HtmlSpinner width={20} height={20} /></div>
                }
                {elementValue.error ? <span className={`${FORM_CLASS}__control-error`}>{elementValue.error}</span> : ''}
            </div>
        );
    }

    private renderExistingElementsList() {
        const {searchStore, elementValue} = this.props;
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

        return (
            <ExistingElementList
                items={existingElements}
                requiredElementTypes={elementTypes}
                selected={elementValue.isNew ? undefined : elementValue.value.data}
                onSelect={item => void this.onSelectExistingItem(item)}
                highlightText={searchStore.value}
            />
        );
    }

    private async onSelectExistingItem(data: ElementModel) {
        const {onChange, workspace: {model}} = this.props;

        this.loadingItemCancellation.abort();
        this.loadingItemCancellation = new AbortController();
        const signal = this.loadingItemCancellation.signal;

        onChange({value: {data}, isNew: false, loading: true});
        const result = await model.dataProvider.elements({elementIds: [data.id]});
        if (signal.aborted) { return; }

        const loadedModel = result.get(data.id)!;
        onChange({value: {data: loadedModel}, isNew: false, loading: false});
    }

    render() {
        const {searchStore, translation: t} = this.props;
        return (
            <div
                className={cx(
                    `${FORM_CLASS}__row`,
                    CLASS_NAME,
                    searchStore.value.length > 0 ? `${CLASS_NAME}--search-existing` : undefined
                )}>
                <SearchInput store={searchStore}
                    className={`${CLASS_NAME}__search`}
                    inputProps={{
                        className: `${CLASS_NAME}__search-input`,
                        name: 'reactodia-element-type-selector-search',
                        placeholder: t.textOptional('visual_authoring.select_entity.input.placeholder'),
                        autoFocus: true,
                    }}>
                    <span className={`${CLASS_NAME}__search-icon`} />
                </SearchInput>
                {
                    searchStore.value.length > 0 ? (
                        <div className={`${CLASS_NAME}__existing-elements-list`}
                            role='listbox'
                            aria-label={t.text('visual_authoring.select_entity.results.aria_label')}
                            tabIndex={-1}>
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

function ExistingElementList(props: {
    items: readonly ElementModel[];
    requiredElementTypes?: readonly ElementTypeIri[];
    selected: ElementModel | undefined;
    onSelect: (item: ElementModel) => void;
    highlightText?: string;
}) {
    const {items, requiredElementTypes, selected, onSelect, highlightText} = props;
    const {model, editor} = useWorkspace();

    const selectedIri = selected?.id;
    const selection = React.useMemo(
        () => new Set(selectedIri === undefined ? undefined : [selectedIri]),
        [selectedIri]
    );

    const cellsVersion = useSyncStore(
        useFrameDebouncedStore(
            useEventStore(model.events, 'changeCells')
        ),
        () => model.cellsVersion
    );
    const isEntityOnDiagram = React.useMemo(() => {
        const presentEntities = getAllPresentEntities(model);
        return (item: ElementModel) => presentEntities.has(item.id);
    }, [cellsVersion]);

    const temporaryState = useObservedProperty(
        editor.events,
        'changeTemporaryState',
        () => editor.temporaryState
    );

    const isItemDisabled = React.useCallback((item: ElementModel) => {
        const hasAppropriateType =
            requiredElementTypes && requiredElementTypes.some(type => item.types.includes(type));
        return (
            (isEntityOnDiagram(item) && !temporaryState.elements.has(item.id)) ||
            !hasAppropriateType
        );
    }, [isEntityOnDiagram, temporaryState, requiredElementTypes]);

    return (
        <SearchResults
            items={items}
            selection={selection}
            onSelectionChanged={nextSelection => {
                if (nextSelection.size === 1) {
                    const [nextIri] = nextSelection;
                    const nextItem = items.find(item => item.id === nextIri);
                    if (nextItem) {
                        onSelect(nextItem);
                    }
                }
            }}
            isItemDisabled={isItemDisabled}
            highlightText={highlightText}
            useDragAndDrop={false}
            multiSelection={false}
            footer={
                items.length === 0 ? <NoSearchResults hasQuery={true} /> : undefined
            }
        />
    );
}

function ElementTypeOptions(props: {
    elementTypes: readonly ElementTypeIri[];
}) {
    const {elementTypes} = props;
    const {model} = useWorkspace();
    const t = useTranslation();

    const language = useObservedProperty(model.events, 'changeLanguage', () => model.language);
    useKeyedSyncStore(subscribeElementTypes, elementTypes, model);
    const sortedTypes = [...elementTypes].sort(
        makeElementTypeComparatorByLabel(model, t, language)
    );

    return (
        <>
            {sortedTypes.map(elementType => {
                const type = model.getElementType(elementType);
                const label = t.formatLabel(type?.data?.label, elementType, language);
                return (
                    <option key={elementType} value={elementType}>
                        {t.text('visual_authoring.select_entity.entity_type.label', {
                            type: label,
                            typeIri: elementType,
                        })}
                    </option>
                );
            })}
        </>
    );
}

function makeElementTypeComparatorByLabel(model: DataDiagramModel, t: Translation, language: string) {
    return (a: ElementTypeIri, b: ElementTypeIri) => {
        const typeA = model.getElementType(a);
        const typeB = model.getElementType(b);
        const labelA = t.formatLabel(typeA?.data?.label, a, language);
        const labelB = t.formatLabel(typeB?.data?.label, b, language);
        return labelA.localeCompare(labelB);
    };
}

export function validateElementType(
    element: ElementModel,
    t: Translation
): Promise<Pick<ElementValue, 'error' | 'allowChange'>> {
    const isElementTypeSelected = element.types.indexOf(PlaceholderEntityType) < 0;
    const error = isElementTypeSelected
        ? undefined
        : t.text('visual_authoring.select_entity.validation.error_required');
    return Promise.resolve({error, allowChange: true});
}
