import cx from 'clsx';
import * as React from 'react';

import { useKeyedSyncStore } from '../coreUtils/keyedObserver';
import type { Translation } from '../coreUtils/i18n';

import { ElementModel, PropertyTypeIri, isEncodedBlank } from '../data/model';
import { PinnedProperties, TemplateProperties } from '../data/schema';

import { CanvasApi, useCanvas } from '../diagram/canvasApi';
import { setElementExpanded } from '../diagram/commands';
import { ElementTemplate, TemplateProps } from '../diagram/customization';
import { Element } from '../diagram/elements';
import { HtmlSpinner } from '../diagram/spinner';

import { AuthoringState } from '../editor/authoringState';
import { EntityElement, EntityGroup } from '../editor/dataElements';
import { ungroupSomeEntities } from '../editor/elementGrouping';
import { subscribeElementTypes, subscribePropertyTypes } from '../editor/observedElement';
import { WithFetchStatus } from '../editor/withFetchStatus';

import { AuthoredEntityContext, useAuthoredEntity } from '../widgets/visualAuthoring/authoredEntity';
import { type WorkspaceContext, useWorkspace } from '../workspace/workspaceContext';

import { GroupPaginator } from './groupPaginator';

/**
 * Default element template to display an {@link EntityElement} or
 * {@link EntityGroup} on a canvas.
 *
 * Uses {@link StandardEntity} component to render a single entity and
 * {@link StandardEntityGroup} component to render an entity group.
 *
 * @category Constants
 */
export const StandardTemplate: ElementTemplate = {
    renderElement: props => {
        const {element} = props;
        if (element instanceof EntityElement) {
            return <StandardEntity {...props} />;
        } else if (element instanceof EntityGroup) {
            return <StandardEntityGroup {...props} />;
        } else {
            return null;
        }
    },
    supports: {
        [TemplateProperties.Expanded]: true,
    },
};

/**
 * Props for {@link StandardEntity} component.
 *
 * @see {@link StandardEntity}
 */
export interface StandardEntityProps extends TemplateProps {
    /**
     * When set to `true`, allows to edit or delete the entity
     * using corresponding buttons in the expanded state.
     *
     * @default false
     * @deprecated Entities can be edited or deleted via inline action decorators
     * when {@link VisualAuthoringProps.inlineEntityActions} is enabled.
     */
    showActions?: boolean;
}

const CLASS_NAME = 'reactodia-standard-element';

/**
 * Default single entity template component.
 *
 * The template supports displaying only {@link EntityElement},
 * otherwise nothing will be rendered.
 *
 * The template supports the following template state:
 *   - {@link TemplateProperties.Expanded}
 *   - {@link TemplateProperties.PinnedProperties}
 *
 * @category Components
 * @see {@link StandardTemplate}
 */
export function StandardEntity(props: StandardEntityProps) {
    const {showActions, element, isExpanded, elementState} = props;
    const workspace = useWorkspace();
    const {model, editor, translation: t, getElementTypeStyle} = workspace;

    const data = element instanceof EntityElement ? element.data : undefined;
    useKeyedSyncStore(subscribeElementTypes, data ? data.types : [], model);
    const entityContext = useAuthoredEntity(data, isExpanded);

    if (!data) {
        return null;
    }

    const label = model.locale.formatEntityLabel(data, model.language);
    const imageUrl = model.locale.selectEntityImageUrl(data);
    const typesLabel = formatEntityTypes(data, workspace);
    const typeStyle = getElementTypeStyle(data.types);
    const rootStyle = {
        '--reactodia-element-style-color': typeStyle.color,
    } as React.CSSProperties;

    const pinnedProperties = findPinnedProperties() ?? {};

    function renderTypes(data: ElementModel) {
        if (data.types.length === 0) {
            return t.text('standard_element.default_type');
        }
        return data.types.map((typeIri, index) => {
            const type = model.getElementType(typeIri);
            const label = t.formatLabel(type?.data?.label, typeIri, model.language);
            return (
                <React.Fragment key={typeIri}>
                    {index === 0 ? null : ', '}
                    <WithFetchStatus type='elementType' target={typeIri}>
                        <span>{label}</span>
                    </WithFetchStatus>
                </React.Fragment>
            );
        });
    }

    function findPinnedProperties(): PinnedProperties | undefined {
        return isExpanded ? undefined : elementState.get(TemplateProperties.PinnedProperties);
    }

    function renderIri(data: ElementModel) {
        const finalIri = entityContext.editedIri === undefined ? data.id : entityContext.editedIri;
        return (
            <div>
                <div className={`${CLASS_NAME}__iri`}>
                    <div className={`${CLASS_NAME}__iri-key`}>
                        {entityContext.editedIri
                            ? t.text('standard_element.iri.label_modified')
                            : t.text('standard_element.iri.label')}
                    </div>
                    <div className={`${CLASS_NAME}__iri-value`}>
                        {isEncodedBlank(finalIri)
                            ? <span>{t.text('standard_element.blank_node')}</span>
                            : <a href={finalIri}
                                target='_blank'
                                rel='noreferrer'
                                title={finalIri}>
                                {finalIri}
                            </a>}
                    </div>
                </div>
                <hr className={`${CLASS_NAME}__hr`} />
            </div>
        );
    }

    function renderThumbnail() {
        if (imageUrl !== undefined) {
            return (
                <div className={`${CLASS_NAME}__thumbnail`} aria-hidden='true'>
                    <img src={imageUrl} className={`${CLASS_NAME}__thumbnail-image`} />
                </div>
            );
        } else if (typeStyle.icon) {
            return (
                <div className={`${CLASS_NAME}__thumbnail`}
                    aria-hidden='true'>
                    <img src={typeStyle.icon}
                        className={cx(
                            `${CLASS_NAME}__thumbnail-icon`,
                            typeStyle.iconMonochrome ? `${CLASS_NAME}__thumbnail-icon--monochrome` : undefined
                        )}
                    />
                </div>
            );
        }

        return (
            <div className={`${CLASS_NAME}__thumbnail`} aria-hidden='true'>
                {typesLabel.length > 0 ? typesLabel.charAt(0).toUpperCase() : '✳'}
            </div>
        );
    }

    const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        model.history.execute(
            setElementExpanded(element, !element.isExpanded)
        );
    };

    return (
        <div style={rootStyle}
            className={cx(
                CLASS_NAME,
                `${CLASS_NAME}--standalone`,
                getEntityAuthoredStatusClass(data, editor.authoringState)
            )}
            onDoubleClick={onDoubleClick}>
            <div className={`${CLASS_NAME}__main`}>
                <div className={`${CLASS_NAME}__body`}>
                    <div className={`${CLASS_NAME}__body-horizontal`}>
                        {renderThumbnail()}
                        <div className={`${CLASS_NAME}__body-content`}>
                            <div title={typesLabel} className={`${CLASS_NAME}__type`}>
                                <div className={`${CLASS_NAME}__type-value`}>
                                    {renderTypes(data)}
                                </div>
                            </div>
                            <WithFetchStatus type='element' target={data.id}>
                                <div className={`${CLASS_NAME}__label`} title={label}>{label}</div>
                            </WithFetchStatus>
                        </div>
                    </div>
                    {hasPinnedProperties(data, pinnedProperties) ? (
                        <div className={`${CLASS_NAME}__pinned-props`}>
                            <PropertyList data={data}
                                shouldInclude={iri => isPinnedProperty(iri, pinnedProperties)}
                            />
                        </div>
                    ) : null}
                </div>
            </div>
            {isExpanded ? (
                <div className={`${CLASS_NAME}__dropdown`}>
                    {imageUrl === undefined ? null : (
                        <div className={`${CLASS_NAME}__photo`}>
                            <img src={imageUrl} className={`${CLASS_NAME}__photo-image`} />
                        </div>
                    )}
                    <div className={`${CLASS_NAME}__dropdown-content`}>
                        {renderIri(data)}
                        <PropertyList data={data} />
                        {showActions && editor.inAuthoringMode ? <>
                            <hr className={`${CLASS_NAME}__hr`}
                                data-reactodia-no-export='true'
                            />
                            <Actions target={element}
                                entityContext={entityContext}
                                translation={t}
                            />
                        </> : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

/**
 * Props for {@link StandardEntityGroup} component.
 *
 * @see {@link StandardEntityGroup}
 */
export interface StandardEntityGroupProps extends TemplateProps {
    /**
     * Default number items to show per page in element group.
     *
     * @default 6
     */
    groupPageSize?: number;
    /**
     * Available group page sizes to select from.
     *
     * @default [5, 10, 15, 20, 30]
     */
    groupPageSizes?: ReadonlyArray<number>;
}

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZES: ReadonlyArray<number> = [5, 10, 15, 20, 30];

/**
 * Default entity group template component.
 *
 * The template supports displaying only {@link EntityGroup},
 * otherwise nothing will be rendered.
 *
 * The template supports the following template state:
 *   - {@link TemplateProperties.GroupPageIndex}
 *   - {@link TemplateProperties.GroupPageSize}
 *
 * Entities can be ungroup from the element with a corresponding button.
 *
 * @category Components
 * @see {@link StandardTemplate}
 */
export function StandardEntityGroup(props: StandardEntityGroupProps) {
    const {
        element, elementState,
        groupPageSize = DEFAULT_PAGE_SIZE,
        groupPageSizes = DEFAULT_PAGE_SIZES,
    } = props;
    const {canvas} = useCanvas();
    const workspace = useWorkspace();
    const {getElementStyle} = workspace;

    if (!(element instanceof EntityGroup)) {
        return null;
    }
    const items = element.items;

    const {color: groupColor} = getElementStyle(element);
    const groupStyle = {
        '--reactodia-standard-group-color': groupColor,
    } as React.CSSProperties;

    let pageSize = elementState.get(TemplateProperties.GroupPageSize) ?? groupPageSize;
    pageSize = Number.isFinite(pageSize) ? pageSize : groupPageSize;

    const pageCount = Math.max(Math.ceil(items.length / pageSize), 1);
    let pageIndex = elementState.get(TemplateProperties.GroupPageIndex) ?? 0;
    pageIndex = Number.isFinite(pageIndex) ? pageIndex : 0;
    pageIndex = Math.min(Math.max(pageIndex, 0), pageCount - 1);

    const pageOffset = pageIndex * pageSize;
    const pageItems = items.slice(
        pageOffset,
        Math.min(pageOffset + pageSize, items.length)
    );
    const fillerCount = pageCount === 1 ? 0 : pageOffset + pageSize - items.length;

    return (
        <div className={cx(CLASS_NAME, `${CLASS_NAME}--group`)}
            style={groupStyle}
            role='list'>
            {pageItems.map(item => (
                <StandardEntityGroupItem {...props}
                    key={item.data.id}
                    data={item.data}
                    isExpanded={false}
                    target={element}
                    canvas={canvas}
                    workspace={workspace}
                />
            ))}
            {Array.from({length: fillerCount}, (_, index) => (
                <div key={index}
                    className={`${CLASS_NAME}__item-filler`}
                    aria-hidden={true}>
                    &nbsp;
                </div>
            ))}
            <GroupPaginator pageIndex={pageIndex}
                pageCount={pageCount}
                onChangePage={page => element.setElementState(
                    element.elementState.set(TemplateProperties.GroupPageIndex,page)
                )}
                pageSize={pageSize}
                pageSizes={groupPageSizes}
                onChangePageSize={size => element.setElementState(
                    element.elementState.set(TemplateProperties.GroupPageSize, size)
                )}
            />
        </div>
    );
}

interface StandardEntityGroupItemProps extends TemplateProps {
    data: ElementModel;
    target: EntityGroup;
    canvas: CanvasApi;
    workspace: WorkspaceContext;
}

function StandardEntityGroupItem(props: StandardEntityGroupItemProps) {
    const {data, target, canvas, workspace} = props;
    const {model, editor, translation: t, getElementTypeStyle} = workspace;

    useKeyedSyncStore(subscribeElementTypes, data ? data.types : [], model);

    const label = model.locale.formatEntityLabel(data, model.language);
    const iri = model.locale.formatIri(data.id);
    const typesLabel = formatEntityTypes(data, workspace);
    const title = t.text('standard_element.group_item.title', {
        entity: label,
        entityIri: iri,
        entityTypes: typesLabel,
    });

    const authoringStatusClass = getEntityAuthoredStatusClass(data, editor.authoringState);
    const {color: baseColor} = getElementTypeStyle(data.types);
    const itemStyle = {
        '--reactodia-element-style-color': baseColor,
    } as React.CSSProperties;

    return (
        <div className={cx(`${CLASS_NAME}__item`, authoringStatusClass)}
            style={itemStyle}
            role='listitem'>
            <div className={`${CLASS_NAME}__item-stripe`} aria-hidden='true' />
            <div className={`${CLASS_NAME}__item-body`}>
                <WithFetchStatus type='element' target={data.id}>
                    <div className={`${CLASS_NAME}__label`} title={title}>{label}</div>
                </WithFetchStatus>
                <button type='button'
                    className={cx(
                        `${CLASS_NAME}__ungroup-one-button`,
                        'reactodia-btn reactodia-btn-default'
                    )}
                    data-reactodia-no-export='true'
                    title={t.text('standard_element.ungroup.title')}
                    onClick={() => void ungroupSomeEntities(workspace, {
                        group: target,
                        entities: new Set([data.id]),
                        canvas,
                    })}
                />
            </div>
        </div>
    );
}

function isPinnedProperty(iri: PropertyTypeIri, pinned: PinnedProperties): boolean {
    return Boolean(
        Object.prototype.hasOwnProperty.call(pinned, iri) &&
        pinned[iri]
    );
}

function hasPinnedProperties(data: ElementModel, pinned: PinnedProperties): boolean {
    for (const iri in data.properties) {
        if (Object.prototype.hasOwnProperty.call(data.properties, iri)) {
            if (isPinnedProperty(iri, pinned)) {
                return true;
            }
        }
    }
    return false;
}

function formatEntityTypes(
    data: ElementModel,
    workspace: WorkspaceContext
): string {
    const {model, translation: t} = workspace;
    return data.types.length === 0
        ? t.text('standard_element.default_type')
        : model.locale.formatEntityTypeList(data, model.language);
}

function getEntityAuthoredStatusClass(data: ElementModel, state: AuthoringState): string | undefined {
    const event = state.elements.get(data.id);
    if (!event) {
        return undefined;
    }
    switch (event.type) {
        case 'entityAdd':
            return `${CLASS_NAME}--new`;
        case 'entityChange':
            return `${CLASS_NAME}--changed`;
        case 'entityDelete':
            return `${CLASS_NAME}--deleted`;
        default:
            return undefined;
    }
}

function PropertyList(props: {
    data: ElementModel;
    shouldInclude?: (iri: PropertyTypeIri) => boolean;
}) {
    const {data, shouldInclude} = props;
    const {model, translation: t} = useWorkspace();

    const propertyIris: PropertyTypeIri[] = [];
    for (const iri in data.properties) {
        if (
            Object.prototype.hasOwnProperty.call(data.properties, iri) &&
            data.properties[iri].length > 0 &&
            (!shouldInclude || shouldInclude(iri))
        ) {
            propertyIris.push(iri);
        }
    }

    useKeyedSyncStore(subscribePropertyTypes, propertyIris, model);

    if (propertyIris.length === 0) {
        return <div>{t.text('standard_element.no_properties')}</div>;
    }

    const properties = propertyIris.map(iri => {
        const property = model.getPropertyType(iri);
        const selectedValues = t.selectValues(data.properties[iri], model.language);
        return {
            iri,
            label: t.formatLabel(property?.data?.label, iri, model.language),
            values: selectedValues.length === 0 ? data.properties[iri] : selectedValues,
        };
    });
    properties.sort((a, b) => a.label.localeCompare(b.label));

    return (
        <div role='list'
            className={`${CLASS_NAME}__properties`}>
            {properties.map(({iri, label, values}) => {
                return (
                    <div key={iri}
                        role='listitem'
                        className={`${CLASS_NAME}__properties-row`}>
                        <WithFetchStatus type='propertyType' target={iri}>
                            <div className={`${CLASS_NAME}__properties-key`}
                                title={t.text('standard_element.property.title', {
                                    property: label,
                                    propertyIri: model.locale.formatIri(iri),
                                })}>
                                {label}
                            </div>
                        </WithFetchStatus>
                        <div className={`${CLASS_NAME}__properties-values`}>
                            {values.map((term, index) => (
                                <div key={index}
                                    className={`${CLASS_NAME}__properties-value`}
                                    title={term.value}
                                    lang={
                                        term.termType === 'Literal' && term.language
                                            ? term.language : undefined
                                    }>
                                    {term.value}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * @deprecated
 */
function Actions(props: {
    target: Element;
    entityContext: AuthoredEntityContext;
    translation: Translation;
}) {
    const {
        target,
        entityContext: {canEdit, canDelete, onEdit, onDelete},
        translation: t,
    } = props;
    const SPINNER_WIDTH = 15;
    const SPINNER_HEIGHT = 12;
    return (
        <div className={`${CLASS_NAME}__actions`}
            data-reactodia-no-export='true'>
            <button type='button'
                className={cx(
                    `${CLASS_NAME}__delete-button`,
                    'reactodia-btn reactodia-btn-default'
                )}
                title={canDelete
                    ? t.text('standard_element.delete.title')
                    : t.text('standard_element.delete.title_disabled')}
                disabled={!canDelete}
                onClick={onDelete}>
                {canDelete === undefined
                    ? <HtmlSpinner width={SPINNER_WIDTH} height={SPINNER_HEIGHT} />
                    : t.text('standard_element.delete.label')}
            </button>
            <button type='button'
                className={cx(
                    `${CLASS_NAME}__edit-button`,
                    'reactodia-btn reactodia-btn-default'
                )}
                title={canEdit
                    ? t.text('standard_element.edit.title')
                    : t.text('standard_element.edit.title_disabled')}
                disabled={!canEdit}
                onClick={() => onEdit(target)}>
                {canEdit === undefined
                    ? <HtmlSpinner width={SPINNER_WIDTH} height={SPINNER_HEIGHT} />
                    : t.text('standard_element.edit.label')}
            </button>
        </div>
    );
}
