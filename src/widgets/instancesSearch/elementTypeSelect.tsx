import cx from 'clsx';
import * as React from 'react';

import { delay } from '../../coreUtils/async';
import { useTranslation } from '../../coreUtils/i18n';
import { useEventStore, useSyncStore } from '../../coreUtils/hooks';

import { ElementTypeIri, ElementTypeModel } from '../../data/model';
import { useFetchStatus } from '../../editor/withFetchStatus';
import { useWorkspace } from '../../workspace/workspaceContext';

import { Autocomplete } from '../utility/autocomplete';
import { ElementTypeView } from '../utility/elementTypeView';
import { useFocusGroupItem } from '../utility/focusGroup';

const CLASS_NAME = 'reactodia-element-type-select';

export function ElementTypeSelect(props: {
    selected: ElementTypeIri | undefined;
    setSelected: (item: ElementTypeModel | undefined) => void;
}) {
    const {selected, setSelected} = props;
    const t = useTranslation();
    const {model} = useWorkspace();    
    const {dataProvider} = model;

    const type = selected ? model.createElementType(selected) : undefined;
    const typeData = useSyncStore(
        useEventStore(type?.events, 'changeData'),
        () => type?.data
    );
    const typeStatus = useFetchStatus({type: 'elementType', target: type?.id});

    const suggest = React.useCallback(async (text: string) => {
        // await delay(2000);
        // if (Math.random() > 0.5) {
        //     throw new Error('Random error');
        // }
        const items = await dataProvider.lookupElementTypes({text});
        return items;
    }, [dataProvider]);
    return (
        <Autocomplete
            inlineContent={
                typeData ? (
                    <ElementTypeView elementType={typeData}
                        className={`${CLASS_NAME}__selected`}
                        sizeVariant='s'>
                        <button
                            className={cx(
                                `${CLASS_NAME}__selected-remove`,
                                'reactodia-btn reactodia-btn-default'
                            )}
                            onClick={() => setSelected(undefined)}
                        />
                    </ElementTypeView>
                ) : undefined
            }
            inlineStatus={typeStatus}
            suggest={suggest}
            sizeVariant='s'>
            {({items: suggestions, highlightText}) => (
                <ul className={`${CLASS_NAME}__items`}>
                    {suggestions.map(item => (
                        <ElementTypeAutocompleteItem key={item.id}
                            elementType={item}
                            highlightText={highlightText}
                            selected={item.id === selected}
                            onSelect={() => setSelected(item)}
                        />
                    ))}
                </ul>
            )}
        </Autocomplete>
    );
}

function ElementTypeAutocompleteItem(props: {
    elementType: ElementTypeModel;
    highlightText?: string;
    selected: boolean;
    onSelect: () => void;
}) {
    const {elementType, highlightText, selected, onSelect} = props;
    const {ref, tabIndex} = useFocusGroupItem({debugLabel: elementType.id});
    return (
        <li ref={ref} role='option'>
            <ElementTypeView tabIndex={tabIndex}
                elementType={elementType}
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
