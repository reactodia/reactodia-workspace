import cx from 'clsx';
import * as React from 'react';

import { delay } from '../../coreUtils/async';
import { useTranslation } from '../../coreUtils/i18n';

import {
    ElementTypeModel, PropertyTypeModel, LinkTypeModel, LinkDirection,
} from '../../data/model';
import { useFetchStatus } from '../../editor/withFetchStatus';
import { useWorkspace } from '../../workspace/workspaceContext';

import { Autocomplete } from '../utility/autocomplete';
import { useFocusGroupItem } from '../utility/focusGroup';
import { SchemaTypeView } from '../utility/schemaTypeView';

const CLASS_NAME = 'reactodia-schema-type-select';

type SchemaType = {
    elementType: ElementTypeModel;
    propertyType: PropertyTypeModel;
    linkType: LinkTypeModel;
};

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

    const typeStatus = useFetchStatus({type: typeKind, target: selected?.id});

    const suggest = React.useCallback(async (text: string) => {
        // await delay(2000);
        // if (Math.random() > 0.5) {
        //     throw new Error('Random error');
        // }
        switch (typeKind) {
            case 'elementType': {
                return dataProvider.lookupElementTypes({text});
            }
            case 'propertyType': {
                return dataProvider.lookupPropertyTypes({text});
            }
            case 'linkType': {
                return dataProvider.lookupLinkTypes({text});
            }
        }
    }, [typeKind, dataProvider]) as (text: string) => Promise<SchemaType[Kind][]>;

    return (
        <Autocomplete className={CLASS_NAME}
            inlineContent={
                selected ? (
                    <SchemaTypeView schemaType={selected}
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
            sizeVariant='s'>
            {({items: suggestions, highlightText}) => (
                <ul className={`${CLASS_NAME}__items`}>
                    {suggestions.map(item => (
                        <SchemaTypeAutocompleteItem key={item.id}
                            schemaType={item}
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

function SchemaTypeAutocompleteItem<Kind extends keyof SchemaType>(props: {
    schemaType: SchemaType[Kind];
    highlightText?: string;
    selected: boolean;
    onSelect: () => void;
}) {
    const {schemaType, highlightText, selected, onSelect} = props;
    const {ref, tabIndex} = useFocusGroupItem({debugLabel: schemaType.id});
    return (
        <li ref={ref} role='option'>
            <SchemaTypeView tabIndex={tabIndex}
                schemaType={schemaType}
                selected={selected}
                highlightText={highlightText}
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
