import cx from 'clsx';
import * as React from 'react';

import { useTranslation } from '../../coreUtils/i18n';

import { SearchInput, SearchInputStore } from '../utility/searchInput';

import {
    SearchCriterion, SearchCriterionContext, SearchCriterionOption, AddCriterion,
} from './searchCriterion';
import {
    SearchCriteria, SearchPattern, SearchPatternAllOf, searchPatternFrom,
} from './searchPattern';

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
    const [editState, setEditState] =
        React.useState<{ original: SearchPattern | undefined }>();

    const context = React.useMemo((): SearchCriterionContext => ({
        editing: editState !== undefined,
        patternOptions: criterionOptions,
    }), [editState, criterionOptions]);

    if (outerCriteria !== criteria) {
        setOuterCriteria(criteria);
        setPattern(searchPatternFrom(criteria));
        setEditState(undefined);
    }

    const applyPattern = (pattern: SearchPattern | undefined) => {
        if (pattern) {
            setPattern(pattern);
            setCriteria({pattern});
        } else {
            setCriteria({});
        }
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
                                setEditState({original: undefined});
                                setPattern(added);
                            }}>
                            search by
                        </AddCriterion>
                    ) : (
                        <SearchCriterion pattern={pattern}
                            setPattern={setPattern}
                            parent={undefined}
                        />
                    )}
                </div>
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
                                onClick={() => {
                                    applyPattern(pattern);
                                    setEditState(undefined);
                                }}>
                                apply
                            </button>
                            <button type='button'
                                className={cx(
                                    `${CLASS_NAME}__criterions-cancel`,
                                    'reactodia-btn reactodia-btn-default'
                                )}
                                onClick={() => {
                                    setPattern(editState.original);
                                    setEditState(undefined);
                                }}>
                                cancel
                            </button>
                        </>
                    ) : null}
                    {!editState && pattern ? (
                        <>
                            <button type='button'
                                className={cx(
                                    `${CLASS_NAME}__criterions-edit`,
                                    'reactodia-btn reactodia-btn-default'
                                )}
                                onClick={() => setEditState({original: pattern})}>
                                edit
                            </button>
                            <button type='button'
                                className={cx(
                                    `${CLASS_NAME}__criterions-clear`,
                                    'reactodia-btn reactodia-btn-default'
                                )}
                                onClick={() => setCriteria({})}>
                                clear
                            </button>
                        </>
                    ) : null}
                </div>
            </SearchCriterionContext.Provider>
        </div>
    );
}
