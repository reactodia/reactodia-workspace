import cx from 'clsx';
import * as React from 'react';

import { useTranslation } from '../../coreUtils/i18n';
import { LookupPattern } from '../../data/dataProvider';
import { ElementIri } from '../../data/model';
import { EntityElement } from '../../editor/dataElements';
import { useProvidedEntities } from '../../editor/useProvidedEntities';
import { useWorkspace } from '../../workspace/workspaceContext';

import { DropdownMenu, DropdownMenuItem, useDropdownMenu } from '../utility/dropdown';
import { InlineEntity } from '../utility/inlineEntity';

import { ElementTypeSelect } from './elementTypeSelect';
import { EntitySelect } from './entitySelect';
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
        options: SearchCriterionGenerateOptions
    ) => LookupPattern;
}

export interface SearchCriterionProps<in P extends SearchPatternType> {
    pattern: SearchPattern<P>;
    updatePattern: (state: SearchPattern<P> | undefined) => void;
    replacePattern: (state: SearchPattern | undefined) => void;
    editing: boolean;
    parent?: SearchPattern;
    controls?: React.ReactNode;
}

export interface SearchCriterionGenerateOptions {
    readonly generate: (pattern: SearchPattern) => LookupPattern;
}

export interface SearchCriterionContext {
    readonly editing: boolean;
    readonly patternOptions: readonly SearchCriterionOption[];
}
export const SearchCriterionContext = React.createContext<SearchCriterionContext>({
    editing: false,
    patternOptions: [],
});

export function makePatternGenerator(
    patternOptions: readonly SearchCriterionOption[]
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
    controls: React.ReactNode;
    where?: React.ReactNode;
    children: React.ReactNode;
}) {
    const {controls, where, children} = props;
    return (
        <div className={`${CLASS_NAME}__block`}>
            <div className={`${CLASS_NAME}__block-main`}>
                {children}
            </div>
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
    generatePattern: (state, {generate}) => ({
        type: 'allOf',
        patterns: state.patterns.map(generate),
    }),
};

export const SearchCriterionAnyOf: SearchCriterionOption<typeof SearchPatternAnyOf> = {
    type: SearchPatternAnyOf,
    createState: () => ({patterns: []}),
    renderCriterion: props => <AnyAllOfCriterion {...props} />,
    generatePattern: (state, {generate}) => ({
        type: 'anyOf',
        patterns: state.patterns.map(generate),
    }),
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
    generatePattern: state => ({
        type: 'hasType',
        elementType: state.elementType,
    }),
};

function HasTypeCriterion(
    props: SearchCriterionProps<typeof SearchPatternHasType>
) {
    const {pattern, updatePattern, editing, controls} = props;
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
                <span className={`${CLASS_NAME}__element-type`}
                    title={pattern.state.elementType}>
                    {elementTypeLabel}
                </span>
            )
        });
    } else {
        main = t.template('search_entities.criteria_has_type', {
            entityType: (
                <ElementTypeSelect
                    selected={pattern.state.elementType}
                    setSelected={type => updatePattern({
                        ...pattern,
                        state: {...pattern.state, elementType: type.id},
                    })}
                />
            )
        });
    }

    return (
        <CriterionBlock controls={controls}>
            {main}
        </CriterionBlock>
    );
}

export const SearchCriterionConnectedTo: SearchCriterionOption<typeof SearchPatternConnectedTo> = {
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
    props: SearchCriterionProps<typeof SearchPatternConnectedTo>
) {
    const {pattern, updatePattern, editing, controls} = props;
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
                <span className={`${CLASS_NAME}__link-type`}
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
                            setPattern={target => updatePattern({
                                ...pattern,
                                state: {target},
                            })}
                            parent={pattern}
                        />
                    </WhereCriterions>
                )
            }>
            {main}
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

    let main: React.ReactNode;
    if (!editing) {
        main = <FromValuesList values={pattern.state.values} />;
    } else {
        main = <FromValuesSelector pattern={pattern} updatePattern={updatePattern} />;
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
    createState: () => ({property: ''}),
    renderCriterion: props => <HasPropertyCriterion {...props} />,
    generatePattern: state => ({
        type: 'hasProperty',
        propertyType: state.property,
        values: state.values,
    }),
};

function HasPropertyCriterion(
    props: SearchCriterionProps<typeof SearchPatternHasProperty>
) {
    const {pattern, updatePattern, editing, controls} = props;
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

export const DefaultSearchCriterionOptions: readonly SearchCriterionOption[] = [
    SearchCriterionAllOf,
    SearchCriterionAnyOf,
    SearchCriterionHasType,
    SearchCriterionConnectedTo,
    SearchCriterionFromValues,
    SearchCriterionHasProperty,
];
