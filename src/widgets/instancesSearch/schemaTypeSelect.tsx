import cx from 'clsx';
import * as React from 'react';

import { delay } from '../../coreUtils/async';
import { useObservedProperty } from '../../coreUtils/hooks';
import { Translation, useTranslation } from '../../coreUtils/i18n';
import { KeyedSyncStore, useKeyedSyncStore } from '../../coreUtils/keyedObserver';

import {
    ElementTypeIri, PropertyTypeIri, LinkTypeIri, LinkDirection,
} from '../../data/model';
import * as Rdf from '../../data/rdf/rdfModel';
import { DataDiagramModel } from '../../editor/dataDiagramModel';
import { iterateEntitiesOf, iterateRelationsOf } from '../../editor/dataElements';
import {
    subscribeElementTypes, subscribeLinkTypes, subscribePropertyTypes,
} from '../../editor/observedElement';
import { useFetchStatus } from '../../editor/withFetchStatus';
import { useWorkspace } from '../../workspace/workspaceContext';

import { Autocomplete } from '../utility/autocomplete';
import { useFocusGroupItem } from '../utility/focusGroup';
import { SchemaType, SchemaTypeView } from '../utility/schemaTypeView';

const CLASS_NAME = 'reactodia-schema-type-select';

interface SchemaTypeSelectProps<Kind extends keyof SchemaType> {
    typeKind: Kind;
    selected: SchemaType[Kind] | undefined;
    setSelected: (item: SchemaType[Kind] | undefined) => void;
}

export function SchemaTypeSelect<Kind extends keyof SchemaType>(
    props: SchemaTypeSelectProps<Kind>
) {
    const {typeKind, selected, setSelected} = props;
    const t = useTranslation();
    const {model} = useWorkspace();    
    const {dataProvider} = model;

    const language = useObservedProperty(model.events, 'changeLanguage', () => model.language);

    const typeStatus = useFetchStatus({type: typeKind, target: selected?.id});

    const suggest = React.useCallback(async (text: string, options: { signal: AbortSignal }) => {
        const {signal} = options;
        // await delay(2000);
        // if (Math.random() > 0.5) {
        //     throw new Error('Random error');
        // }
        switch (typeKind) {
            case 'elementType': {
                return dataProvider.lookupElementTypes({text, signal});
            }
            case 'propertyType': {
                return dataProvider.lookupPropertyTypes({text, signal});
            }
            case 'linkType': {
                return dataProvider.lookupLinkTypes({text, signal});
            }
        }
    }, [typeKind, dataProvider]) as (text: string) => Promise<SchemaType[Kind][]>;

    const suggestDefault = React.useCallback(
        async (
            options: { signal: AbortSignal }
        ): Promise<readonly SchemaType[keyof SchemaType][]> => {
            const {signal} = options;
            // await delay(2000);
            // if (Math.random() > 0.5) {
            //     throw new Error('Random error');
            // }
            switch (typeKind) {
                case 'elementType': {
                    const {elementTypes} = await dataProvider.knownElementTypes({signal});
                    return elementTypes;
                }
                case 'propertyType': {
                    const propertyTypeIds = getPresentPropertyTypes(model);
                    const propertyTypes = await dataProvider.propertyTypes({
                        propertyIds: Array.from(propertyTypeIds),
                        signal,
                    });
                    return Array.from(propertyTypes.values());
                }
                case 'linkType': {
                    const linkTypeIds = getPresentLinkTypes(model);
                    const linkTypes = await dataProvider.linkTypes({
                        linkTypeIds: Array.from(linkTypeIds),
                        signal,
                    });
                    return Array.from(linkTypes.values());
                }
            }
        },
        [typeKind, model, dataProvider]
    ) as () => Promise<SchemaType[Kind][]>;

    const comparator = React.useMemo(
        () => makeSchemaTypesComparator(t, language),
        [t, language]
    );

    return (
        <Autocomplete className={CLASS_NAME}
            inlineContent={
                selected ? (
                    <SchemaTypeView typeKind={typeKind}
                        typeData={selected}
                        className={`${CLASS_NAME}__selected`}
                        sizeVariant='s'>
                        <button
                            className={cx(
                                `${CLASS_NAME}__selected-remove`,
                                'reactodia-btn reactodia-btn-default'
                            )}
                            onClick={() => setSelected(undefined)}
                        />
                    </SchemaTypeView>
                ) : undefined
            }
            inlineStatus={typeStatus}
            suggest={suggest}
            suggestDefault={suggestDefault}
            suggestDefaultComparator={comparator}
            sizeVariant='s'>
            {({items: suggestions, highlightText}) => (
                <ul className={`${CLASS_NAME}__items`}>
                    {suggestions.map(item => (
                        <SchemaTypeAutocompleteItem key={item.id}
                            typeKind={typeKind}
                            typeData={item}
                            highlightText={highlightText}
                            selected={item.id === selected?.id}
                            onSelect={() => setSelected(item)}
                        />
                    ))}
                </ul>
            )}
        </Autocomplete>
    );
}

function getPresentPropertyTypes(model: DataDiagramModel): Set<PropertyTypeIri> {
    const propertyTypeIds = new Set<PropertyTypeIri>();
    for (const element of model.elements) {
        for (const entity of iterateEntitiesOf(element)) {
            for (const propertyTypeId of Object.keys(entity.properties)) {
                propertyTypeIds.add(propertyTypeId);
            }
        }
    }
    return propertyTypeIds;
}

function getPresentLinkTypes(model: DataDiagramModel): Set<LinkTypeIri> {
    const linkTypeIds = new Set<LinkTypeIri>();
    for (const link of model.links) {
        for (const relation of iterateRelationsOf(link)) {
            linkTypeIds.add(relation.linkTypeId);
        }
    }
    return linkTypeIds;
}

function makeSchemaTypesComparator(
    t: Translation,
    language: string
) {
    return (
        a: {
            readonly id: string;
            readonly label: readonly Rdf.Literal[];
        },
        b: {
            readonly id: string;
            readonly label: readonly Rdf.Literal[];
        }
    ): number => {
        const aLabel = t.formatLabel(a.label, a.id, language);
        const bLabel = t.formatLabel(b.label, b.id, language);
        return aLabel.localeCompare(bLabel);
    };
}

function SchemaTypeAutocompleteItem<Kind extends keyof SchemaType>(props: {
    typeKind: Kind;
    typeData: SchemaType[Kind];
    highlightText?: string;
    selected: boolean;
    onSelect: () => void;
}) {
    const {typeKind, typeData, highlightText, selected, onSelect} = props;
    const {ref, tabIndex} = useFocusGroupItem({debugLabel: typeData.id});
    return (
        <li ref={ref} role='option'>
            <SchemaTypeView typeKind={typeKind}
                typeData={typeData}
                selected={selected}
                highlightText={highlightText}
                className={`${CLASS_NAME}__item`}
                tabIndex={tabIndex}
                onClick={e => {
                    e.preventDefault();
                    onSelect();
                }}
                onKeyDown={e => {
                    if (e.key === ' ') {
                        e.preventDefault();
                        onSelect();
                    }
                }}
            />
        </li>
    );
}

export function useSchemaType<Kind extends keyof SchemaType>(
    typeKind: Kind,
    typeId: SchemaType[Kind]['id'] | undefined
): SchemaType[Kind] | undefined {
    const {model} = useWorkspace();

    type SubscribeTypes = KeyedSyncStore<SchemaType[Kind]['id'], typeof model>;
    let subscribeTypes: SubscribeTypes;
    let typeData: SchemaType[keyof SchemaType] | undefined;

    switch (typeKind) {
        case 'elementType': {
            const elementTypeId = typeId as ElementTypeIri;
            subscribeTypes = subscribeElementTypes as SubscribeTypes;
            if (typeId) {
                const data: SchemaType['elementType'] =
                    model.createElementType(elementTypeId).data ?? {
                        id: elementTypeId,
                        label: [],
                    };
                typeData = data;
            }
            break;
        }
        case 'propertyType': {
            const propertyTypeId = typeId as PropertyTypeIri;
            subscribeTypes = subscribePropertyTypes as SubscribeTypes;
            if (typeId) {
                const data: SchemaType['propertyType'] =
                    model.createPropertyType(propertyTypeId).data ?? {
                        id: propertyTypeId,
                        label: [],
                    };
                typeData = data;
            }
            break;
        }
        case 'linkType': {
            const linkTypeId = typeId as LinkTypeIri;
            subscribeTypes = subscribeLinkTypes as SubscribeTypes;
            if (typeId) {
                const data: SchemaType['linkType'] =
                    model.createLinkType(linkTypeId).data ?? {
                        id: linkTypeId,
                        label: [],
                    };
                typeData = data;
            }
            break;
        }
        default: {
            throw new Error(`Unexpected type kind: ${typeKind}`);
        }
    }

    useKeyedSyncStore(subscribeTypes, typeId ? [typeId] : [], model);
    return typeData as SchemaType[Kind] | undefined;
}

export function LinkDirectionSelect(props: {
    selected: LinkDirection | undefined;
    setSelected: (direction: LinkDirection | undefined) => void;
}) {
    const {selected, setSelected} = props;
    return (
        <select className={`${CLASS_NAME}__select-direction`}
            value={selected ?? ''}
            onChange={e => {
                const direction = e.currentTarget.value
                    ? e.currentTarget.value as LinkDirection
                    : undefined;
                setSelected(direction);
            }}>
            <option value=''>in or out</option>
            <option value={'in' satisfies LinkDirection}>in</option>
            <option value={'out' satisfies LinkDirection}>out</option>
        </select>
    );
}
