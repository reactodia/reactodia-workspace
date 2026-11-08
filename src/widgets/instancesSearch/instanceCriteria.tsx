import cx from 'clsx';
import * as React from 'react';

import { multimapArrayAdd } from '../../coreUtils/collections';
import { useTranslation } from '../../coreUtils/i18n';

import { SearchInput, SearchInputStore } from '../utility/searchInput';

import {
    SearchCriterion, SearchCriterionContext, SearchCriterionOption, AddCriterion,
    SearchCriterionError, makePatternGenerator,
} from './searchCriterion';
import { SearchCriteria, SearchPattern, searchPatternFrom } from './searchPattern';

const CLASS_NAME = 'reactodia-instances-search';

export function InstanceCriteria(props: {
    criteria: SearchCriteria;
    setCriteria: (criteria: SearchCriteria) => void;
    searchStore: SearchInputStore | undefined;
    criterionOptions: readonly SearchCriterionOption[];
}) {
    const {criteria, setCriteria, searchStore, criterionOptions} = props;
    const t = useTranslation();

    const [outerCriteria, setOuterCriteria] = React.useState(criteria);
    const [pattern, setPattern] = React.useState(() => searchPatternFrom(criteria));
    const [editState, setEditState] = React.useState<{
        readonly original: SearchPattern | undefined;
        readonly errors?: ReadonlyMap<SearchPattern, readonly SearchCriterionError[]>;
        readonly allowApply: boolean;
    }>();

    const context = React.useMemo((): SearchCriterionContext => ({
        editing: editState !== undefined,
        patternOptions: criterionOptions,
        errors: editState?.errors ?? new Map(),
    }), [editState, criterionOptions]);

    if (outerCriteria !== criteria) {
        setOuterCriteria(criteria);
        setPattern(searchPatternFrom(criteria));
        setEditState(undefined);
    }

    const applyPattern = (pattern: SearchPattern | undefined): boolean => {
        if (pattern) {
            setPattern(pattern);

            const generateContext = makePatternGenerator(criterionOptions);
            const result = generateContext.generate(pattern);
            if (result.type === 'error') {
                const errors = new Map<SearchPattern, SearchCriterionError[]>();
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
