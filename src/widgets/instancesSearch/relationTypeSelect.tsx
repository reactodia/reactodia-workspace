import cx from 'clsx';
import * as React from 'react';

import { delay } from '../../coreUtils/async';

import { LinkTypeModel } from '../../data/model';
import { DataProvider } from '../../data/dataProvider';

import { HtmlSpinner } from '../../diagram/spinner';

import { Autocomplete } from '../utility/autocomplete';
import { useFocusGroupItem } from '../utility/focusGroup';
import { InlineEntity } from '../utility/inlineEntity';
import { ListElementView } from '../utility/listElementView';

const CLASS_NAME = 'reactodia-relation-type-select';

export function RelationTypeSelect(props: {
    dataProvider: DataProvider;
    isLoading: boolean;
    selected: readonly LinkTypeModel[];
    setSelected: (
        update: (previous: readonly LinkTypeModel[]) => readonly LinkTypeModel[]
    ) => void;
}) {
    const {dataProvider, isLoading, selected, setSelected} = props;
    const suggest = React.useCallback(async (text: string) => {
        // await delay(2000);
        // if (Math.random() > 0.5) {
        //     throw new Error('Random error');
        // }
        return dataProvider.lookupLinkTypes({text});
    }, [dataProvider]);
    const selectedSet = React.useMemo(() => new Set(selected.map(v => v.id)), [selected]);
    return (
        <Autocomplete
            slotItems={
                <>
                    {selected.map(item =>
                        <InlineEntity key={item.id}
                            className={`${CLASS_NAME}__entity`}
                            target={item}
                            block>
                            <button
                                className={cx(
                                    `${CLASS_NAME}__entity-remove`,
                                    'reactodia-btn reactodia-btn-default'
                                )}
                                onClick={() => {
                                    setSelected(previous => previous.filter(v => v.id !== item.id));
                                }}
                            />
                        </InlineEntity>
                    )}
                    {isLoading ? (
                        <HtmlSpinner width={16} height={16} />
                    ) : null}
                </>
            }
            suggest={suggest}
            onSelect={() => {/**/}}
            size='s'>
            {({items: suggestions, highlightText}) => (
                <ul className={`${CLASS_NAME}__items`}>
                    {suggestions.map(item => (
                        <EntityAutocompleteItem key={item.id}
                            linkType={item}
                            highlightText={highlightText}
                            selected={selectedSet.has(item.id)}
                            onSelect={() => setSelected(previous => {
                                return previous.some(v => v.id === item.id)
                                    ? previous.filter(v => v.id !== item.id)
                                    : [...previous, item];
                            })}
                        />
                    ))}
                </ul>
            )}
        </Autocomplete>
    );
}

function EntityAutocompleteItem(props: {
    linkType: LinkTypeModel;
    highlightText?: string;
    selected: boolean;
    onSelect: () => void;
}) {
    const {linkType, highlightText, selected, onSelect} = props;
    const {ref, tabIndex} = useFocusGroupItem({debugLabel: linkType.id});
    return (
        <li ref={ref}>
            <ListElementView tabIndex={tabIndex}
                element={element}
                highlightText={highlightText}
                selected={selected}
                onClick={onSelect}
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
