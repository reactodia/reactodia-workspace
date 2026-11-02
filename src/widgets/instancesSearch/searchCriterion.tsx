import cx from 'clsx';
import * as React from 'react';

import { TranslatedText, useTranslation } from '../../coreUtils/i18n';
import { useKeyedSyncStore } from '../../coreUtils/keyedObserver';
import { LookupPattern } from '../../data/dataProvider';
import { ElementIri } from '../../data/model';
import { EntityElement } from '../../editor/dataElements';
import {
    subscribeElementTypes, subscribeLinkTypes, subscribePropertyTypes,
} from '../../editor/observedElement';
import { useProvidedEntities } from '../../editor/useProvidedEntities';
import { useWorkspace } from '../../workspace/workspaceContext';

import { DropdownMenu, DropdownMenuItem, useDropdownMenu } from '../utility/dropdown';
import { InlineEntity } from '../utility/inlineEntity';
import { SchemaTypeView } from '../utility/schemaTypeView';

import { EntitySelect } from './entitySelect';
import { SchemaTypeSelect, LinkDirectionSelect } from './schemaTypeSelect';
import {
    SearchPattern, SearchPatternType, SearchPatternState,
    SearchPatternAllOf, SearchPatternAnyOf, SearchPatternConnectedTo, SearchPatternFromValues,
    SearchPatternHasProperty, SearchPatternHasType,
} from './searchPattern';

export interface SearchCriterionOption<out P extends SearchPatternType = SearchPatternType> {
    readonly type: P;
    readonly label?: React.ReactNode;
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
            <PlaceholderCriterion setPattern={setPattern}
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
                    ))}>
                    and
                </AddCriterion>
            )}
            {isLogicalPattern ? null : (
                <AddCriterion
                    onAdd={added => setPattern(SearchPattern.create(
                        SearchPatternAnyOf,
                        {patterns: [pattern, added]}
                    ))}>
                    or
                </AddCriterion>
            )}
            <button type='button'
                className={cx(
                    `${CLASS_NAME}__remove`,
                    'reactodia-btn reactodia-btn-default'
                )}
                title={t.text('search_entities.remove_criteria.title')}
                onClick={() => setPattern(undefined)}>
            </button>
        </div>
    ) : null;
    const option =
        patternOptions.find(option => option.type === pattern.type) ?? UnknownOption;
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
    children: React.ReactNode;
}) {
    const {onAdd, children} = props;
    const {patternOptions} = React.useContext(SearchCriterionContext);
    return (
        <DropdownMenu className={`${CLASS_NAME}__add`}
            toggle={
                <AddCriterionButton>
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
                    {option.label}
                </DropdownMenuItem>
            ) : null)}
        </DropdownMenu>
    );
}

function AddCriterionButton(props: { children: React.ReactNode }) {
    const {children} = props;
    const {expanded, setExpanded} = useDropdownMenu();
    return (
        <button
            className={cx(
                `${CLASS_NAME}__add-button`,
                'reactodia-btn reactodia-btn-default',
                expanded ? 'active': undefined
            )}
            onClick={() => setExpanded(previous => !previous)}>
            {children}
        </button>
    );
}

function CriterionBlock(props: {
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

function WhereCriterions(props: { children: React.ReactElement }) {
    const {children} = props;
    return (
        <dl className={`${CLASS_NAME}__where-group`}>
            {children}
        </dl>
    );
}

function WhereCriterion(props: {
    part: string;
    pattern: SearchPattern | undefined;
    setPattern: (pattern: SearchPattern | undefined) => void;
    parent: SearchPattern | undefined;
}) {
    const {part, pattern, setPattern, parent} = props;
    return (
        <>
            <dt>where&nbsp;<b>{part}</b>&nbsp;=</dt>
            <dd>
                <SearchCriterion pattern={pattern}
                    setPattern={setPattern}
                    parent={parent}
                />
            </dd>
        </>
    );
}

function PlaceholderCriterion(props: {
    setPattern: (pattern: SearchPattern) => void;
    editing: boolean;
    topLevel?: boolean;
}) {
    const {setPattern, editing, topLevel} = props;

    if (!editing) {
        return topLevel ? null : <div><i>any entity</i></div>;
    }

    return (
        <AddCriterion onAdd={setPattern}>
            add
        </AddCriterion>
    );
}

const UnknownOption: SearchCriterionOption<SearchPatternType> = {
    type: SearchPattern.type('urn:reactodia:unknownPattern').of<object>(),
    createState: () => ({}),
    renderCriterion: props => <UnknownCriterion {...props} />,
    generatePattern: () => {
        throw new Error('Unknown pattern type');
    },
};

function UnknownCriterion(
    props: SearchCriterionProps<typeof UnknownOption.type>
) {
    const {pattern, controls} = props;
    return (
        <div>
            <div>Unknown pattern type &quot;{pattern.type}&quot;</div>
            {controls}
        </div>
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
                errors: [{target, message: 'Should have at least one sub-pattern'}],
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
                errors: [{target, message: 'Should have at least one sub-pattern'}],
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
    const operatorLabel = (
        pattern.type === SearchPatternAllOf ? 'and' :
        pattern.type === SearchPatternAnyOf ? 'or' :
        pattern.type
    );
    const className = parent
        ? `${CLASS_NAME}__logical-group`
        : `${CLASS_NAME}__logical-group-root`;
    return (
        <div className={className}>
            {pattern.state.patterns.map((child, index) => (
                <React.Fragment key={index}>
                    {index > 0 ? (
                        <div className={`${CLASS_NAME}__logical-operator`}>
                            {operatorLabel}
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
                    })}>
                    {operatorLabel}
                </AddCriterion>
            ) : null}
        </div>
    );
}

export const SearchCriterionHasType: SearchCriterionOption<typeof SearchPatternHasType> = {
    type: SearchPatternHasType,
    label: 'has type',
    createState: () => ({elementType: ''}),
    renderCriterion: props => <HasTypeCriterion {...props} />,
    generatePattern: (state, target) => {
        if (!state.elementType) {
            return {
                type: 'error',
                errors: [{target, message: 'Element type is required'}],
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
    const {model} = useWorkspace();

    const elementType = pattern.state.elementType
        ? model.createElementType(pattern.state.elementType).data
        : undefined;
    useKeyedSyncStore(subscribeElementTypes, elementType ? [elementType.id] : [], model);

    let header: React.ReactNode;
    let where: React.ReactNode | null = null;
    if (!editing) {
        header = (
            <>
                {t.template('search_entities.criteria_has_type', {
                    entityType: elementType
                        ? <SchemaTypeView schemaType={elementType} selected />
                        : <div><b>any</b></div>,
                })}
            </>
        );
    } else {
        header = <div>Has type</div>;
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
        <CriterionBlock target={pattern}
            header={header}
            controls={controls}>
            {where}
        </CriterionBlock>
    );
}

export const SearchCriterionConnectedTo: SearchCriterionOption<typeof SearchPatternConnectedTo> = {
    type: SearchPatternConnectedTo,
    label: 'connected to',
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
    const {model} = useWorkspace();

    const {target, linkDirection} = pattern.state;

    const linkType = pattern.state.linkType
        ? model.createLinkType(pattern.state.linkType).data
        : undefined;
    useKeyedSyncStore(subscribeLinkTypes, linkType ? [linkType.id] : [], model);

    let inlineEntity = false;
    let header: React.ReactNode;
    let where: React.ReactNode = null;

    if (!editing) {
        let entity: React.ReactElement;
        if (!target || SearchPattern.hasType(target, SearchPatternFromValues)) {
            inlineEntity = true;
            entity = <FromValuesList values={target?.state.values ?? []} />;
        } else {
            entity = <span><b>target</b></span>;
        }

        let relationType: React.ReactElement | undefined;
        if (linkType) {
            const linkTypeLabel = t.formatLabel(
                linkType.label,
                linkType.id,
                model.language
            );
            relationType = (
                <span className={`${CLASS_NAME}__link-type`}
                    title={model.locale.formatIri(linkType.id)}>
                    {linkTypeLabel}
                </span>
            );
        } else {
            relationType = <i>any link</i>;
        }

        const sourceIcon = <span className={`${CLASS_NAME}__link-direction-in`} />;
        const targetIcon = <span className={`${CLASS_NAME}__link-direction-out`} />;

        header = (
            <div>
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
            </div>
        );
    } else {
        header = <div>Connected to <b>target</b> via</div>;
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
        <CriterionBlock target={pattern}
            header={header}
            controls={controls}>
            {where}
            {inlineEntity ? null : (
                <WhereCriterions>
                    <WhereCriterion part='target'
                        pattern={pattern.state.target}
                        setPattern={target => updatePattern({
                            ...pattern,
                            state: {...pattern.state, target},
                        })}
                        parent={pattern}
                    />
                </WhereCriterions>
            )}
        </CriterionBlock>
    );
}

export const SearchCriterionFromValues: SearchCriterionOption<typeof SearchPatternFromValues> = {
    type: SearchPatternFromValues,
    label: 'one of entities',
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

    let header: React.ReactNode;
    let where: React.ReactNode = null;
    if (!editing) {
        header = (
            <div>
                {'One of '}
                <FromValuesList values={pattern.state.values} />
            </div>
        );
    } else {
        header = <div>One of entities</div>;
        where = <FromValuesSelector pattern={pattern} updatePattern={updatePattern} />;
    }

    return (
        <CriterionBlock target={pattern}
            header={header}
            controls={controls}>
            {where}
        </CriterionBlock>
    );
}

function FromValuesList(props: {
    values: readonly ElementIri[]
}) {
    const {values} = props;
    const {model} = useWorkspace();
    const providedEntities = useProvidedEntities(model.dataProvider, values);
    if (values.length === 0) {
        return <span>any entity</span>;
    } else if (values.length <= 10) {
        return (
            <span>
                {values.map((iri, index) => {
                    const data = providedEntities.data.get(iri)
                        ?? EntityElement.placeholderData(iri);
                    return (
                        <>
                            {index === 0 ? null : <span>&nbsp;or&nbsp;</span>}
                            <InlineEntity target={data} />
                        </>
                    );
                })}
            </span>
        );
    } else {
        return <span>one of {values.length} entities</span>;
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
    label: 'has property',
    createState: () => ({propertyType: ''}),
    renderCriterion: props => <HasPropertyCriterion {...props} />,
    generatePattern: (state, target) => {
        if (!state.propertyType) {
            return {
                type: 'error',
                errors: [{target, message: 'Property type is required'}],
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
    const {model} = useWorkspace();

    const propertyType = pattern.state.propertyType
        ? model.createPropertyType(pattern.state.propertyType).data
        : undefined;
    useKeyedSyncStore(subscribePropertyTypes, propertyType ? [propertyType.id] : [], model);

    let header: React.ReactNode;
    let where: React.ReactNode = null;

    if (!editing) {
        let propertyTypeLabel: string | undefined;
        if (propertyType) {
            propertyTypeLabel = t.formatLabel(
                propertyType.label,
                propertyType.id,
                model.language
            );
        }

        header = <span>has <b>{propertyTypeLabel}</b> values</span>;
    } else {
        header = 'Has property';
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
        <CriterionBlock target={pattern}
            header={header}
            controls={controls}>
            {where}
        </CriterionBlock>
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
