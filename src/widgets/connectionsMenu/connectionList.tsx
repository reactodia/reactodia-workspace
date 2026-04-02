import * as React from 'react';
import cx from 'clsx';

import { type Translation, useTranslation } from '../../coreUtils/i18n';

import type { LinkTypeModel } from '../../data/model';
import { generate128BitID, makeCaseInsensitiveFilter } from '../../data/utils';
import { WithFetchStatus } from '../../editor/withFetchStatus';

import { highlightSubstring } from '../utility/listElementView';
import {
    TreeList, type TreeListModel, type TreeListRenderItem, type TreeListFocusProps,
} from '../utility/treeList';

import { useWorkspace } from '../../workspace/workspaceContext';

import {
    SortMode, ConnectionsData, ConnectionSuggestions, LinkDataChunk,
    CLASS_NAME, LINK_COUNT_PER_PAGE,
} from './menuCommon';

export function ConnectionsList(props: {
    data: ConnectionsData;
    filterKey: string;
    sortMode: SortMode;
    suggestions: ConnectionSuggestions;

    allRelatedLink: LinkTypeModel;
    onExpandLink: (chunk: LinkDataChunk) => void;
    onMoveToFilter: ((chunk: LinkDataChunk) => void) | undefined;

    scrolledListRef: React.RefObject<HTMLUListElement | null>;
}) {
    const {
        data, filterKey, sortMode, suggestions,
        allRelatedLink, onExpandLink, onMoveToFilter, scrolledListRef,
    } = props;
    const {model} = useWorkspace();
    const t = useTranslation();

    const isSmartMode = sortMode === 'smart' && !filterKey;

    const textFilter = filterKey ? makeCaseInsensitiveFilter(filterKey) : undefined;
    const links = isSmartMode ? [] : (data.links || [])
        .map(link => model.getLinkType(link.id)?.data ?? link)
        .filter(link => {
            const text = t.formatLabel(link.label, link.id, model.language);
            return !textFilter || textFilter(text);
        })
        .sort(makeLinkTypeComparer(t, model.language));

    const probableLinks =  (data.links ?? [])
        .map(link => model.getLinkType(link.id)?.data ?? link)
        .filter(link => {
            const score = suggestions.scores.get(link.id);
            return !links.includes(link) && score !== undefined && (score.score > 0 || isSmartMode);
        })
        .sort(makeLinkTypeComparer(t, model.language, suggestions));

    const regularEntries = getConnectionLinks(links, {
        counts: data.counts,
        scores: suggestions.scores,
    });
    const probableEntries = getConnectionLinks(probableLinks, {
        counts: data.counts,
        scores: suggestions.scores,
        probable: true,
    });

    const entries: ConnectionEntry[] = [];
    if (regularEntries.length > 1 || (isSmartMode && probableEntries.length > 1)) {
        const countMap = data.counts;
        const {inCount, outCount, inexact} = countMap.get(allRelatedLink.id)!;
        const totalCount = inCount + outCount;
        entries.push({
            type: 'link',
            key: allRelatedLink.id,
            linkType: allRelatedLink,
            count: inexact && totalCount > 0 ? 'some' : totalCount,
        });
        entries.push({type: 'separator'});
        for (const entry of regularEntries) {
            entries.push(entry);
        }
    }

    if (probableEntries.length > 0) {
        if (isSmartMode) {
            entries.push({type: 'probable-hint'});
            for (const entry of probableEntries) {
                entries.push(entry);
            }
        }
    }

    const renderItem = React.useCallback<TreeListRenderItem<ConnectionEntry, void>>(
        ({item, focusProps}) => {
            if (item.type === 'link') {
                return (
                    <ConnectionLink
                        link={item.linkType}
                        direction={item.direction}
                        count={item.count}
                        filterKey={item.probable ? '' : filterKey}
                        probability={item.probability}
                        onExpandLink={onExpandLink}
                        onMoveToFilter={onMoveToFilter}
                        focusProps={focusProps}
                    />
                );
            } else if (item.type === 'separator') {
                return <hr className={`${CLASS_NAME}__links-list-hr`} />;
            } else if (item.type === 'probable-hint') {
                return (
                    <li className={`${CLASS_NAME}__links-probably-label`}>
                        {t.text('connections_menu.links.suggest_similar')}
                    </li>
                );
            }
            return null;
        },
        [t, filterKey, onExpandLink, onMoveToFilter]
    );

    const rootProps = React.useMemo((): React.HTMLProps<HTMLUListElement> => ({
        /* For compatibility with React 19 typings */
        ref: scrolledListRef as React.RefObject<HTMLUListElement>,
        className: `${CLASS_NAME}__links-root`,
        role: 'list',
    }), []);
    const forestProps = React.useMemo((): React.HTMLProps<HTMLUListElement> => ({}), []);
    const itemProps = React.useMemo((): React.HTMLProps<HTMLLIElement> => ({
        className: `${CLASS_NAME}__links-item`,
        role: 'listitem',
    }), []);

    return (
        <div
            className={cx(
                `${CLASS_NAME}__links-list`,
                'reactodia-scrollable',
                entries.length === 0 ? `${CLASS_NAME}__links-list-empty` : undefined
            )}
            tabIndex={-1}
        >
            <TreeList
                model={ConnectionListModel}
                items={entries}
                renderItem={renderItem}
                rootProps={rootProps}
                forestProps={forestProps}
                itemProps={itemProps}
            />
            {entries.length === 0 ? (
                <label className={`${CLASS_NAME}__links-no-results`}>
                    {t.text('connections_menu.links.no_results')}
                </label>
            ) : null}
        </div>
    );
}

const ConnectionListModel: TreeListModel<ConnectionEntry, void> = {
    getKey: item => item.type === 'link' ? item.key : item.type,
    getChildren: item => undefined,
    getDefaultSelected: (item, selected) => undefined,
    isActive: item => item.type === 'link',
};

type ConnectionEntry = ConnectionEntryLink | ConnectionEntrySeparator;

interface ConnectionEntrySeparator {
    readonly type: 'separator' | 'probable-hint';
}

interface ConnectionEntryLink {
    readonly type: 'link';
    readonly key: string;
    readonly linkType: LinkTypeModel;
    readonly direction?: 'in' | 'out';
    readonly count: number | 'some';
    readonly probable?: boolean;
    readonly probability?: number;
}

function getConnectionLinks(links: LinkTypeModel[], options: {
    counts: ConnectionsData['counts'];
    scores: ConnectionSuggestions['scores'];
    probable?: boolean;
}): ConnectionEntryLink[] {
    const {counts, scores, probable} = options;
    const entries: ConnectionEntryLink[] = [];
    const addView = (link: LinkTypeModel, direction: 'in' | 'out') => {
        const {inCount, outCount, inexact} = counts.get(link.id) ?? {
            inCount: 0,
            outCount: 0,
            inexact: false,
        };
        const count = direction === 'in' ? inCount : outCount;
        if (count === 0) {
            return;
        }

        const postfix = probable ? '-probable' : '';
        const score = scores.get(link.id);
        entries.push({
            type: 'link',
            key: `${direction}-${link.id}-${postfix}`,
            linkType: link,
            direction,
            count: inexact && count > 0 ? 'some' : count,
            probable,
            probability: probable && score !== undefined ? score.score : 0,
        });
    };

    for (const link of links) {
        addView(link, 'in');
        addView(link, 'out');
    }

    return entries;
}

function makeLinkTypeComparer(
    t: Translation,
    language: string,
    suggestions?: ConnectionSuggestions
): (a: LinkTypeModel, b: LinkTypeModel) => number {
    return (a, b) => {
        if (suggestions) {
            const {scores} = suggestions;
            const aWeight = scores.has(a.id) ? scores.get(a.id)!.score : 0;
            const bWeight = scores.has(b.id) ? scores.get(b.id)!.score : 0;
            if (aWeight > bWeight) {
                return -1;
            } else if (aWeight < bWeight) {
                return 1;
            }
        }

        const aText = t.formatLabel(a.label, a.id, language);
        const bText = t.formatLabel(b.label, b.id, language);
        return aText.localeCompare(bText);
    };
}

function ConnectionLink(props: {
    link: LinkTypeModel;
    count: number | 'some';
    direction?: 'in' | 'out';
    filterKey?: string;
    onExpandLink: (linkDataChunk: LinkDataChunk) => void;
    onMoveToFilter: ((linkDataChunk: LinkDataChunk) => void) | undefined;
    probability?: number;
    focusProps?: TreeListFocusProps;
}) {
    const {
        link, filterKey, direction, count, onExpandLink, onMoveToFilter, probability = 0, focusProps,
    } = props;
    const {model} = useWorkspace();
    const t = useTranslation();

    const relation = t.formatLabel(link.label, link.id, model.language);
    const relationIri = model.locale.formatIri(link.id);
    const probabilityPercent = Math.round(probability * 100);
    const textLine = highlightSubstring(
        relation + (probabilityPercent > 0 ? ` (${probabilityPercent}%)` : ''),
        filterKey
    );
    const title = (
        direction === 'in' ? t.text('connections_menu.link.source_title', {relation, relationIri}) :
        direction === 'out' ? t.text('connections_menu.link.target_title', {relation, relationIri}) :
        t.text('connections_menu.link.both_title', {relation, relationIri})
    );
    const navigateTitle = (
        direction === 'in' ? t.text('connections_menu.link.source_navigate_title', {relation, relationIri}) :
        direction === 'out' ? t.text('connections_menu.link.target_navigate_title', {relation, relationIri}) :
        t.text('connections_menu.link.both_navigate_title', {relation, relationIri})
    );

    const onExpandLinkClick = () => {
        onExpandLink({
            chunkId: generate128BitID(),
            linkType: link,
            direction,
            expectedCount: count,
            pageCount: 1,
        });
    };

    const onMoveToFilterClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onMoveToFilter?.({
            chunkId: generate128BitID(),
            linkType: link,
            direction,
            expectedCount: count,
            pageCount: 1,
        });
    };

    return (
        <div className={`${CLASS_NAME}__link`}
            data-linktypeid={link.id}>
            <button {...focusProps}
                className={`${CLASS_NAME}__link-button`}
                title={title}
                onClick={onExpandLinkClick}
            >
                {direction === 'in' || direction === 'out' ? (
                    <div className={`${CLASS_NAME}__link-direction`}>
                        {direction === 'in' && <div className={`${CLASS_NAME}__link-direction-in`} />}
                        {direction === 'out' && <div className={`${CLASS_NAME}__link-direction-out`} />}
                    </div>
                ) : null}
                <WithFetchStatus type='linkType' target={link.id}>
                    <div className={`${CLASS_NAME}__link-title`}>{textLine}</div>
                </WithFetchStatus>
                {count === 'some' ? null : (
                    <span className={`reactodia-badge ${CLASS_NAME}__link-count`}>
                        {count <= LINK_COUNT_PER_PAGE ? count : `${LINK_COUNT_PER_PAGE}+`}
                    </span>
                )}
                {onMoveToFilter ? <div className={`${CLASS_NAME}__link-filter-spacer`} /> : null}
                <div className={`${CLASS_NAME}__link-navigate-button`}
                    title={navigateTitle}
                />
            </button>
            {onMoveToFilter ? (
                <button {...focusProps}
                    className={`${CLASS_NAME}__link-filter-button`}
                    onClick={onMoveToFilterClick}
                    title={t.text('connections_menu.link.move_to_filter.title')}
                />
            ) : null}
        </div>
    );
}
