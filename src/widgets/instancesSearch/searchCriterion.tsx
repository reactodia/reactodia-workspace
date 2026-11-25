import cx from 'clsx';
import * as React from 'react';

import { TranslatedText, useTranslation } from '../../coreUtils/i18n';
import { ElementIri, LinkDirection } from '../../data/model';
import { EntityElement } from '../../editor/dataElements';
import { useProvidedEntities } from '../../editor/useProvidedEntities';
import { useWorkspace } from '../../workspace/workspaceContext';

import { DropdownMenu, DropdownMenuItem, useDropdownMenu } from '../utility/dropdown';
import { InlineEntity } from '../utility/inlineEntity';
import { SchemaTypeView } from '../utility/schemaTypeView';

import { EntitySelect } from './entitySelect';
import { SchemaTypeSelect, useProvidedSchemaTypes } from './schemaTypeSelect';
import {
    SearchPattern, SearchPatternType, SearchPatternErrorItem, RawSearchPattern,
    SearchPatternError, SearchPatternAnd, SearchPatternOr, SearchPatternMinus,
    SearchPatternConnectedTo, SearchPatternFromValues, SearchPatternHasProperty,
    SearchPatternHasType,
} from './searchPattern';
import { LookupPattern } from '../../workspace';

/**
 * Search criteria option to display and edit the corresponding
 * search pattern {@link type}.
 */
export interface SearchCriteriaOption<out P extends SearchPattern = SearchPattern> {
    /**
     * Correspoding {@link SearchPattern search pattern} for the option.
     */
    readonly type: SearchPatternType<P>;
    /**
     * Option label to display in the menu when creating a new pattern.
     *
     * If `undefined`, the option will be hidden from the menu.
     */
    readonly label?: string | TranslatedText;
    /**
     * Function to create a new instance of the corresponding search pattern.
     */
    readonly createPattern: () => P;
    /**
     * Renders the search patten in display or edit mode.
     */
    readonly renderCriterion: (
        props: SearchCriteriaRenderProps<P>
    ) => React.ReactNode;
}

/**
 * Props for rendering a component from {@link SearchCriteriaOption.renderCriterion}.
 */
export interface SearchCriteriaRenderProps<in P extends SearchPattern> {
    /**
     * Displayed or edited search pattern.
     */
    pattern: P;
    /**
     * Handler to update or replace the currently edited pattern.
     */
    setPattern: (state: SearchPattern | undefined) => void;
    /**
     * Mode to render the pattern:
     *   - display mode: read-only compact represetnation of the pattern,
     *   - edit mode: UI to edit the pattern state, replace or remove it.
     */
    inEditMode: boolean;
    /**
     * Search pattern parent if exists, or `undefined` if the pattern
     * is a top-level one.
     */
    parent?: SearchPattern;
    /**
     * Provided controls to display with {@link SearchCriterionBlock}
     * in the edit {@link mode}.
     */
    controls?: React.ReactNode;
}

export interface SearchCriterionContext {
    readonly editing: boolean;
    readonly errors: ReadonlyMap<SearchPattern, readonly SearchPatternErrorItem[]>;
    readonly tryScrollToError: (element: HTMLElement) => void;
    readonly allOptions: readonly SearchCriteriaOption[];
    readonly creatableOptions: readonly SearchCriteriaOption[];
}
export const SearchCriterionContext = React.createContext<SearchCriterionContext>({
    editing: false,
    errors: new Map(),
    tryScrollToError: () => {},
    allOptions: [],
    creatableOptions: [],
});

const CLASS_NAME = 'reactodia-search-criterion';

/**
 * Displays a search pattern with corresponding {@link SearchCriteriaOption criteria option}.
 *
 * If {@link pattern} is `undefined`, displays a placeholder option
 * with ability to create a new search pattern instead.
 *
 * @category Components
 */
export function SearchCriterion(props: {
    /**
     * Search pattern to display or edit.
     */
    pattern: SearchPattern | undefined;
    /**
     * Handler to process when the pattern is updated or replaced.
     */
    setPattern: (pattern: SearchPattern | undefined) => void;
    /**
     * Parent search pattern if exists, or `undefined` if the pattern
     * is a top-level one.
     */
    parent: SearchPattern | undefined;
}) {
    const {pattern, setPattern, parent} = props;
    const t = useTranslation();
    const {editing, allOptions} = React.useContext(SearchCriterionContext);

    if (!pattern) {
        return (
            <PlaceholderAnyCriterion setPattern={setPattern}
                editing={editing}
                topLevel={parent === undefined}
            />
        );
    }
    
    const isLogicalPattern = (
        pattern instanceof SearchPatternAnd ||
        pattern instanceof SearchPatternOr ||
        pattern instanceof SearchPatternMinus
    );
    const controls = editing ? (
        <div className={`${CLASS_NAME}__controls reactodia-btn-group`}>
            {isLogicalPattern ? null : (
                <AddCriterion
                    onAdd={added => setPattern(new SearchPatternAnd({
                        patterns: [pattern, added],
                    }))}
                    title={t.textOptional('search_criteria.and_add.title')}>
                    {t.text('search_criteria.and_add.label')}
                </AddCriterion>
            )}
            {isLogicalPattern ? null : (
                <AddCriterion
                    onAdd={added => setPattern(new SearchPatternOr({
                        patterns: [pattern, added]
                    }))}
                    title={t.textOptional('search_criteria.or_add.title')}>
                    {t.text('search_criteria.or_add.label')}
                </AddCriterion>
            )}
            <button type='button'
                className={cx(
                    `${CLASS_NAME}__remove`,
                    'reactodia-btn reactodia-btn-default'
                )}
                title={t.text('search_entities.remove_criterion.title')}
                onClick={() => setPattern(undefined)}
            />
        </div>
    ) : null;
    const option = allOptions.find(option => pattern instanceof option.type)
        ?? PlaceholderUnknownOption;
    const optionProps: SearchCriteriaRenderProps<SearchPattern> = {
        pattern,
        setPattern,
        inEditMode: editing,
        parent,
        controls,
    };

    return option.renderCriterion(optionProps);
}

export function AddCriterion(props: {
    onAdd: (pattern: SearchPattern) => void;
    title?: string;
    children: React.ReactNode;
}) {
    const {onAdd, title, children} = props;
    const t = useTranslation();
    const {creatableOptions} = React.useContext(SearchCriterionContext);
    return (
        <DropdownMenu className={`${CLASS_NAME}__add`}
            toggle={
                <AddCriterionButton
                    title={title ?? t.text('search_entities.add_criterion.title')}>
                    {children}
                </AddCriterionButton>
            }>
            {creatableOptions.map(option => option.label ? (
                <DropdownMenuItem key={option.type.fromJSONType}
                    onSelect={() => {
                        onAdd(option.createPattern());
                    }}>
                    {typeof option.label === 'string'
                        ? option.label
                        : option.label.resolve(t)}
                </DropdownMenuItem>
            ) : null)}
        </DropdownMenu>
    );
}

function AddCriterionButton(props: {
    title: string;
    children: React.ReactNode;
}) {
    const {title, children} = props;
    const {expanded, setExpanded} = useDropdownMenu();
    return (
        <button
            className={cx(
                `${CLASS_NAME}__add-button`,
                'reactodia-btn reactodia-btn-default',
                expanded ? 'active': undefined
            )}
            onClick={() => setExpanded(previous => !previous)}
            title={title}>
            {children}
        </button>
    );
}

/**
 * Utility component to render criterion from {@link SearchCriteriaOption}
 * in the edit mode with controls and pattern validation errors.
 *
 * @category Components
 */
export function SearchCriterionBlock(props: {
    /**
     * Target pattern to display validation errors for.
     */
    target: SearchPattern;
    /**
     * Criterion header to describe the pattern type. 
     */
    header: React.ReactNode;
    /**
     * Criterion controls provided with {@link SearchCriterionProps.controls}.
     */
    controls: React.ReactNode;
    /**
     * Criterion editing UI, e.g. inputs, layout elements, etc.
     */
    children?: React.ReactNode;
}) {
    const {target, header, controls, children} = props;
    const t = useTranslation();
    const {errors, tryScrollToError} = React.useContext(SearchCriterionContext);

    const errorListRef = React.useRef<HTMLUListElement | null>(null);
    const targetErrors = errors.get(target);
    React.useEffect(() => {
        const errorList = errorListRef.current;
        if (errorList) {
            tryScrollToError(errorList);
        }
    }, [targetErrors]);

    return (
        <div className={`${CLASS_NAME}__block`}>
            <div className={`${CLASS_NAME}__block-header`}>
                {header}
            </div>
            <div className={`${CLASS_NAME}__block-controls`}>
                {controls}
            </div>
            <div className={`${CLASS_NAME}__block-body`}>
                {children}
            </div>
            {targetErrors ? (
                <ul ref={errorListRef}
                    className={`${CLASS_NAME}__block-errors`}>
                    {targetErrors.map((error, index) => (
                        <li key={index}
                            className={`${CLASS_NAME}__block-error`}>
                            {typeof error.message === 'string'
                                ? error.message
                                : error.message.resolve(t)}
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}

/**
 * Utility component to display a "where" definition-list
 * when rendering a criterion from {@link SearchCriteriaOption}.
 *
 * @category Components
 * @see {@link SearchCriterionWhere}
 */
function SearchCriterionWhereGroup(props: {
    /**
     * Definition list content, e.g. {@link SearchCriterionWhere} items.
     */
    children: React.ReactElement;
}) {
    const {children} = props;
    return (
        <dl className={`${CLASS_NAME}__where-group`}>
            {children}
        </dl>
    );
}

/**
 * Utility component to display a "where" definition-item
 * when rendering a criterion from {@link SearchCriteriaOption}.
 *
 * @category Components
 * @see {@link SearchCriterionWhereGroup}
 */
function SearchCriterionWhere(props: {
    /**
     * Definition label, e.g. "target" or "sub-pattern" to display.
     */
    caption: React.ReactNode;
    /**
     * Definition content.
     */
    children: React.ReactNode;
}) {
    const {caption, children} = props;
    return (
        <>
            <dt>{caption}</dt>
            <dd>{children}</dd>
        </>
    );
}

function PlaceholderAnyCriterion(props: {
    setPattern: (pattern: SearchPattern) => void;
    editing: boolean;
    topLevel?: boolean;
}) {
    const {setPattern, editing, topLevel} = props;
    const t = useTranslation();

    if (!editing) {
        return topLevel ? null : (
            <div className={`${CLASS_NAME}__placeholder-any`}>
                {t.text('search_criteria.placeholder_any')}
            </div>
        );
    }

    return (
        <AddCriterion onAdd={setPattern}>
            {t.text('search_entities.add_criterion.label')}
        </AddCriterion>
    );
}

class SearchPatternUnknown extends SearchPattern<Record<string, never>> {
    generate(): LookupPattern | SearchPatternError {
        throw new Error('Unknown pattern type');
    }

    static readonly fromJSONType = 'unknown';

    static fromJSON(): SearchPatternUnknown {
        return new SearchPatternUnknown({});
    }

    toJSON(): RawSearchPattern {
        return {'@type': 'unknown'};
    }
}

SearchPattern.define(SearchPatternUnknown);

const PlaceholderUnknownOption: SearchCriteriaOption<SearchPatternUnknown> = {
    type: SearchPatternUnknown,
    createPattern: () => new SearchPatternUnknown({}),
    renderCriterion: props => <PlaceholderUnknownCriterion {...props} />,
};

function PlaceholderUnknownCriterion(
    props: SearchCriteriaRenderProps<SearchPatternUnknown>
) {
    const {pattern, controls} = props;
    const t = useTranslation();
    return (
        <SearchCriterionBlock target={pattern}
            controls={controls}
            header={
                <div>
                    {t.text('search_criteria.placeholder_unknown')}
                </div>
            }
        />
    );
}

/**
 * Search criteria option corresponding to {@link LookupPatternAnd}.
 */
export const SearchCriterionAnd: SearchCriteriaOption<SearchPatternAnd> = {
    type: SearchPatternAnd,
    createPattern: () => new SearchPatternAnd({patterns: []}),
    renderCriterion: props => <LogicalCriterion {...props} />,
};

/**
 * Search criteria option corresponding to {@link LookupPatternOr}.
 */
export const SearchCriterionOr: SearchCriteriaOption<SearchPatternOr> = {
    type: SearchPatternOr,
    createPattern: () => new SearchPatternOr({patterns: []}),
    renderCriterion: props => <LogicalCriterion {...props} />,
};

/**
 * Search criteria option corresponding to {@link LookupPatternMinus}.
 */
export const SearchCriterionMinus: SearchCriteriaOption<SearchPatternMinus> = {
    type: SearchPatternMinus,
    createPattern: () => new SearchPatternMinus({
        pattern: new SearchPatternUnknown({}),
        exclude: new SearchPatternUnknown({}),
    }),
    renderCriterion: props => <LogicalCriterion {...props} />,
};

function LogicalCriterion<
    P extends SearchPatternOr | SearchPatternAnd | SearchPatternMinus
>(
    props: SearchCriteriaRenderProps<P>
) {
    const {pattern, setPattern, inEditMode, parent} = props;
    const t = useTranslation();
    const className = parent
        ? `${CLASS_NAME}__logical-group`
        : `${CLASS_NAME}__logical-group-root`;
    
    const subPatterns = pattern instanceof SearchPatternMinus
        ? [pattern.state.pattern, pattern.state.exclude] as const
        : pattern.state.patterns;

    const replaceAtIndex = (
        index: number,
        count: number,
        next: SearchPattern | undefined
    ) => {
        const nextPatterns = [...subPatterns];
        if (next) {
            if ((
                next instanceof SearchPatternAnd &&
                pattern instanceof SearchPatternAnd
            ) || (
                next instanceof SearchPatternOr &&
                pattern instanceof SearchPatternOr
            )) {
                nextPatterns.splice(index, count, ...next.state.patterns);
            } else {
                nextPatterns.splice(index, count, next);
            }
        } else {
            nextPatterns.splice(index, count);
        }

        setPattern(
            nextPatterns.length === 0 ? undefined :
            nextPatterns.length === 1 ? nextPatterns[0] :
            pattern instanceof SearchPatternAnd ? new SearchPatternAnd({
                patterns: nextPatterns,
            }) :
            pattern instanceof SearchPatternOr ? new SearchPatternOr({
                patterns: nextPatterns,
            }) :
            pattern instanceof SearchPatternMinus ? new SearchPatternMinus({
                pattern: nextPatterns[0],
                exclude: nextPatterns[1],
            }) :
            undefined
        );
    };

    return (
        <div className={className}>
            {subPatterns.map((child, index) => (
                <React.Fragment key={index}>
                    {index > 0 ? (
                        <LogicalJoiner pattern={pattern}
                            inEditMode={inEditMode}
                            onReplace={createPattern => {
                                replaceAtIndex(index - 1, 2, createPattern(
                                    subPatterns[index - 1],
                                    subPatterns[index]
                                ));
                            }}
                        />
                    ) : null}
                    <SearchCriterion key={index}
                        pattern={child}
                        setPattern={next => replaceAtIndex(index, 1, next)}
                        parent={pattern}
                    />
                </React.Fragment>
            ))}
            {inEditMode && subPatterns.length === 0 ? (
                <AddCriterion
                    onAdd={added => {
                        setPattern(
                            pattern instanceof SearchPatternAnd ? new SearchPatternAnd({
                                patterns: [added],
                            }) :
                            pattern instanceof SearchPatternOr ? new SearchPatternOr({
                                patterns: [added],
                            }) :
                            undefined
                        );
                    }}
                    title={
                        pattern instanceof SearchPatternAnd ? t.textOptional(
                            'search_criteria.and_add.title'
                        ) : pattern instanceof SearchPatternOr ? t.textOptional(
                            'search_criteria.or_add.title'
                        ) : undefined
                    }>
                    {(
                        pattern instanceof SearchPatternAnd ? t.text(
                            'search_criteria.and_add.label'
                        ) : pattern instanceof SearchPatternOr ? t.text(
                            'search_criteria.or_add.label'
                        ) : t.text('search_entities.add_criterion.label')
                    )}
                </AddCriterion>
            ) : null}
        </div>
    );
}

function LogicalJoiner(props: {
    pattern: SearchPatternOr | SearchPatternAnd | SearchPatternMinus;
    inEditMode: boolean;
    onReplace: (
        createPattern: (first: SearchPattern, second: SearchPattern) => SearchPattern
    ) => void;
}) {
    const {pattern, inEditMode, onReplace} = props;
    const t = useTranslation();
    const joiner = (
        pattern instanceof SearchPatternAnd ? t.text(
            'search_criteria.and_joiner.label'
        ) : pattern instanceof SearchPatternOr ? t.text(
            'search_criteria.or_joiner.label'
        ) : pattern instanceof SearchPatternMinus ? t.text(
            'search_criteria.minus_joiner.label'
        ) : '-'
    );
    if (!inEditMode) {
        return (
            <div className={`${CLASS_NAME}__logical-joiner`}>
                {joiner}
            </div>
        );
    }
    return (
        <DropdownMenu className={`${CLASS_NAME}__logical-joiner-selector`}
            toggle={<LogicalJoinerToggle>{joiner}</LogicalJoinerToggle>}>
            <DropdownMenuItem
                disabled={pattern instanceof SearchPatternAnd}
                onSelect={() => onReplace((a, b) => new SearchPatternAnd({
                    patterns: [a, b],
                }))}
                title={t.text('search_criteria.and_joiner.title')}>
                {t.text('search_criteria.and_joiner.label')}
            </DropdownMenuItem>
            <DropdownMenuItem
                disabled={pattern instanceof SearchPatternOr}
                onSelect={() => onReplace((a, b) => new SearchPatternOr({
                    patterns: [a, b],
                }))}
                title={t.text('search_criteria.or_joiner.title')}>
                {t.text('search_criteria.or_joiner.label')}
            </DropdownMenuItem>
            <DropdownMenuItem
                disabled={pattern instanceof SearchPatternMinus}
                onSelect={() => onReplace((a, b) => new SearchPatternMinus({
                    pattern: a,
                    exclude: b,
                }))}
                title={t.text('search_criteria.minus_joiner.title')}>
                {t.text('search_criteria.minus_joiner.label')}
            </DropdownMenuItem>
        </DropdownMenu>
    );
}

function LogicalJoinerToggle(props: {
    children: React.ReactNode;
}) {
    const {children} = props;
    const {expanded, setExpanded} = useDropdownMenu();
    return (
        <button
            className={cx(
                `${CLASS_NAME}__logical-joiner-toggle`,
                expanded ? 'active': undefined
            )}
            onClick={() => setExpanded(previous => !previous)}>
            {children}
        </button>
    );
}

/**
 * Search criteria option corresponding to {@link LookupPatternHasType}.
 */
export const SearchCriterionHasType: SearchCriteriaOption<SearchPatternHasType> = {
    type: SearchPatternHasType,
    label: TranslatedText.text('search_criteria.has_type.label'),
    createPattern: () => new SearchPatternHasType({elementType: ''}),
    renderCriterion: props => <HasTypeCriterion {...props} />,
};

function HasTypeCriterion(
    props: SearchCriteriaRenderProps<SearchPatternHasType>
) {
    const {pattern, setPattern, inEditMode, controls} = props;
    const t = useTranslation();

    const [elementType] = useProvidedSchemaTypes(
        'elementType',
        pattern.state.elementType ? [pattern.state.elementType] : []
    );

    let header: React.ReactNode;
    let where: React.ReactNode | null = null;
    if (!inEditMode) {
        const typeView = elementType ? (
            <SchemaTypeView typeKind='elementType'
                typeData={elementType}
                selected
                inline
            />
        ) : (
            <div className={`${CLASS_NAME}__any-element-type`}>
                {t.text('search_criteria.has_type.any_type')}
            </div>
        );

        header = (
            <span className={`${CLASS_NAME}__condition`}>
                {t.template('search_criteria.has_type', {
                    entityType: typeView,
                })}
            </span>
        );
    } else {
        header = <div>{t.text('search_criteria.has_type.header')}</div>;
        where = (
            <SchemaTypeSelect typeKind='elementType'
                selected={elementType ? [elementType] : []}
                setSelected={([type]) => setPattern(new SearchPatternHasType({
                    ...pattern.state,
                    elementType: type ? type.id : undefined,
                }))}
                placeholder={t.text('search_criteria.has_type.input.placeholder')}
                sizeVariant='s'
            />
        );
    }

    return (
        <SearchCriterionBlock target={pattern}
            header={header}
            controls={controls}>
            {where}
        </SearchCriterionBlock>
    );
}

/**
 * Search criteria option corresponding to {@link LookupPatternConnectedTo}.
 */
export const SearchCriterionConnectedTo: SearchCriteriaOption<SearchPatternConnectedTo> = {
    type: SearchPatternConnectedTo,
    label: TranslatedText.text('search_criteria.connected.label'),
    createPattern: () => new SearchPatternConnectedTo({
        mode: 'allow',
        linkTypes: [],
    }),
    renderCriterion: props => <ConnectedToCriterion {...props} />,
};

function ConnectedToCriterion(
    props: SearchCriteriaRenderProps<SearchPatternConnectedTo>
) {
    const {pattern, setPattern, inEditMode, controls} = props;
    const t = useTranslation();

    const {mode, linkTypes, direction, other} = pattern.state;

    const selectedLinks = useProvidedSchemaTypes('linkType', linkTypes);

    let inlineEntity = false;
    let header: React.ReactNode;
    let where: React.ReactNode = null;

    if (!inEditMode) {
        let entity: React.ReactElement;
        if (!other || other instanceof SearchPatternFromValues) {
            inlineEntity = true;
            entity = <FromValuesList values={other?.state.values ?? []} />;
        } else {
            entity = (
                <span className={`${CLASS_NAME}__link-target`}>
                    {t.text('search_criteria.connected.other_entity')}
                </span>
            );
        }

        let relationType: React.ReactNode;
        if (selectedLinks.length === 0) {
            relationType = (
                <span className={`${CLASS_NAME}__any-link-type`}>
                    {t.text('search_criteria.connected.any_link')}
                </span>
            );
        } else {
            relationType = (
                <>
                    {mode === 'ignore' ? (
                        <span>
                            {t.text('search_criteria.connected.mode_ignore.label')}{' '}
                        </span>
                    ) : null}
                    {selectedLinks.map((linkType, index) => (
                        <React.Fragment key={linkType.id}>
                            {index === 0 ? null : (
                                <span className={`${CLASS_NAME}__values-joiner`}>
                                    {t.text('search_criteria.from_values.joiner')}
                                </span>
                            )}
                            <SchemaTypeView typeKind='linkType'
                                typeData={linkType}
                                selected
                                inline
                            />
                        </React.Fragment>
                    ))}
                </>
            );
        }

        const sourceIcon = <span className={`${CLASS_NAME}__link-in`} role="presentation" />;
        const targetIcon = <span className={`${CLASS_NAME}__link-out`} role="presentation" />;

        header = (
            <span className={`${CLASS_NAME}__condition`}>
                {selectedLinks.length === 0 && !direction ? (
                    t.template('search_criteria.connected', {
                        entity, relationType, sourceIcon, targetIcon,
                    })
                ) : direction === 'in' ? (
                    t.template('search_criteria.connected.to_source', {
                        entity, relationType, sourceIcon, targetIcon,
                    })
                ) : direction == 'out' ? (
                    t.template('search_criteria.connected.to_target', {
                        entity, relationType, sourceIcon, targetIcon,
                    })
                ) : (
                    t.template('search_criteria.connected.to_source_or_target', {
                        entity, relationType, sourceIcon, targetIcon,
                    })
                )}
            </span>
        );
    } else {
        header = (
            <div>
                {t.template('search_criteria.connected.header', {
                    entity: (
                        <span className={`${CLASS_NAME}__link-target`}>
                            {t.text('search_criteria.connected.other_entity')}
                        </span>
                    ),
                    mode: (
                        <ConnectedToModeSelector
                            value={mode}
                            setValue={nextMode => setPattern(new SearchPatternConnectedTo({
                                ...pattern.state,
                                mode: nextMode,
                            }))}
                        />
                    ),
                })}
            </div>
        );
        where = (
            <div className={`${CLASS_NAME}__directed-link-selector`}>
                <SchemaTypeSelect typeKind='linkType'
                    selected={selectedLinks}
                    setSelected={next => setPattern(new SearchPatternConnectedTo({
                        ...pattern.state,
                        linkTypes: next.map(item => item.id),
                    }))}
                    placeholder={t.text('search_criteria.connected.input.placeholder')}
                    sizeVariant='s'
                />
                <LinkDirectionSelect selected={direction}
                    setSelected={next => setPattern(new SearchPatternConnectedTo({
                        ...pattern.state,
                        direction: next,
                    }))}
                />
            </div>
        );
    }

    return (
        <SearchCriterionBlock target={pattern}
            header={header}
            controls={controls}>
            {where}
            {inlineEntity ? null : (
                <SearchCriterionWhereGroup>
                    <SearchCriterionWhere
                        caption={t.template('search_criteria.connected.other_caption', {
                            entity: (
                                <span className={`${CLASS_NAME}__link-target`}>
                                    {t.text('search_criteria.connected.other_entity')}
                                </span>
                            ),
                        })}>
                        <SearchCriterion pattern={pattern.state.other}
                            setPattern={other => setPattern(new SearchPatternConnectedTo({
                                ...pattern.state,
                                other,
                            }))}
                            parent={pattern}
                        />
                    </SearchCriterionWhere>
                </SearchCriterionWhereGroup>
            )}
        </SearchCriterionBlock>
    );
}

function ConnectedToModeSelector(props: {
    value: SearchPatternConnectedTo['state']['mode'];
    setValue: (value: SearchPatternConnectedTo['state']['mode']) => void;
}) {
    const {value, setValue} = props;
    const t = useTranslation();
    return (
        <DropdownMenu className={`${CLASS_NAME}__connected-mode-selector`}
            toggle={<ConnectedToModeToggle value={value} />}>
            <DropdownMenuItem
                onSelect={() => setValue('allow')}
                title={t.text('search_criteria.connected.mode_allow.title')}>
                {t.text('search_criteria.connected.mode_allow.label')}
            </DropdownMenuItem>
            <DropdownMenuItem
                onSelect={() => setValue('ignore')}
                title={t.text('search_criteria.connected.mode_ignore.title')}>
                {t.text('search_criteria.connected.mode_ignore.label')}
            </DropdownMenuItem>
        </DropdownMenu>
    );
}

function ConnectedToModeToggle(props: {
    value: 'allow' | 'ignore';
}) {
    const {value} = props;
    const t = useTranslation();
    const {expanded, setExpanded} = useDropdownMenu();
    return (
        <button
            className={cx(
                `${CLASS_NAME}__connected-mode-toggle`,
                expanded ? 'active': undefined
            )}
            onClick={() => setExpanded(previous => !previous)}
            data-value={value}>
            {value === 'allow'
                ? t.text('search_criteria.connected.mode_allow.label')
                : t.text('search_criteria.connected.mode_ignore.label')}
        </button>
    );
}

function LinkDirectionSelect(props: {
    selected: LinkDirection | undefined;
    setSelected: (direction: LinkDirection | undefined) => void;
}) {
    const {selected, setSelected} = props;
    const t = useTranslation();
    return (
        <div className='reactodia-btn-group reactodia-btn-group-s'
            role='radiogroup'>
            <button type='button'
                role='radio'
                aria-checked={selected === undefined}
                aria-label={t.text(
                    'search_criteria.connected.direction_any.title'
                )}
                className={cx(
                    'reactodia-btn reactodia-btn-default',
                    `${CLASS_NAME}__direction-any`,
                    selected === undefined ? 'active' : ''
                )}
                title={t.text(
                    'search_criteria.connected.direction_any.title'
                )}
                onClick={() => setSelected(undefined)}
            />
            <button type='button'
                role='radio'
                aria-checked={selected === 'in'}
                aria-label={t.text(
                    'search_criteria.connected.direction_in.title'
                )}
                className={cx(
                    'reactodia-btn reactodia-btn-default',
                    `${CLASS_NAME}__direction-in`,
                    selected === 'in' ? 'active' : undefined
                )}
                title={t.text(
                    'search_criteria.connected.direction_in.title'
                )}
                onClick={() => setSelected('in')}
            />
            <button type='button'
                role='radio'
                aria-checked={selected === 'out'}
                aria-label={t.text(
                    'search_criteria.connected.direction_out.title'
                )}
                className={cx(
                    'reactodia-btn reactodia-btn-default',
                    `${CLASS_NAME}__direction-out`,
                    selected === 'out' ? 'active' : undefined
                )}
                title={t.text(
                    'search_criteria.connected.direction_out.title'
                )}
                onClick={() => setSelected('out')}
            />
        </div>
    );
}

/**
 * Search criteria option corresponding to {@link LookupPatternFromValues}.
 */
export const SearchCriterionFromValues: SearchCriteriaOption<SearchPatternFromValues> = {
    type: SearchPatternFromValues,
    label: TranslatedText.text('search_criteria.from_values.label'),
    createPattern: () => new SearchPatternFromValues({values: []}),
    renderCriterion: props => <FromValuesCriterion {...props} />,
};

function FromValuesCriterion(
    props: SearchCriteriaRenderProps<SearchPatternFromValues>
) {
    const {pattern, setPattern, inEditMode, controls} = props;
    const t = useTranslation();

    let header: React.ReactNode;
    let where: React.ReactNode = null;
    if (!inEditMode) {
        header = (
            <span className={`${CLASS_NAME}__condition`}>
                {t.template('search_criteria.from_values', {
                    values: <FromValuesList values={pattern.state.values} />,
                })}
            </span>
        );
    } else {
        header = <div>{t.text('search_criteria.from_values.header')}</div>;
        where = <FromValuesSelector pattern={pattern} setPattern={setPattern} />;
    }

    return (
        <SearchCriterionBlock target={pattern}
            header={header}
            controls={controls}>
            {where}
        </SearchCriterionBlock>
    );
}

function FromValuesList(props: {
    values: readonly ElementIri[]
}) {
    const {values} = props;
    const t = useTranslation();
    const {model} = useWorkspace();
    const providedEntities = useProvidedEntities(model.dataProvider, values);
    if (values.length === 0) {
        return <span>{t.text('search_criteria.from_values.any_entity')}</span>;
    } else if (values.length <= 10) {
        return (
            <span>
                {values.map((iri, index) => {
                    const data = providedEntities.data.get(iri)
                        ?? EntityElement.placeholderData(iri);
                    return (
                        <React.Fragment key={index}>
                            {index === 0 ? null : (
                                <span className={`${CLASS_NAME}__values-joiner`}>
                                    {t.text('search_criteria.from_values.joiner')}
                                </span>
                            )}
                            <InlineEntity target={data} />
                        </React.Fragment>
                    );
                })}
            </span>
        );
    } else {
        return (
            <span>
                {t.text('search_criteria.from_values.many_entities', {
                    count: values.length,
                })}
            </span>
        );
    }
}

function FromValuesSelector(props: Pick<
    SearchCriteriaRenderProps<SearchPatternFromValues>,
    'pattern' | 'setPattern'
>) {
    const {pattern, setPattern} = props;
    const t = useTranslation();
    const {model} = useWorkspace();
    const providedEntities = useProvidedEntities(
        model.dataProvider,
        pattern.state.values
    );
    const selected = Array.from(providedEntities.data.values());
    return (
        <EntitySelect
            dataProvider={model.dataProvider}
            selectedStatus={
                providedEntities.status === 'completed'
                    ? undefined : providedEntities.status
            }
            selected={selected}
            setSelected={update => {
                const nextValues = update(selected);
                setPattern(new SearchPatternFromValues({
                    ...pattern.state,
                    values: nextValues.map(v => v.id),
                }));
            }}
            placeholder={t.text('search_criteria.from_values.input.placeholder')}
            sizeVariant='s'
        />
    );
}

/**
 * Search criteria option corresponding to {@link LookupPatternHasProperty}.
 */
export const SearchCriterionHasProperty: SearchCriteriaOption<SearchPatternHasProperty> = {
    type: SearchPatternHasProperty,
    label: TranslatedText.text('search_criteria.has_property.label'),
    createPattern: () => new SearchPatternHasProperty({propertyType: ''}),
    renderCriterion: props => <HasPropertyCriterion {...props} />,
};

function HasPropertyCriterion(
    props: SearchCriteriaRenderProps<SearchPatternHasProperty>
) {
    const {pattern, setPattern, inEditMode, controls} = props;
    const t = useTranslation();

    const [propertyType] = useProvidedSchemaTypes(
        'propertyType',
        pattern.state.propertyType ? [pattern.state.propertyType] : []
    );

    let header: React.ReactNode;
    let where: React.ReactNode = null;

    if (!inEditMode) {
        const propertyView = propertyType ? (
            <SchemaTypeView typeKind='propertyType'
                typeData={propertyType}
                selected
                inline
            />
        ) : (
            <div className={`${CLASS_NAME}__any-property-type`}>
                {t.text('search_criteria.has_property.any_property')}
            </div>
        );

        header = (
            <span className={`${CLASS_NAME}__condition`}>
                {t.template('search_criteria.has_property', {
                    propertyType: propertyView,
                })}
            </span>
        );
    } else {
        header = <div>{t.text('search_criteria.has_property.header')}</div>;
        where = (
            <SchemaTypeSelect typeKind='propertyType'
                selected={propertyType ? [propertyType] : []}
                setSelected={([next]) => {
                    setPattern(new SearchPatternHasProperty({
                        ...pattern.state,
                        propertyType: next?.id ?? '',
                    }));
                }}
                placeholder={t.text('search_criteria.has_property.input.placeholder')}
                sizeVariant='s'
            />
        );
    }

    return (
        <SearchCriterionBlock target={pattern}
            header={header}
            controls={controls}>
            {where}
        </SearchCriterionBlock>
    );
}
