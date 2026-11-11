import cx from 'clsx';
import * as React from 'react';

import { TranslatedText, useTranslation } from '../../coreUtils/i18n';
import { ElementIri } from '../../data/model';
import { EntityElement } from '../../editor/dataElements';
import { useProvidedEntities } from '../../editor/useProvidedEntities';
import { useWorkspace } from '../../workspace/workspaceContext';

import { DropdownMenu, DropdownMenuItem, useDropdownMenu } from '../utility/dropdown';
import { InlineEntity } from '../utility/inlineEntity';
import { SchemaTypeView } from '../utility/schemaTypeView';

import { EntitySelect } from './entitySelect';
import { SchemaTypeSelect, LinkDirectionSelect, useSchemaType } from './schemaTypeSelect';
import {
    SearchPattern, SearchPatternType, SearchPatternErrorItem, SerializedSearchPattern,
    SearchPatternError, SearchPatternAllOf, SearchPatternAnyOf, SearchPatternConnectedTo,
    SearchPatternFromValues, SearchPatternHasProperty, SearchPatternHasType,
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
        props: SearchCriterionProps<P>
    ) => React.ReactNode;
}

/**
 * Props for rendering a component from {@link SearchCriteriaOption.renderCriterion}.
 */
export interface SearchCriterionProps<in P extends SearchPattern> {
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
    readonly allOptions: readonly SearchCriteriaOption[];
    readonly creatableOptions: readonly SearchCriteriaOption[];
}
export const SearchCriterionContext = React.createContext<SearchCriterionContext>({
    editing: false,
    errors: new Map(),
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
        pattern instanceof SearchPatternAllOf ||
        pattern instanceof SearchPatternAnyOf
    );
    const controls = editing ? (
        <div className={`${CLASS_NAME}__controls reactodia-btn-group`}>
            {isLogicalPattern ? null : (
                <AddCriterion
                    onAdd={added => setPattern(new SearchPatternAllOf({
                        patterns: [pattern, added],
                    }))}
                    title={t.textOptional('search_entities.criteria_all_of_add.title')}>
                    {t.text('search_entities.criteria_all_of_add.label')}
                </AddCriterion>
            )}
            {isLogicalPattern ? null : (
                <AddCriterion
                    onAdd={added => setPattern(new SearchPatternAnyOf({
                        patterns: [pattern, added]
                    }))}
                    title={t.textOptional('search_entities.criteria_any_of_add.title')}>
                    {t.text('search_entities.criteria_any_of_add.label')}
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
    const optionProps: SearchCriterionProps<SearchPattern> = {
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
     * Criterion editing UI, e.g. inputs, {@link SearchCriterionWhereGroup}, etc.
     */
    children?: React.ReactNode;
}) {
    const {target, header, controls, children} = props;
    const t = useTranslation();
    const {errors} = React.useContext(SearchCriterionContext);
    const targetErrors = errors.get(target);
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
                <ul className={`${CLASS_NAME}__block-errors`}>
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
export function SearchCriterionWhereGroup(props: {
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
export function SearchCriterionWhere(props: {
    /**
     * Definition label, e.g. "target" or "sub-pattern" to display.
     */
    part: string;
    /**
     * Definition content.
     */
    children: React.ReactNode;
}) {
    const {part, children} = props;
    const t = useTranslation();
    return (
        <>
            <dt>
                {t.template('search_entities.criteria_where_caption', {
                    part: <span className={`${CLASS_NAME}__where-part`}>{part}</span>,
                })}
            </dt>
            <dd>
                {children}
            </dd>
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
                {t.text('search_entities.criteria_placeholder_any')}
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

    toJSON(): SerializedSearchPattern {
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
    props: SearchCriterionProps<SearchPatternUnknown>
) {
    const {pattern, controls} = props;
    const t = useTranslation();
    return (
        <SearchCriterionBlock target={pattern}
            controls={controls}
            header={
                <div>
                    {t.text('search_entities.criteria_placeholder_unknown')}
                </div>
            }
        />
    );
}

/**
 * Search criteria option corresponding to {@link LookupPatternAllOf}.
 */
export const SearchCriterionAllOf: SearchCriteriaOption<SearchPatternAllOf> = {
    type: SearchPatternAllOf,
    createPattern: () => new SearchPatternAllOf({patterns: []}),
    renderCriterion: props => <AnyAllOfCriterion {...props} />,
};

/**
 * Search criteria option corresponding to {@link LookupPatternAnyOf}.
 */
export const SearchCriterionAnyOf: SearchCriteriaOption<SearchPatternAnyOf> = {
    type: SearchPatternAnyOf,
    createPattern: () => new SearchPatternAnyOf({patterns: []}),
    renderCriterion: props => <AnyAllOfCriterion {...props} />,
};

function AnyAllOfCriterion<P extends SearchPatternAnyOf | SearchPatternAllOf>(
    props: SearchCriterionProps<P>
) {
    const {pattern, setPattern, inEditMode, parent} = props;
    const t = useTranslation();
    const className = parent
        ? `${CLASS_NAME}__logical-group`
        : `${CLASS_NAME}__logical-group-root`;
    return (
        <div className={className}>
            {pattern.state.patterns.map((child, index) => (
                <React.Fragment key={index}>
                    {index > 0 ? (
                        <div className={`${CLASS_NAME}__logical-joiner`}>
                            {(
                                pattern instanceof SearchPatternAllOf ? t.text(
                                    'search_entities.criteria_all_of_joiner'
                                ) : pattern instanceof SearchPatternAnyOf ? t.text(
                                    'search_entities.criteria_any_of_joiner'
                                ) : '-'
                            )}
                        </div>
                    ) : null}
                    <SearchCriterion key={index}
                        pattern={child}
                        setPattern={next => {
                            const nextPatterns = [...pattern.state.patterns];
                            if (next) {
                                if ((
                                    next instanceof SearchPatternAllOf &&
                                    pattern instanceof SearchPatternAllOf
                                ) || (
                                    next instanceof SearchPatternAnyOf &&
                                    pattern instanceof SearchPatternAnyOf
                                )) {
                                    nextPatterns.splice(index, 1, ...next.state.patterns);
                                } else {
                                    nextPatterns.splice(index, 1, next);
                                }
                            } else {
                                nextPatterns.splice(index, 1);
                            }

                            setPattern(
                                nextPatterns.length === 0 ? undefined :
                                nextPatterns.length === 1 ? nextPatterns[0] :
                                pattern instanceof SearchPatternAllOf ? new SearchPatternAllOf({
                                    patterns: nextPatterns,
                                }) :
                                pattern instanceof SearchPatternAnyOf ? new SearchPatternAnyOf({
                                    patterns: nextPatterns,
                                }) :
                                undefined
                            );
                        }}
                        parent={pattern}
                    />
                </React.Fragment>
            ))}
            {inEditMode && pattern.state.patterns.length === 0 ? (
                <AddCriterion
                    onAdd={added => {
                        setPattern(
                            pattern instanceof SearchPatternAllOf ? new SearchPatternAllOf({
                                patterns: [added],
                            }) :
                            pattern instanceof SearchPatternAnyOf ? new SearchPatternAnyOf({
                                patterns: [added],
                            }) :
                            undefined
                        );
                    }}
                    title={
                        pattern instanceof SearchPatternAllOf ? t.textOptional(
                            'search_entities.criteria_all_of_add.title'
                        ) : pattern instanceof SearchPatternAnyOf ? t.textOptional(
                            'search_entities.criteria_any_of_add.title'
                        ) : undefined
                    }>
                    {(
                        pattern instanceof SearchPatternAllOf ? t.text(
                            'search_entities.criteria_all_of_add.label'
                        ) : pattern instanceof SearchPatternAnyOf ? t.text(
                            'search_entities.criteria_any_of_add.label'
                        ) : t.text('search_entities.add_criterion.label')
                    )}
                </AddCriterion>
            ) : null}
        </div>
    );
}

/**
 * Search criteria option corresponding to {@link LookupPatternHasType}.
 */
export const SearchCriterionHasType: SearchCriteriaOption<SearchPatternHasType> = {
    type: SearchPatternHasType,
    label: TranslatedText.text('search_entities.criteria_has_type.label'),
    createPattern: () => new SearchPatternHasType({elementType: ''}),
    renderCriterion: props => <HasTypeCriterion {...props} />,
};

function HasTypeCriterion(
    props: SearchCriterionProps<SearchPatternHasType>
) {
    const {pattern, setPattern, inEditMode, controls} = props;
    const t = useTranslation();

    const elementType = useSchemaType('elementType', pattern.state.elementType);

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
                {t.text('search_entities.criteria_has_type.any_type')}
            </div>
        );

        header = (
            <span className={`${CLASS_NAME}__condition`}>
                {t.template('search_entities.criteria_has_type', {
                    entityType: typeView,
                })}
            </span>
        );
    } else {
        header = <div>{t.text('search_entities.criteria_has_type.header')}</div>;
        where = (
            <SchemaTypeSelect typeKind='elementType'
                selected={elementType}
                setSelected={type => setPattern(new SearchPatternHasType({
                    ...pattern.state,
                    elementType: type ? type.id : '',
                }))}
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
    label: TranslatedText.text('search_entities.criteria_connected.label'),
    createPattern: () => new SearchPatternConnectedTo({}),
    renderCriterion: props => <ConnectedToCriterion {...props} />,
};

function ConnectedToCriterion(
    props: SearchCriterionProps<SearchPatternConnectedTo>
) {
    const {pattern, setPattern, inEditMode, controls} = props;
    const t = useTranslation();

    const {target, linkDirection} = pattern.state;

    const linkType = useSchemaType('linkType', pattern.state.linkType);

    let inlineEntity = false;
    let header: React.ReactNode;
    let where: React.ReactNode = null;

    if (!inEditMode) {
        let entity: React.ReactElement;
        if (!target || target instanceof SearchPatternFromValues) {
            inlineEntity = true;
            entity = <FromValuesList values={target?.state.values ?? []} />;
        } else {
            entity = (
                <span className={`${CLASS_NAME}__link-target`}>
                    {t.text('search_entities.criteria_connected.target-part')}
                </span>
            );
        }

        const relationType = linkType ? (
            <SchemaTypeView typeKind='linkType'
                typeData={linkType}
                selected
                inline
            />
        ) : (
            <div className={`${CLASS_NAME}__any-link-type`}>
                {t.text('search_entities.criteria_connected.any-link')}
            </div>
        );

        const sourceIcon = <span className={`${CLASS_NAME}__link-in`} />;
        const targetIcon = <span className={`${CLASS_NAME}__link-out`} />;

        header = (
            <span className={`${CLASS_NAME}__condition`}>
                {!linkType && !linkDirection ? (
                    t.template('search_entities.criteria_connected', {
                        entity, relationType, sourceIcon, targetIcon,
                    })
                ) : linkDirection === 'in' ? (
                    t.template('search_entities.criteria_connected_to_source', {
                        entity, relationType, sourceIcon, targetIcon,
                    })
                ) : linkDirection == 'out' ? (
                    t.template('search_entities.criteria_connected_to_target', {
                        entity, relationType, sourceIcon, targetIcon,
                    })
                ) : (
                    t.template('search_entities.criteria_connected_via', {
                        entity, relationType, sourceIcon, targetIcon,
                    })
                )}
            </span>
        );
    } else {
        header = (
            <div>
                {t.template('search_entities.criteria_connected.header', {
                    entity: (
                        <span className={`${CLASS_NAME}__link-target`}>
                            {t.text('search_entities.criteria_connected.target-part')}
                        </span>
                    ),
                })}
            </div>
        );
        where = (
            <div className={`${CLASS_NAME}__directed-link-selector`}>
                <SchemaTypeSelect typeKind='linkType'
                    selected={linkType}
                    setSelected={next => setPattern(new SearchPatternConnectedTo({
                        ...pattern.state,
                        linkType: next?.id,
                    }))}
                />
                <LinkDirectionSelect selected={linkDirection}
                    setSelected={next => setPattern(new SearchPatternConnectedTo({
                        ...pattern.state,
                        linkDirection: next,
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
                        part={t.text('search_entities.criteria_connected.target-part')}>
                        <SearchCriterion pattern={pattern.state.target}
                            setPattern={target => setPattern(new SearchPatternConnectedTo({
                                ...pattern.state,
                                target,
                            }))}
                            parent={pattern}
                        />
                    </SearchCriterionWhere>
                </SearchCriterionWhereGroup>
            )}
        </SearchCriterionBlock>
    );
}

/**
 * Search criteria option corresponding to {@link LookupPatternFromValues}.
 */
export const SearchCriterionFromValues: SearchCriteriaOption<SearchPatternFromValues> = {
    type: SearchPatternFromValues,
    label: TranslatedText.text('search_entities.criteria_from_values.label'),
    createPattern: () => new SearchPatternFromValues({values: []}),
    renderCriterion: props => <FromValuesCriterion {...props} />,
};

function FromValuesCriterion(
    props: SearchCriterionProps<SearchPatternFromValues>
) {
    const {pattern, setPattern, inEditMode, controls} = props;
    const t = useTranslation();

    let header: React.ReactNode;
    let where: React.ReactNode = null;
    if (!inEditMode) {
        header = (
            <span className={`${CLASS_NAME}__condition`}>
                {t.template('search_entities.criteria_from_values', {
                    values: <FromValuesList values={pattern.state.values} />,
                })}
            </span>
        );
    } else {
        header = <div>{t.text('search_entities.criteria_from_values.header')}</div>;
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
        return <span>{t.text('search_entities.criteria_from_values.any-entity')}</span>;
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
                                    {t.text('search_entities.criteria_from_values.joiner')}
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
                {t.text('search_entities.criteria_from_values.many-entities', {
                    count: values.length,
                })}
            </span>
        );
    }
}

function FromValuesSelector(props: Pick<
    SearchCriterionProps<SearchPatternFromValues>,
    'pattern' | 'setPattern'
>) {
    const {pattern, setPattern} = props;
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
        />
    );
}

/**
 * Search criteria option corresponding to {@link LookupPatternHasProperty}.
 */
export const SearchCriterionHasProperty: SearchCriteriaOption<SearchPatternHasProperty> = {
    type: SearchPatternHasProperty,
    label: TranslatedText.text('search_entities.criteria_has_property.label'),
    createPattern: () => new SearchPatternHasProperty({propertyType: ''}),
    renderCriterion: props => <HasPropertyCriterion {...props} />,
};

function HasPropertyCriterion(
    props: SearchCriterionProps<SearchPatternHasProperty>
) {
    const {pattern, setPattern, inEditMode, controls} = props;
    const t = useTranslation();

    const propertyType = useSchemaType('propertyType', pattern.state.propertyType);

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
                {t.text('search_entities.criteria_has_property.any-property')}
            </div>
        );

        header = (
            <span className={`${CLASS_NAME}__condition`}>
                {t.template('search_entities.criteria_has_property', {
                    propertyType: propertyView,
                })}
            </span>
        );
    } else {
        header = <div>{t.text('search_entities.criteria_has_property.header')}</div>;
        where = (
            <SchemaTypeSelect typeKind='propertyType'
                selected={propertyType}
                setSelected={next => {
                    setPattern(new SearchPatternHasProperty({
                        ...pattern.state,
                        propertyType: next?.id ?? '',
                    }));
                }}
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
