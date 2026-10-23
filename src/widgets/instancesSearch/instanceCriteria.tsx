import cx from 'clsx';
import * as React from 'react';

import { useTranslation } from '../../coreUtils/i18n';
import { LookupPattern } from '../../data/dataProvider';
import { ElementIri, ElementModel } from '../../data/model';
import { DataGraphStructure } from '../../editor/dataDiagramModel';
import { EntityElement, iterateEntitiesOf } from '../../editor/dataElements';
import { useProvidedEntities } from '../../editor/useProvidedEntities';
import { useWorkspace } from '../../workspace/workspaceContext';

import { DropdownMenu, DropdownMenuItem, useDropdownMenu } from '../utility/dropdown';
import { InlineEntity } from '../utility/inlineEntity';
import { SearchInput, SearchInputStore } from '../utility/searchInput';

import { EntitySelect } from './entitySelect';
import {
    SearchCriteria, SearchPattern, SearchPatternType, SearchPatternState, searchPatternFrom,
    SearchPatternAllOf, SearchPatternAnyOf, SearchPatternConnectedTo, SearchPatternFromValues,
    SearchPatternHasProperty, SearchPatternHasType, SearchPatternWithText,
} from './searchPattern';

const CLASS_NAME = 'reactodia-instances-search';

interface EntityCriterionOption<out P extends SearchPatternType = SearchPatternType> {
    readonly type: P;
    readonly label?: React.ReactNode;
    readonly createState: () => SearchPatternState<P>;
    readonly renderCriterion: (
        props: InstanceCriterionProps<P>
    ) => React.ReactNode;
    readonly generatePattern: (
        state: SearchPatternState<P>,
        options: GeneratePatternOptions
    ) => LookupPattern;
}

interface InstanceCriterionProps<in P extends SearchPatternType> {
    pattern: SearchPattern<P, SearchPatternState<P>>;
    setPattern: (state: SearchPattern | undefined) => void;
    editing: boolean;
    parent?: SearchPattern;
    controls?: React.ReactNode;
}

interface GeneratePatternOptions {
    readonly generate: (pattern: SearchPattern) => LookupPattern;
}

export function InstanceCriteria(props: {
    criteria: SearchCriteria;
    setCriteria: (criteria: SearchCriteria) => void;
    searchStore: SearchInputStore | undefined;
    patternOptions?: readonly EntityCriterionOption[];
}) {
    const {criteria, setCriteria, searchStore, patternOptions} = props;
    const t = useTranslation();

    const [outerCriteria, setOuterCriteria] = React.useState(criteria);
    const [pattern, setPattern] = React.useState(() => searchPatternFrom(criteria));
    const [editState, setEditState] =
        React.useState<{ original: SearchPattern | undefined }>();

    const context = React.useMemo((): InstanceCriterionContext => ({
        editing: editState !== undefined,
        patternOptions: patternOptions ?? [
            AllOfOption,
            AnyOfOption,
            HasTypeOption,
            ConnectedToOption,
            FromValuesOption,
            HasPropertyOption,
            WithTextOption,
        ],
    }), [editState, patternOptions]);
    const generate = makePatternGenerator(context.patternOptions);

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
            <InstanceCriterionContext.Provider value={context}>
                <div className={`${CLASS_NAME}__criterions`}>
                    <InstanceCriterion pattern={pattern}
                        setPattern={pattern => {
                            setPattern(pattern ?? SearchPattern.create(SearchPatternAllOf, {patterns: []}));
                        }}
                    />
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
                                    `${CLASS_NAME}__criterion-apply`,
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
                                    `${CLASS_NAME}__criterion-cancel`,
                                    'reactodia-btn reactodia-btn-default'
                                )}
                                onClick={() => {
                                    setPattern(editState.original);
                                    setEditState(undefined);
                                }}>
                                cancel
                            </button>
                        </>
                    ) : (
                        <>
                            <button type='button'
                                className={cx(
                                    `${CLASS_NAME}__criterion-edit`,
                                    'reactodia-btn reactodia-btn-default'
                                )}
                                onClick={() => setEditState({original: pattern})}>
                                edit
                            </button>
                            {pattern === undefined ? null : (
                                <button type='button'
                                    className={cx(
                                        `${CLASS_NAME}__criterion-clear`,
                                        'reactodia-btn reactodia-btn-default'
                                    )}
                                    onClick={() => setCriteria({})}>
                                    clear
                                </button>
                            )}
                        </>
                    )}
                </div>
            </InstanceCriterionContext.Provider>
        </div>
    );
}

interface InstanceCriterionContext {
    readonly editing: boolean;
    readonly patternOptions: readonly EntityCriterionOption[];
}
const InstanceCriterionContext = React.createContext<InstanceCriterionContext>({
    editing: false,
    patternOptions: [],
});

function makePatternGenerator(
    patternOptions: readonly EntityCriterionOption[]
): (pattern: SearchPattern) => LookupPattern {
    const generate = (pattern: SearchPattern): LookupPattern => {
        const option = patternOptions.find(option => option.type === pattern.type);
        if (!option) {
            throw new Error(
                `Found no option to generate lookup pattern for type: '${pattern.type}'`
            );
        }
        return option.generatePattern(pattern.state, {generate});
    };
    return generate;
}

export function InstanceCriterion(props: {
    pattern: SearchPattern | undefined;
    setPattern: (pattern: SearchPattern | undefined) => void;
    parent?: SearchPattern;
}) {
    const {pattern, setPattern, parent} = props;
    const t = useTranslation();
    const {editing, patternOptions} = React.useContext(InstanceCriterionContext);

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
        <div className={`${CLASS_NAME}__criterion-controls reactodia-btn-group`}>
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
                    `${CLASS_NAME}__criterion-remove`,
                    'reactodia-btn reactodia-btn-default'
                )}
                title={t.text('search_entities.remove_criteria.title')}
                onClick={() => setPattern(undefined)}>
            </button>
        </div>
    ) : null;
    const option =
        patternOptions.find(option => option.type === pattern.type) ?? UnknownOption;
    const optionProps: InstanceCriterionProps<SearchPatternType<string, unknown>> = {
        pattern: pattern as SearchPattern<SearchPatternType>,
        setPattern,
        editing,
        parent,
        controls,
    };

    return option.renderCriterion(optionProps);
}

function AddCriterion(props: {
    onAdd: (pattern: SearchPattern) => void;
    children: React.ReactNode;
}) {
    const {onAdd, children} = props;
    const {patternOptions} = React.useContext(InstanceCriterionContext);
    return (
        <DropdownMenu className={`${CLASS_NAME}__criterion-add`}
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
                `${CLASS_NAME}__criterion-add-button`,
                'reactodia-btn reactodia-btn-default',
                expanded ? 'active': undefined
            )}
            onClick={() => setExpanded(previous => !previous)}>
            {children}
        </button>
    );
}

function CriterionBlock(props: {
    controls: React.ReactNode;
    where?: React.ReactNode;
    children: React.ReactNode;
}) {
    const {controls, where, children} = props;
    return (
        <div className={`${CLASS_NAME}__criterion`}>
            <div>{children}</div>
            {controls}
            {where}
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
}) {
    const {part, pattern, setPattern} = props;
    return (
        <>
            <dt>where&nbsp;<b>{part}</b>&nbsp;=</dt>
            <dd>
                <InstanceCriterion pattern={pattern}
                    setPattern={setPattern}
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

const UnknownOption: EntityCriterionOption<SearchPatternType> = {
    type: SearchPattern.type('urn:reactodia:unknownPattern').of<object>(),
    createState: () => ({}),
    renderCriterion: props => <UnknownCriterion {...props} />,
    generatePattern: () => {
        throw new Error('Unknown pattern type');
    },
};

function UnknownCriterion(
    props: InstanceCriterionProps<typeof UnknownOption.type>
) {
    const {pattern, controls} = props;
    return (
        <div>
            <div>Unknown pattern type &quot;{pattern.type}&quot;</div>
            {controls}
        </div>
    );
}

const AllOfOption: EntityCriterionOption<typeof SearchPatternAllOf> = {
    type: SearchPatternAllOf,
    createState: () => ({patterns: []}),
    renderCriterion: props => <AnyAllOfCriterion {...props} />,
    generatePattern: (state, {generate}) => ({
        type: 'allOf',
        patterns: state.patterns.map(generate),
    }),
};

const AnyOfOption: EntityCriterionOption<typeof SearchPatternAnyOf> = {
    type: SearchPatternAnyOf,
    createState: () => ({patterns: []}),
    renderCriterion: props => <AnyAllOfCriterion {...props} />,
    generatePattern: (state, {generate}) => ({
        type: 'anyOf',
        patterns: state.patterns.map(generate),
    }),
};

function AnyAllOfCriterion(
    props: InstanceCriterionProps<typeof SearchPatternAnyOf | typeof SearchPatternAllOf>
) {
    const {pattern, setPattern, editing, parent} = props;
    const operatorLabel = (
        pattern.type === SearchPatternAllOf ? 'and' :
        pattern.type === SearchPatternAnyOf ? 'or' :
        pattern.type
    );
    const excludedTextPattern = parent === undefined
        ? pattern.state.patterns.find(p => SearchPattern.hasType(p, SearchPatternWithText))
        : undefined;
    const filteredPatterns = excludedTextPattern
        ? pattern.state.patterns.filter(p => p !== excludedTextPattern)
        : pattern.state.patterns;
    return (
        <div className={`${CLASS_NAME}__criteria-logical`}>
            {filteredPatterns.map((child, index) => (
                <React.Fragment key={index}>
                    {index > 0 ? (
                        <div className={`${CLASS_NAME}__criteria-logical-operator`}>
                            {operatorLabel}
                        </div>
                    ) : null}
                    <InstanceCriterion key={`${index}-${child.type}`}
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

                            setPattern(
                                nextPatterns.length === 0 ? undefined :
                                nextPatterns.length === 1 ? nextPatterns[0] :
                                {...pattern, state: {patterns: nextPatterns}}
                            );
                        }}
                    />
                </React.Fragment>
            ))}
            {editing && pattern.state.patterns.length === 0 ? (
                <AddCriterion
                    onAdd={added => setPattern({
                        ...pattern,
                        state: {patterns: [added]},
                    })}>
                    {operatorLabel}
                </AddCriterion>
            ) : null}
        </div>
    );
}

const HasTypeOption: EntityCriterionOption<typeof SearchPatternHasType> = {
    type: SearchPatternHasType,
    label: 'has type',
    createState: () => ({elementType: ''}),
    renderCriterion: props => <HasTypeCriterion {...props} />,
    generatePattern: state => ({
        type: 'hasType',
        elementType: state.elementType,
    }),
};

function HasTypeCriterion(
    props: InstanceCriterionProps<typeof SearchPatternHasType>
) {
    const {pattern, setPattern, editing, controls} = props;
    const t = useTranslation();
    const {model} = useWorkspace();

    let main: React.ReactNode;
    if (!editing) {
        // TODO: subscribe to element type
        const elementTypeInfo = model.getElementType(pattern.state.elementType);
        const elementTypeLabel = t.formatLabel(
            elementTypeInfo?.data?.label,
            pattern.state.elementType,
            model.language
        );
        main = t.template('search_entities.criteria_has_type', {
            entityType: (
                <span className={`${CLASS_NAME}__criterion-class`}
                    title={pattern.state.elementType}>
                    {elementTypeLabel}
                </span>
            )
        });
    } else {
        main = t.template('search_entities.criteria_has_type', {
            entityType: (
                <select>
                    <option>type a</option>
                    <option>type b</option>
                    <option>type c</option>
                </select>
            )
        });
    }

    return (
        <CriterionBlock controls={controls}>
            {main}
        </CriterionBlock>
    );
}

const ConnectedToOption: EntityCriterionOption<typeof SearchPatternConnectedTo> = {
    type: SearchPatternConnectedTo,
    label: 'connected to',
    createState: () => ({}),
    renderCriterion: props => <ConnectedToCriterion {...props} />,
    generatePattern: (state, {generate}) => ({
        type: 'connectedTo',
        linkType: state.linkType,
        linkDirection: state.linkDirection,
        target: state.target ? generate(state.target) : undefined,
    }),
};

function ConnectedToCriterion(
    props: InstanceCriterionProps<typeof SearchPatternConnectedTo>
) {
    const {pattern, setPattern, editing, controls} = props;
    const t = useTranslation();
    const {model} = useWorkspace();

    let inlineEntity = false;
    let main: React.ReactNode;

    if (!editing) {
        const {target, linkType, linkDirection} = pattern.state;

        let entity: React.ReactElement;
        if (!target || SearchPattern.hasType(target, SearchPatternFromValues)) {
            inlineEntity = true;
            entity = <FromValuesList values={target?.state.values ?? []} />;
        } else {
            entity = <span><b>target</b></span>;
        }

        let relationType: React.ReactElement | undefined;
        if (linkType) {
            const linkTypeData = model.getLinkType(linkType);
            const linkTypeLabel = t.formatLabel(
                linkTypeData?.data?.label,
                linkType,
                model.language
            );
            relationType = (
                <span className={`${CLASS_NAME}__criterion-link-type`}
                    title={linkType}>
                    {linkTypeLabel}
                </span>
            );
        }

        const sourceIcon = <span className={`${CLASS_NAME}__link-direction-in`} />;
        const targetIcon = <span className={`${CLASS_NAME}__link-direction-out`} />;

        main = !linkType ? (
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
        );
    } else {
        main = t.template('search_entities.criteria_connected_via', {
            entity: <span><b>target</b></span>,
            relationType: (
                <>
                    <select>
                        <option>relation a</option>
                        <option>relation b</option>
                        <option>relation c</option>
                    </select>
                    <select>
                        <option>in</option>
                        <option>out</option>
                        <option>in or out</option>
                    </select>
                </>
            ),
            sourceIcon: null,
            targetIcon: null,
        });
    }

    return (
        <CriterionBlock controls={controls}
            where={
                inlineEntity ? null : (
                    <WhereCriterions>
                        <WhereCriterion part='target'
                            pattern={pattern.state.target}
                            setPattern={target => setPattern({
                                ...pattern,
                                state: {target},
                            })}
                        />
                    </WhereCriterions>
                )
            }>
            {main}
        </CriterionBlock>
    );
}

const FromValuesOption: EntityCriterionOption<typeof SearchPatternFromValues> = {
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
    props: InstanceCriterionProps<typeof SearchPatternFromValues>
) {
    const {pattern, setPattern, editing, controls} = props;

    let main: React.ReactNode;
    if (!editing) {
        main = <FromValuesList values={pattern.state.values} />;
    } else {
        main = <FromValuesSelector pattern={pattern} setPattern={setPattern} />;
    }

    return (
        <CriterionBlock controls={controls}>
            {main}
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
    } else if (values.length === 1) {
        const refElementId = values[0];
        const refElementData = providedEntities.data.get(refElementId)
            ?? EntityElement.placeholderData(refElementId);
        return <InlineEntity target={refElementData} />;
    } else {
        return <span>one of {values.length} entities</span>;
    }
}

function FromValuesSelector(props: Pick<
    InstanceCriterionProps<typeof SearchPatternFromValues>,
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
            isLoading={providedEntities.status === 'loading'}
            selected={selected}
            setSelected={update => {
                const nextValues = update(selected);
                setPattern({
                    ...pattern,
                    state: {
                        values: nextValues.map(v => v.id),
                    },
                });
            }}
        />
    );
}

const HasPropertyOption: EntityCriterionOption<typeof SearchPatternHasProperty> = {
    type: SearchPatternHasProperty,
    label: 'has property',
    createState: () => ({property: ''}),
    renderCriterion: props => <HasPropertyCriterion {...props} />,
    generatePattern: state => ({
        type: 'hasProperty',
        propertyType: state.property,
        values: state.values,
    }),
};

function HasPropertyCriterion(
    props: InstanceCriterionProps<typeof SearchPatternHasProperty>
) {
    const {pattern, setPattern, editing, controls} = props;
    const t = useTranslation();
    const {model} = useWorkspace();

    let main: React.ReactNode;

    if (!editing) {
        const {property} = pattern.state;

        let propertyTypeLabel: string | undefined;
        if (pattern.state.property) {
            const propertyType = model.getPropertyType(property);
            propertyTypeLabel = t.formatLabel(
                propertyType?.data?.label,
                property,
                model.language
            );
        }

        main = <span>has <b>{propertyTypeLabel}</b> values</span>;
    } else {
        const selector = (
            <select>
                <option>property a</option>
                <option>property b</option>
                <option>property c</option>
            </select>
        );
        main = <span>has {selector} values</span>;
    }

    return (
        <CriterionBlock controls={controls}>
            {main}
        </CriterionBlock>
    );
}

const WithTextOption: EntityCriterionOption<typeof SearchPatternWithText> = {
    type: SearchPatternWithText,
    label: 'with text',
    createState: () => ({text: ''}),
    renderCriterion: props => <WithTextCriterion {...props} />,
    generatePattern: state => ({
        type: 'withText',
        text: state.text,
    }),
};

function WithTextCriterion(
    props: InstanceCriterionProps<typeof SearchPatternWithText>
) {
    const {pattern, setPattern, editing, controls} = props;

    let main: React.ReactNode;

    if (!editing) {
        main = <span>with text <i>&quot;{pattern.state.text}&quot;</i></span>;
    } else {
        const input = (
            <input type='text'
                className='reactodia-form-control'
                value={pattern.state.text}
                onChange={e => {
                    setPattern({
                        ...pattern,
                        state: {
                            text: e.currentTarget.value,
                        },
                    });
                }}
            />
        );
        main = <span>with text {input}</span>;
    }

    return (
        <CriterionBlock controls={controls}>
            {main}
        </CriterionBlock>
    );
}

function findEntityData(graph: DataGraphStructure, iri: ElementIri): ElementModel | undefined {
    for (const element of graph.elements) {
        for (const entity of iterateEntitiesOf(element)) {
            if (entity.id === iri) {
                return entity;
            }
        }
    }
    return undefined;
}

function insertPattern(
    into: LookupPattern,
    combineWith: 'allOf' | 'anyOf',
    pattern: LookupPattern
): LookupPattern {
    if (into.type === combineWith) {
        return {...into, patterns: [...into.patterns, pattern]};
    }
    return {
        type: combineWith,
        patterns: [into, pattern],
    };
}
