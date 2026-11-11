import cx from 'clsx';
import * as React from 'react';

import { multimapArrayAdd } from '../../coreUtils/collections';
import { useTranslation } from '../../coreUtils/i18n';

import {
    ElementIri, ElementTypeIri, LinkTypeIri, LinkDirection,
} from '../../data/model';

import { SearchInput, SearchInputStore } from '../utility/searchInput';

import {
    SearchCriterion, SearchCriterionContext, SearchCriteriaOption, AddCriterion,
} from './searchCriterion';
import {
    SearchPattern, SearchPatternType, SearchPatternErrorItem,
    SearchPatternAllOf, SearchPatternHasType, SearchPatternConnectedTo,
    SearchPatternFromValues, SearchPatternGenerateContext,
} from './searchPattern';

/**
 * A filter criteria for the entity lookup from a {@link DataProvider}.
 *
 * @see {@link DataProviderLookupParams}
 */
export interface SearchCriteria {
    /**
     * Filter by a text lookup.
     */
    readonly text?: string;
    /**
     * Filter by an element type.
     */
    readonly elementType?: ElementTypeIri;
    /**
     * Filter by having a connected element with specified IRI.
     */
    readonly refElement?: ElementIri;
    /**
     * Filter by connection link type.
     */
    readonly refElementLink?: LinkTypeIri;
    /**
     * Reference element link type direction ('in' | 'out').
     */
    readonly linkDirection?: LinkDirection;
    /**
     * Filter by a lookup pattern.
     */
    readonly pattern?: SearchPattern;
}

const CLASS_NAME = 'reactodia-instances-search';

export function InstanceCriteria(props: {
    criteria: SearchCriteria;
    setCriteria: (criteria: SearchCriteria) => void;
    searchStore: SearchInputStore | undefined;
    allCriterions: readonly SearchCriteriaOption[];
    creatableCriterions: readonly SearchCriteriaOption[];
}) {
    const {criteria, setCriteria, searchStore, allCriterions, creatableCriterions} = props;
    const t = useTranslation();

    const [outerCriteria, setOuterCriteria] = React.useState(criteria);
    const [pattern, setPattern] = React.useState(() => searchPatternFrom(criteria));
    const [editState, setEditState] = React.useState<{
        readonly original: SearchPattern | undefined;
        readonly errors?: ReadonlyMap<SearchPattern, readonly SearchPatternErrorItem[]>;
        readonly allowApply: boolean;
    }>();

    const context = React.useMemo((): SearchCriterionContext => ({
        editing: editState !== undefined,
        errors: editState?.errors ?? new Map(),
        allOptions: allCriterions,
        creatableOptions: creatableCriterions,
    }), [editState, allCriterions, creatableCriterions]);

    if (outerCriteria !== criteria) {
        setOuterCriteria(criteria);
        setPattern(searchPatternFrom(criteria));
        setEditState(undefined);
    }

    const applyPattern = (pattern: SearchPattern | undefined): boolean => {
        if (pattern) {
            setPattern(pattern);

            const generateContext: SearchPatternGenerateContext = {};
            const result = pattern.generate(generateContext);
            if (result.type === 'error') {
                const errors = new Map<SearchPattern, SearchPatternErrorItem[]>();
                for (const error of result.errors) {
                    multimapArrayAdd(errors, error.target, error);
                }
                setEditState({original: editState?.original, errors, allowApply: false});
                return false;
            }

            setCriteria({pattern});
        } else {
            setCriteria({});
        }

        setEditState(undefined);
        return true;
    };

    return (
        <div className={`${CLASS_NAME}__criteria`}>
            {searchStore ? (
                <SearchInput store={searchStore}
                    className={`${CLASS_NAME}__text-criteria`}
                    inputProps={{
                        name: 'reactodia-instances-search-text',
                        placeholder: t.textOptional('search_entities.input.placeholder'),
                    }}
                />
            ) : null}
            <SearchCriterionContext.Provider value={context}>
                <div className={`${CLASS_NAME}__criterions`}>
                    {!editState && !pattern ? (
                        <AddCriterion
                            onAdd={added => {
                                setEditState({original: undefined, allowApply: true});
                                setPattern(added);
                            }}
                            title={t.textOptional('search_entities.search_by.title')}>
                            {t.text('search_entities.search_by.label')}
                        </AddCriterion>
                    ) : (
                        <SearchCriterion pattern={pattern}
                            setPattern={changed => {
                                setPattern(changed);
                                if (editState) {
                                    setEditState({...editState, allowApply: true});
                                }
                            }}
                            parent={undefined}
                        />
                    )}
                </div>
                {editState || pattern ? (
                    <div
                        className={cx(
                            `${CLASS_NAME}__criterions-controls`,
                            'reactodia-btn-group reactodia-btn-group-xs'
                        )}>
                        {editState ? (
                            <>
                                <button type='button'
                                    className={cx(
                                        `${CLASS_NAME}__criterions-apply`,
                                        'reactodia-btn reactodia-btn-default'
                                    )}
                                    disabled={!editState.allowApply}
                                    onClick={() => applyPattern(pattern)}
                                    title={t.text('search_entities.apply_criteria.title')}>
                                    {t.text('search_entities.apply_criteria.label')}
                                </button>
                                <button type='button'
                                    className={cx(
                                        `${CLASS_NAME}__criterions-cancel`,
                                        'reactodia-btn reactodia-btn-default'
                                    )}
                                    onClick={() => {
                                        setPattern(editState.original);
                                        setEditState(undefined);
                                    }}
                                    title={t.text('search_entities.cancel_criteria.title')}>
                                    {t.text('search_entities.cancel_criteria.label')}
                                </button>
                            </>
                        ) : (
                            <>
                                <button type='button'
                                    className={cx(
                                        `${CLASS_NAME}__criterions-edit`,
                                        'reactodia-btn reactodia-btn-default'
                                    )}
                                    onClick={() => setEditState({
                                        original: pattern,
                                        allowApply: true,
                                    })}
                                    title={t.text('search_entities.edit_criteria.title')}>
                                    {t.text('search_entities.edit_criteria.label')}
                                </button>
                                <button type='button'
                                    className={cx(
                                        `${CLASS_NAME}__criterions-clear`,
                                        'reactodia-btn reactodia-btn-default'
                                    )}
                                    onClick={() => setCriteria({})}
                                    title={t.text('search_entities.clear_criteria.title')}>
                                    {t.text('search_entities.clear_criteria.label')}
                                </button>
                            </>
                        )}
                    </div>
                ) : null}
            </SearchCriterionContext.Provider>
        </div>
    );
}

function searchPatternFrom(criteria: SearchCriteria): SearchPattern | undefined {
    const {
        elementType, refElement, refElementLink, linkDirection, pattern,
    } = criteria;

    const patterns: SearchPattern[] = [];

    if (elementType) {
        patterns.push(new SearchPatternHasType({elementType}));
    }

    if (refElement || refElementLink || linkDirection) {
        patterns.push(new SearchPatternConnectedTo({
            linkType: refElementLink,
            linkDirection,
            target: refElement
                ? new SearchPatternFromValues({values: [refElement]})
                : undefined,
        }));
    }

    if (pattern) {
        patterns.push(pattern);
    }

    return (
        patterns.length === 0 ? undefined :
        patterns.length === 1 ? patterns[0] :
        new SearchPatternAllOf({patterns})
    );
}
