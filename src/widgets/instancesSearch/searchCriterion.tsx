import cx from 'clsx';
import * as React from 'react';

import { TranslatedText, useTranslation } from '../../coreUtils/i18n';
import { LookupPattern } from '../../data/dataProvider';
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
    SearchPattern, SearchPatternType, SearchPatternState,
    SearchPatternAllOf, SearchPatternAnyOf, SearchPatternConnectedTo, SearchPatternFromValues,
    SearchPatternHasProperty, SearchPatternHasType,
} from './searchPattern';

export interface SearchCriterionOption<out P extends SearchPatternType = SearchPatternType> {
    readonly type: P;
    readonly label?: string | TranslatedText;
    readonly createState: () => SearchPatternState<P>;
    readonly renderCriterion: (
        props: SearchCriterionProps<P>
    ) => React.ReactNode;
    readonly generatePattern: (
        state: SearchPatternState<P>,
        target: SearchPattern,
        context: SearchCriterionGenerateContext
    ) => LookupPattern | SearchCriterionErrorPattern;
}

export interface SearchCriterionProps<in P extends SearchPatternType> {
    pattern: SearchPattern<P>;
    updatePattern: (state: SearchPattern<P> | undefined) => void;
    replacePattern: (state: SearchPattern | undefined) => void;
    editing: boolean;
    parent?: SearchPattern;
    controls?: React.ReactNode;
}

export interface SearchCriterionGenerateContext {
    readonly generate: (
        pattern: SearchPattern
    ) => LookupPattern | SearchCriterionErrorPattern;
    readonly generateMany: (
        patterns: readonly SearchPattern[]
    ) => LookupPattern[] | SearchCriterionErrorPattern;
}

export interface SearchCriterionErrorPattern {
    readonly type: 'error';
    readonly errors: readonly SearchCriterionError[];
}

export interface SearchCriterionError {
    readonly target: SearchPattern;
    readonly message: string | TranslatedText;
}

export interface SearchCriterionContext {
    readonly editing: boolean;
    readonly errors: ReadonlyMap<SearchPattern, readonly SearchCriterionError[]>;
    readonly patternOptions: readonly SearchCriterionOption[];
}
export const SearchCriterionContext = React.createContext<SearchCriterionContext>({
    editing: false,
    errors: new Map(),
    patternOptions: [],
});

export function makePatternGenerator(
    patternOptions: readonly SearchCriterionOption[]
): SearchCriterionGenerateContext {
    const generateSingle = (
        pattern: SearchPattern
    ): LookupPattern | SearchCriterionErrorPattern => {
        const option = patternOptions.find(option => option.type === pattern.type);
        if (!option) {
            throw new Error(
                `Found no option to generate lookup pattern for type: '${pattern.type}'`
            );
        }
        return option.generatePattern(pattern.state, pattern, context);
    };
    const generateMany = (
        patterns: readonly SearchPattern[]
    ): LookupPattern[] | SearchCriterionErrorPattern => {
        const results: LookupPattern[] = [];
        const errors: SearchCriterionError[] = [];
        let hasError = false;
        for (const pattern of patterns) {
            const result = generateSingle(pattern);
            if (result.type === 'error') {
                hasError = true;
                for (const error of result.errors) {
                    errors.push(error);
                }
            } else {
                results.push(result);
            }
        }
        return hasError ? {type: 'error', errors} : results;
    };
    const context: SearchCriterionGenerateContext = {
        generate: generateSingle,
        generateMany,
    };
    return context;
}

const CLASS_NAME = 'reactodia-search-criterion';

export function SearchCriterion(props: {
    pattern: SearchPattern | undefined;
    setPattern: (pattern: SearchPattern | undefined) => void;
    parent: SearchPattern | undefined;
}) {
    const {pattern, setPattern, parent} = props;
    const t = useTranslation();
    const {editing, patternOptions} = React.useContext(SearchCriterionContext);

    if (!pattern) {
        return (
            <PlaceholderAnyCriterion setPattern={setPattern}
                editing={editing}
                topLevel={parent === undefined}
            />
        );
    }
    
    const isLogicalPattern = (
        SearchPattern.hasType(pattern, SearchPatternAllOf) ||
        SearchPattern.hasType(pattern, SearchPatternAnyOf)
    );
    const controls = editing ? (
        <div className={`${CLASS_NAME}__controls reactodia-btn-group`}>
            {isLogicalPattern ? null : (
                <AddCriterion
                    onAdd={added =>  setPattern(SearchPattern.create(
                        SearchPatternAllOf,
                        {patterns: [pattern, added]}
                    ))}
                    title={t.textOptional('search_entities.criteria_all_of_add.title')}>
                    {t.text('search_entities.criteria_all_of_add.label')}
                </AddCriterion>
            )}
            {isLogicalPattern ? null : (
                <AddCriterion
                    onAdd={added => setPattern(SearchPattern.create(
                        SearchPatternAnyOf,
                        {patterns: [pattern, added]}
                    ))}
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
    const option = patternOptions.find(option => option.type === pattern.type)
        ?? PlaceholderUnknownOption;
    const optionProps: SearchCriterionProps<SearchPatternType<string, unknown>> = {
        pattern: pattern as SearchPattern<SearchPatternType>,
        updatePattern: setPattern,
        replacePattern: setPattern,
        editing,
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
    const {patternOptions} = React.useContext(SearchCriterionContext);
    return (
        <DropdownMenu className={`${CLASS_NAME}__add`}
            toggle={
                <AddCriterionButton
                    title={title ?? t.text('search_entities.add_criterion.title')}>
                    {children}
                </AddCriterionButton>
            }>
            {patternOptions.map(option => option.label ? (
                <DropdownMenuItem key={option.type}
                    onSelect={() => {
                        const pattern = SearchPattern.create(
                            option.type,
                            option.createState()
                        );
                        onAdd(pattern);
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

export function SearchCriterionBlock(props: {
    target: SearchPattern;
    header: React.ReactNode;
    controls: React.ReactNode;
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

export function SearchCriterionWhereGroup(props: { children: React.ReactElement }) {
    const {children} = props;
    return (
        <dl className={`${CLASS_NAME}__where-group`}>
            {children}
        </dl>
    );
}

export function SearchCriterionWhere(props: {
    part: string;
    pattern: SearchPattern | undefined;
    setPattern: (pattern: SearchPattern | undefined) => void;
    parent: SearchPattern | undefined;
}) {
    const {part, pattern, setPattern, parent} = props;
    const t = useTranslation();
    return (
        <>
            <dt>
                {t.template('search_entities.criteria_where_caption', {
                    part: <span className={`${CLASS_NAME}__where-part`}>{part}</span>,
                })}
            </dt>
            <dd>
                <SearchCriterion pattern={pattern}
                    setPattern={setPattern}
                    parent={parent}
                />
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

const PlaceholderUnknownOption: SearchCriterionOption<SearchPatternType> = {
    type: SearchPattern.type('urn:reactodia:unknownPattern').of<object>(),
    createState: () => ({}),
    renderCriterion: props => <PlaceholderUnknownCriterion {...props} />,
    generatePattern: () => {
        throw new Error('Unknown pattern type');
    },
};

function PlaceholderUnknownCriterion(
    props: SearchCriterionProps<typeof PlaceholderUnknownOption.type>
) {
    const {pattern, controls} = props;
    const t = useTranslation();
    return (
        <SearchCriterionBlock target={pattern}
            controls={controls}
            header={
                <div>
                    {t.text('search_entities.criteria_placeholder_unknown', {
                        patternType: pattern.type,
                    })}
                </div>
            }
        />
    );
}

export const SearchCriterionAllOf: SearchCriterionOption<typeof SearchPatternAllOf> = {
    type: SearchPatternAllOf,
    createState: () => ({patterns: []}),
    renderCriterion: props => <AnyAllOfCriterion {...props} />,
    generatePattern: (state, target, context) => {
        if (state.patterns.length === 0) {
            return {
                type: 'error',
                errors: [{
                    target,
                    message: TranslatedText.text(
                        'search_entities.error.required_at_least_one_pattern'
                    ),
                }],
            };
        }
        const inner = context.generateMany(state.patterns);
        return Array.isArray(inner) ? {type: 'allOf', patterns: inner} : inner;
    },
};

export const SearchCriterionAnyOf: SearchCriterionOption<typeof SearchPatternAnyOf> = {
    type: SearchPatternAnyOf,
    createState: () => ({patterns: []}),
    renderCriterion: props => <AnyAllOfCriterion {...props} />,
    generatePattern: (state, target, context) => {
        if (state.patterns.length === 0) {
            return {
                type: 'error',
                errors: [{
                    target,
                    message: TranslatedText.text(
                        'search_entities.error.required_at_least_one_pattern'
                    ),
                }],
            };
        }
        const inner = context.generateMany(state.patterns);
        return Array.isArray(inner) ? {type: 'anyOf', patterns: inner} : inner;
    },
};

function AnyAllOfCriterion<P extends typeof SearchPatternAnyOf | typeof SearchPatternAllOf>(
    props: SearchCriterionProps<P>
) {
    const {pattern, updatePattern, replacePattern, editing, parent} = props;
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
                                pattern.type === SearchPatternAllOf ? t.text(
                                    'search_entities.criteria_all_of_joiner'
                                ) : pattern.type === SearchPatternAnyOf ? t.text(
                                    'search_entities.criteria_any_of_joiner'
                                ) : pattern.type
                            )}
                        </div>
                    ) : null}
                    <SearchCriterion key={`${index}-${child.type}`}
                        pattern={child}
                        setPattern={next => {
                            const nextPatterns = [...pattern.state.patterns];
                            if (next) {
                                if (SearchPattern.hasType(next, pattern.type)) {
                                    nextPatterns.splice(index, 1, ...next.state.patterns);
                                } else {
                                    nextPatterns.splice(index, 1, next);
                                }
                            } else {
                                nextPatterns.splice(index, 1);
                            }

                            replacePattern(
                                nextPatterns.length === 0 ? undefined :
                                nextPatterns.length === 1 ? nextPatterns[0] :
                                {
                                    ...pattern,
                                    state: {
                                        patterns: nextPatterns,
                                    } satisfies SearchPatternState<
                                        typeof SearchPatternAllOf | typeof SearchCriterionAnyOf
                                    >,
                                }
                            );
                        }}
                        parent={pattern}
                    />
                </React.Fragment>
            ))}
            {editing && pattern.state.patterns.length === 0 ? (
                <AddCriterion
                    onAdd={added => updatePattern({
                        ...pattern,
                        state: {
                            patterns: [added]
                        } satisfies SearchPatternState<
                            typeof SearchPatternAllOf | typeof SearchCriterionAnyOf
                        > as SearchPatternState<P>,
                    })}
                    title={
                        pattern.type === SearchPatternAllOf ? t.textOptional(
                            'search_entities.criteria_all_of_add.title'
                        ) : pattern.type === SearchPatternAnyOf ? t.textOptional(
                            'search_entities.criteria_any_of_add.title'
                        ) : undefined
                    }>
                    {(
                        pattern.type === SearchPatternAllOf ? t.text(
                            'search_entities.criteria_all_of_add.label'
                        ) : pattern.type === SearchPatternAnyOf ? t.text(
                            'search_entities.criteria_any_of_add.label'
                        ) : t.text('search_entities.add_criterion.label')
                    )}
                </AddCriterion>
            ) : null}
        </div>
    );
}

export const SearchCriterionHasType: SearchCriterionOption<typeof SearchPatternHasType> = {
    type: SearchPatternHasType,
    label: TranslatedText.text('search_entities.criteria_has_type.label'),
    createState: () => ({elementType: ''}),
    renderCriterion: props => <HasTypeCriterion {...props} />,
    generatePattern: (state, target) => {
        if (!state.elementType) {
            return {
                type: 'error',
                errors: [{
                    target,
                    message: TranslatedText.text(
                        'search_entities.error.required_element_type'
                    ),
                }],
            };
        }
        return {
            type: 'hasType',
            elementType: state.elementType,
        };
    },
};

function HasTypeCriterion(
    props: SearchCriterionProps<typeof SearchPatternHasType>
) {
    const {pattern, updatePattern, editing, controls} = props;
    const t = useTranslation();

    const elementType = useSchemaType('elementType', pattern.state.elementType);

    let header: React.ReactNode;
    let where: React.ReactNode | null = null;
    if (!editing) {
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
                setSelected={type => updatePattern({
                    ...pattern,
                    state: {...pattern.state, elementType: type ? type.id : ''},
                })}
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

export const SearchCriterionConnectedTo: SearchCriterionOption<typeof SearchPatternConnectedTo> = {
    type: SearchPatternConnectedTo,
    label: TranslatedText.text('search_entities.criteria_connected.label'),
    createState: () => ({}),
    renderCriterion: props => <ConnectedToCriterion {...props} />,
    generatePattern: (state, _target, context) => {
        const target = state.target ? context.generate(state.target) : undefined;
        if (target?.type === 'error') {
            return target;
        }
        return {
            type: 'connectedTo',
            linkType: state.linkType,
            linkDirection: state.linkDirection,
            target,
        };
    },
};

function ConnectedToCriterion(
    props: SearchCriterionProps<typeof SearchPatternConnectedTo>
) {
    const {pattern, updatePattern, editing, controls} = props;
    const t = useTranslation();

    const {target, linkDirection} = pattern.state;

    const linkType = useSchemaType('linkType', pattern.state.linkType);

    let inlineEntity = false;
    let header: React.ReactNode;
    let where: React.ReactNode = null;

    if (!editing) {
        let entity: React.ReactElement;
        if (!target || SearchPattern.hasType(target, SearchPatternFromValues)) {
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
                    setSelected={next => updatePattern({
                        ...pattern,
                        state: {
                            ...pattern.state,
                            linkType: next?.id,
                        },
                    })}
                />
                <LinkDirectionSelect selected={linkDirection}
                    setSelected={next => updatePattern({
                        ...pattern,
                        state: {
                            ...pattern.state,
                            linkDirection: next,
                        },
                    })}
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
                        part={t.text('search_entities.criteria_connected.target-part')}
                        pattern={pattern.state.target}
                        setPattern={target => updatePattern({
                            ...pattern,
                            state: {...pattern.state, target},
                        })}
                        parent={pattern}
                    />
                </SearchCriterionWhereGroup>
            )}
        </SearchCriterionBlock>
    );
}

export const SearchCriterionFromValues: SearchCriterionOption<typeof SearchPatternFromValues> = {
    type: SearchPatternFromValues,
    label: TranslatedText.text('search_entities.criteria_from_values.label'),
    createState: () => ({values: []}),
    renderCriterion: props => <FromValuesCriterion {...props} />,
    generatePattern: state => ({
        type: 'fromValues',
        values: state.values,
    }),
};

function FromValuesCriterion(
    props: SearchCriterionProps<typeof SearchPatternFromValues>
) {
    const {pattern, updatePattern, editing, controls} = props;
    const t = useTranslation();

    let header: React.ReactNode;
    let where: React.ReactNode = null;
    if (!editing) {
        header = (
            <span className={`${CLASS_NAME}__condition`}>
                {t.template('search_entities.criteria_from_values', {
                    values: <FromValuesList values={pattern.state.values} />,
                })}
            </span>
        );
    } else {
        header = <div>{t.text('search_entities.criteria_from_values.header')}</div>;
        where = <FromValuesSelector pattern={pattern} updatePattern={updatePattern} />;
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
    SearchCriterionProps<typeof SearchPatternFromValues>,
    'pattern' | 'updatePattern'
>) {
    const {pattern, updatePattern} = props;
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
                updatePattern({
                    ...pattern,
                    state: {
                        values: nextValues.map(v => v.id),
                    },
                });
            }}
        />
    );
}

export const SearchCriterionHasProperty: SearchCriterionOption<typeof SearchPatternHasProperty> = {
    type: SearchPatternHasProperty,
    label: TranslatedText.text('search_entities.criteria_has_property.label'),
    createState: () => ({propertyType: ''}),
    renderCriterion: props => <HasPropertyCriterion {...props} />,
    generatePattern: (state, target) => {
        if (!state.propertyType) {
            return {
                type: 'error',
                errors: [{
                    target,
                    message: TranslatedText.text(
                        'search_entities.error.required_property_type'
                    ),
                }],
            };
        }
        return {
            type: 'hasProperty',
            propertyType: state.propertyType,
            values: state.values,
        };
    },
};

function HasPropertyCriterion(
    props: SearchCriterionProps<typeof SearchPatternHasProperty>
) {
    const {pattern, updatePattern, editing, controls} = props;
    const t = useTranslation();

    const propertyType = useSchemaType('propertyType', pattern.state.propertyType);

    let header: React.ReactNode;
    let where: React.ReactNode = null;

    if (!editing) {
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
                    updatePattern({
                        ...pattern,
                        state: {...pattern.state, propertyType: next?.id ?? ''},
                    });
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

export const DefaultSearchCriterionOptions: readonly SearchCriterionOption[] = [
    SearchCriterionAllOf,
    SearchCriterionAnyOf,
    SearchCriterionHasType,
    SearchCriterionConnectedTo,
    SearchCriterionFromValues,
    SearchCriterionHasProperty,
];
