import * as React from 'react';
import cx from 'clsx';

import { useObservedProperty } from '../../coreUtils/hooks';
import { useTranslation } from '../../coreUtils/i18n';

import type { ElementIri, ElementModel } from '../../data/model';
import { makeCaseInsensitiveFilter } from '../../data/utils';
import { getAllPresentEntities } from '../../editor/dataDiagramModel';

import { SearchResults } from '../utility/searchResults';

import { useWorkspace } from '../../workspace/workspaceContext';

import {
    ObjectsData, LinkDataChunk, ObjectPlacingMode,
    CLASS_NAME, LINK_COUNT_PER_PAGE, LoadingSpinner,
} from './menuCommon';

export function EntityList(props: {
    data: ObjectsData;
    isLoading?: boolean;
    filterKey?: string;
    onPressAddSelected: (selected: ElementModel[], mode: ObjectPlacingMode) => void;
    onMoveToFilter: ((linkDataChunk: LinkDataChunk) => void) | undefined;
}) {
    const {data, isLoading, filterKey, onPressAddSelected, onMoveToFilter} = props;
    const {model} = useWorkspace();
    const t = useTranslation();
    const language = useObservedProperty(model.events, 'changeLanguage', () => model.language);

    const [selection, setSelection] = React.useState<ReadonlySet<ElementIri>>(
        () => new Set<ElementIri>()
    );

    const objects = React.useMemo(() => {
        if (!filterKey) {
            return data.elements;
        }
        const textFilter = makeCaseInsensitiveFilter(filterKey);
        return data.elements.filter(element => {
            const text = model.locale.formatEntityLabel(element, language);
            return textFilter(text);
        });
    }, [data.elements, filterKey, language]);

    const presentEntities = getAllPresentEntities(model);
    const isAllSelected = objects.every(item =>
        presentEntities.has(item.id) || selection.has(item.id)
    );

    const nonPresented = objects.filter(item => !presentEntities.has(item.id));
    const active = nonPresented.filter(item => selection.has(item.id));
    const selectedItems = active.length > 0 ? active : nonPresented;

    const countString = t.text('connections_menu.entities.counter_label', {
        count: active.length,
        total: data.elements.length,
    });

    let extraCountInfo: React.ReactElement | null = null;
    if (data.chunk.expectedCount !== 'some') {
        const extraCount =
            data.elements.length - Math.min(LINK_COUNT_PER_PAGE, data.chunk.expectedCount);
        const extra = Math.abs(extraCount) > LINK_COUNT_PER_PAGE ?
            `${LINK_COUNT_PER_PAGE}+` : Math.abs(extraCount).toString();
        extraCountInfo = (
            <span className={`${CLASS_NAME}__objects-extra`}
                title={extraCount === 0 ? undefined : (
                    extraCount > 0
                        ? t.text('connections_menu.entities.extra_title', {value: extra})
                        : t.text('connections_menu.entities.missing_title', {value: extra})
                )}>
                {extraCount === 0 ? null : (
                    extraCount > 0
                        ? t.text('connections_menu.entities.extra_label', {value: extra})
                        : t.text('connections_menu.entities.missing_label', {value: extra})
                )}
            </span>
        );
    }

    const counter = (
        <div className={`${CLASS_NAME}__objects-count`}>
            <span>{countString}</span>
            {extraCountInfo}
        </div>
    );

    return (
        <div className={`${CLASS_NAME}__objects`}>
            <div className={`${CLASS_NAME}__objects-select-all`}>
                <label>
                    <input type='checkbox'
                        name='reactodia-connections-menu-select-all'
                        checked={isAllSelected && nonPresented.length > 0}
                        onChange={() => setSelection(new Set<ElementIri>(
                            isAllSelected ? [] : nonPresented.map(item => item.id)
                        ))}
                        disabled={nonPresented.length === 0}
                        title={t.text('connections_menu.select_all.title')}
                    />
                    <span>{t.text('connections_menu.select_all.label')}</span>
                </label>
                <div className={`${CLASS_NAME}__objects-spacer`} aria-hidden='true' />
                {counter}
            </div>
            {isLoading ? (
                <div className={`${CLASS_NAME}__objects-loading`}>
                    <LoadingSpinner />
                </div>
            ) : objects.length === 0 ? (
                <div className={`${CLASS_NAME}__objects-no-results`}>
                    {t.text('connections_menu.entities.no_results')}
                </div>
            ) : (
                <div className={`${CLASS_NAME}__objects-list`} tabIndex={-1}>
                    <SearchResults
                        items={objects}
                        selection={selection}
                        onSelectionChanged={setSelection}
                        highlightText={filterKey}
                    />
                    {data.chunk.expectedCount !== 'some' && data.chunk.expectedCount > LINK_COUNT_PER_PAGE ? (
                        onMoveToFilter ? (
                            <div className={`${CLASS_NAME}__move-to-filter`}
                                onClick={() => onMoveToFilter(data.chunk)}>
                                {t.text('connections_menu.entities.truncated_results_expand', {
                                    limit: LINK_COUNT_PER_PAGE,
                                })}
                            </div>
                        ) : (
                            <div className={`${CLASS_NAME}__move-to-filter`}>
                                {t.text('connections_menu.entities.truncated_results', {
                                    limit: LINK_COUNT_PER_PAGE,
                                })}
                            </div>
                        )
                    ) : null}
                </div>
            )}
            <div className={`${CLASS_NAME}__objects-statusbar`}>
                <button
                    className={cx(
                        `${CLASS_NAME}__objects-add-button`,
                        'reactodia-btn reactodia-btn-secondary'
                    )}
                    disabled={isLoading || selectedItems.length <= 1}
                    onClick={() => onPressAddSelected(selectedItems, 'grouped')}>
                    {t.text('connections_menu.entities.add_group')}
                </button>
                <button
                    className={cx(
                        `${CLASS_NAME}__objects-add-button`,
                        'reactodia-btn reactodia-btn-primary'
                    )}
                    disabled={isLoading || nonPresented.length === 0}
                    onClick={() => onPressAddSelected(selectedItems, 'separately')}>
                    {active.length > 0
                        ? t.text('connections_menu.entities.add_selected')
                        : t.text('connections_menu.entities.add_all')
                    }
                </button>
            </div>
        </div>
    );
}
