import cx from 'clsx';
import * as React from 'react';

import { useTranslation } from '../../coreUtils/i18n';
import { LookupPattern, ConnectionLookupPattern, lookupPatternOf } from '../../data/dataProvider';
import { ElementIri, ElementModel } from '../../data/model';
import { DataGraphStructure } from '../../editor/dataDiagramModel';
import { EntityElement, iterateEntitiesOf } from '../../editor/dataElements';
import { useProvidedEntities } from '../../editor/useProvidedEntities';
import { useWorkspace } from '../../workspace/workspaceContext';

import { DropdownMenu, DropdownMenuItem, useDropdownMenu } from '../utility/dropdown';
import { InlineEntity } from '../utility/inlineEntity';
import { SearchInput, SearchInputStore } from '../utility/searchInput';

import { EntitySelect } from './entitySelect';
import type { SearchCriteria } from './instancesSearch';

const CLASS_NAME = 'reactodia-instances-search';

export function InstanceCriteria(props: {
    criteria: SearchCriteria;
    setCriteria: (criteria: SearchCriteria) => void;
    searchStore: SearchInputStore | undefined;
}) {
    const {criteria, setCriteria, searchStore} = props;
    const t = useTranslation();
    const {model} = useWorkspace();

    const renderPattern = (pattern: LookupPattern, topLevel?: boolean) => {
        switch (pattern.type) {
            case 'allOf':
            case 'anyOf': {
                let nested = pattern.patterns;
                if (topLevel) {
                    nested = nested.filter(p => p.type !== 'withText');
                }
                
                if (nested.length === 0) {
                    return null;
                } else if (nested.length === 1) {
                    return renderPattern(nested[0]);
                }

                return (
                    <>
                        {nested.map((p, index) => (
                            <React.Fragment key={index}>
                                {renderPattern(p)}
                                <div>-- {pattern.type} --</div>
                            </React.Fragment>
                        ))}
                    </>
                );
            }
            case 'hasType': {
                // TODO: subscribe to element type
                const elementTypeInfo = model.getElementType(pattern.elementType);
                const elementTypeLabel = t.formatLabel(
                    elementTypeInfo?.data?.label,
                    pattern.elementType,
                    model.language
                );
                return (
                    <div key='hasType' className={`${CLASS_NAME}__criterion`}>
                        <RemoveCriterionButton
                            onClick={() => setCriteria({...criteria, elementType: undefined})}
                        />
                        {t.template('search_entities.criteria_has_type', {
                            entityType: (
                                <span className={`${CLASS_NAME}__criterion-class`}
                                    title={criteria.elementType}>
                                    {elementTypeLabel}
                                </span>
                            )
                        })}
                    </div>
                );
            }
            case 'connectedTo': {
                let entity: React.ReactElement;
                if (!pattern.values || pattern.values.length === 0) {
                    entity = <span>any entity</span>;
                } else if (pattern.values.length === 1) {
                    const refElementId = pattern.values[0];
                    const refElementData = findEntityData(model, refElementId)
                        ?? EntityElement.placeholderData(refElementId);
                    entity = <InlineEntity target={refElementData} />;
                } else {
                    entity = <span>one of {pattern.values.length} entities</span>;
                }

                let relationType: React.ReactElement | undefined;
                if (pattern.linkType) {
                    const linkTypeData = model.getLinkType(pattern.linkType);
                    const linkTypeLabel = t.formatLabel(
                        linkTypeData?.data?.label,
                        pattern.linkType,
                        model.language
                    );
                    relationType = (
                        <span className={`${CLASS_NAME}__criterion-link-type`}
                            title={criteria.refElementLink}>
                            {linkTypeLabel}
                        </span>
                    );
                }

                const sourceIcon = <span className={`${CLASS_NAME}__link-direction-in`} />;
                const targetIcon = <span className={`${CLASS_NAME}__link-direction-out`} />;

                return (
                    <div key='hasLinkedElement' className={`${CLASS_NAME}__criterion`}>
                        <RemoveCriterionButton
                            onClick={() => setCriteria({
                                ...criteria,
                                refElement: undefined,
                                refElementLink: undefined,
                            })}
                        />
                        {!criteria.refElementLink ? (
                            t.template('search_entities.criteria_connected', {
                                entity, relationType, sourceIcon, targetIcon,
                            })
                        ) : criteria.linkDirection === 'in' ? (
                            t.template('search_entities.criteria_connected_to_source', {
                                entity, relationType, sourceIcon, targetIcon,
                            })
                        ) : criteria.linkDirection == 'out' ? (
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
            }
            case 'withText': {
                return (
                    <div key='withText' className={`${CLASS_NAME}__criterion`}>
                        with text &quot;{pattern.text}&quot;
                    </div>
                );
            }
            case 'fromValues': {
                return (
                    <div key='fromValues' className={`${CLASS_NAME}__criterion`}>
                        is one of {pattern.values} values
                    </div>
                );
            }
            case 'hasProperty': {
                let propertyTypeLabel: string | undefined;
                if (criteria.refElementLink) {
                    const linkTypeData = model.getPropertyType(pattern.propertyType);
                    propertyTypeLabel = t.formatLabel(
                        linkTypeData?.data?.label,
                        criteria.refElementLink,
                        model.language
                    );
                }

                return (
                    <div key='fromValues' className={`${CLASS_NAME}__criterion`}>
                        has {propertyTypeLabel} values
                        {pattern.filter ? (
                            <div>where TODO-FILTER</div>
                        ) : null}
                    </div>
                );
            }
        }
    };

    const fullPattern = lookupPatternOf({
        elementTypeId: criteria.elementType,
        refElementId: criteria.refElement,
        refElementLinkId: criteria.refElementLink,
        linkDirection: criteria.linkDirection,
        text: criteria.text,
        pattern: criteria.pattern,
    });
    const fullCriterions = renderPattern(fullPattern, true);

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
            {fullCriterions === null ? (
                <AddCriterion
                    onAdd={pattern => setCriteria({
                        pattern: insertPattern(fullPattern, 'allOf', pattern),
                    })}
                />
            ) : (
                <div className={`${CLASS_NAME}__criterions`}>
                    {fullCriterions}
                </div>
            )}
        </div>
    );
}

function AddCriterion(props: {
    onAdd: (pattern: LookupPattern) => void;
}) {
    const {onAdd} = props;
    const [edited, setEdited] = React.useState<LookupPattern | undefined>(undefined);
    return edited ? (
        <CriterionEditor pattern={edited}
            onApply={onAdd}
            onCancel={() => setEdited(undefined)}
        />
    ) : (
        <DropdownMenu className={`${CLASS_NAME}__criterion-add`}
            toggle={<AddCriterionButton />}>
            <DropdownMenuItem onSelect={() => setEdited({type: 'hasType', elementType: ''})}>
                has type
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEdited({type: 'connectedTo'})}>
                connected to
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEdited({type: 'hasProperty', propertyType: ''})}>
                has property
            </DropdownMenuItem>
        </DropdownMenu>
    );
}

function AddCriterionButton() {
    const {expanded, setExpanded} = useDropdownMenu();
    return (
        <button
            className={cx(
                `${CLASS_NAME}__criterion-add-button`,
                'reactodia-btn reactodia-btn-default',
                expanded ? 'active': undefined
            )}
            onClick={() => setExpanded(previous => !previous)}>
            Add
        </button>
    );
}

function RemoveCriterionButton(props: {
    onClick: () => void;
}) {
    const {onClick} = props;
    const t = useTranslation();
    return (
        <div className={`${CLASS_NAME}__criterion-remove reactodia-btn-group reactodia-btn-group-xs`}>
            <button type='button' title={t.text('search_entities.remove_criteria.title')}
                className={cx(
                    `${CLASS_NAME}__criterion-remove-button`,
                    'reactodia-btn reactodia-btn-default'
                )}
                onClick={onClick}>
            </button>
        </div>
    );
}

function CriterionEditor(props: {
    pattern: LookupPattern;
    onApply: (pattern: LookupPattern) => void;
    onCancel: () => void;
}) {
    const {pattern, onApply, onCancel} = props;
    const t = useTranslation();
    const [draft, setDraft] = React.useState(pattern);

    let content: React.ReactNode = null;
    switch (draft.type) {
        case 'hasType': {
            content = t.template('search_entities.criteria_has_type', {
                entityType: (
                    <select>
                        <option>type a</option>
                        <option>type b</option>
                        <option>type c</option>
                    </select>
                )
            });
            break;
        }
        case 'connectedTo': {
            content = (
                <ConnectedToCriterion pattern={draft}
                    onChange={setDraft}
                />
            );
            break;
        }
        case 'hasProperty': {
            const selector = (
                <select>
                    <option>property a</option>
                    <option>property b</option>
                    <option>property c</option>
                </select>
            );
            content = (
                <div>
                    has {selector} values
                    {draft.filter ? (
                        <div>where TODO-FILTER</div>
                    ) : null}
                </div>
            );
            break;
        }
    }

    return (
        <div>
            {content}
            <button className={`${CLASS_NAME}__criterion-apply`}
                onClick={() => onApply(draft)}
            />
            <button className={`${CLASS_NAME}__criterion-cancel`}
                onClick={onCancel}
            />
        </div>
    );
}

function ConnectedToCriterion(props: {
    pattern: ConnectionLookupPattern;
    onChange: (pattern: ConnectionLookupPattern) => void;
}) {
    const {pattern, onChange} = props;
    const t = useTranslation();
    const {model} = useWorkspace();
    const providedEntities = useProvidedEntities(model.dataProvider, pattern.values ?? []);
    const selected = Array.from(providedEntities.data.values());
    return t.template('search_entities.criteria_connected_via', {
        entity: (
            <EntitySelect
                dataProvider={model.dataProvider}
                isLoading={providedEntities.status === 'loading'}
                selected={selected}
                setSelected={update => {
                    const nextValues = update(selected);
                    onChange({
                        ...pattern,
                        values: nextValues.map(v => v.id),
                    });
                }}
            />
        ),
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
