import * as React from 'react';
import classnames from 'classnames';

import { useKeyedSyncStore } from '../coreUtils/keyedObserver';
import type { Translation } from '../coreUtils/i18n';

import type * as Rdf from '../data/rdf/rdfModel';
import { ElementModel, PropertyTypeIri, isEncodedBlank } from '../data/model';
import { PinnedProperties, TemplateProperties } from '../data/schema';

import { CanvasApi, useCanvas } from '../diagram/canvasApi';
import { TemplateProps } from '../diagram/customization';
import { Element } from '../diagram/elements';
import { HtmlSpinner } from '../diagram/spinner';

import { AuthoringState } from '../editor/authoringState';
import { DataDiagramModel } from '../editor/dataDiagramModel';
import { EntityElement, EntityGroup, EntityGroupItem } from '../editor/dataElements';
import { subscribeElementTypes, subscribePropertyTypes } from '../editor/observedElement';
import { WithFetchStatus } from '../editor/withFetchStatus';

import { formatEntityTypeList } from '../widgets/utility/listElementView';
import { AuthoredEntityContext, useAuthoredEntity } from '../widgets/visualAuthoring/authoredEntity';
import { type WorkspaceContext, useWorkspace } from '../workspace/workspaceContext';

import { GroupPaginator } from './groupPaginator';

/**
 * Props for {@link StandardTemplate} component.
 *
 * @see {@link StandardTemplate}
 */
export interface StandardTemplateProps extends TemplateProps {
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

/**
 * Default element template component.
 *
 * The template supports displaying entity elements, including entity groups.
 *
 * The template supports the following template state:
 *   - pinned properties;
 *   - group page index and size.
 *
 * Entities can be edited or deleted using corresponding buttons
 * from the expanded state.
 *
 * @category Components
 */
export function StandardTemplate(props: TemplateProps) {
    const {element} = props;
    if (element instanceof EntityElement) {
        return (
            <StandardTemplateStandalone {...props}
                data={element.data}
                target={element}
            />
        );
    } else if (element instanceof EntityGroup) {
        return (
            <StandardTemplateGroup {...props}
                items={element.items}
                target={element}
            />
        );
    } else {
        return null;
    }
}

interface StandardTemplateBodyProps extends TemplateProps {
    data: ElementModel;
    target: Element;
}

const CLASS_NAME = 'reactodia-standard-template';
const FOAF_NAME: PropertyTypeIri = 'http://xmlns.com/foaf/0.1/name';
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZES: ReadonlyArray<number> = [5, 10, 15, 20, 30];

function StandardTemplateStandalone(props: StandardTemplateBodyProps) {
    const {data, isExpanded, elementState, target} = props;
    const workspace = useWorkspace();
    const {model, editor, translation: t, getElementTypeStyle} = workspace;

    useKeyedSyncStore(subscribeElementTypes, data ? data.types : [], model);
    const entityContext = useAuthoredEntity(data, isExpanded);

    const label = formatEntityLabel(data, model, t);
    const typesLabel = formatEntityTypes(data, workspace);
    const {color: baseColor, icon: iconUrl} = getElementTypeStyle(data.types);
    const rootStyle = {
        '--reactodia-element-style-color': baseColor,
    } as React.CSSProperties;

    const pinnedProperties = findPinnedProperties() ?? {};

    function renderTypes() {
        if (data.types.length === 0) {
            return t.text('standard_template.default_type');
        }
        return data.types.map((typeIri, index) => {
            const type = model.getElementType(typeIri);
            const label = t.formatLabel(type?.data?.label, typeIri, model.language);
            return (
                <React.Fragment key={typeIri}>
                    {index === 0 ? null : ', '}
                    <WithFetchStatus type='elementType' target={typeIri}>
                        <span title={typeIri}>{label}</span>
                    </WithFetchStatus>
                </React.Fragment>
            );
        });
    }

    function findPinnedProperties(): PinnedProperties | undefined {
        if (isExpanded || !elementState) {
            return undefined;
        }
        const pinned = elementState[TemplateProperties.PinnedProperties] as PinnedProperties;
        return pinned;
    }

    function renderIri() {
        const finalIri = entityContext.editedIri === undefined ? data.id : entityContext.editedIri;
        return (
            <div>
                <div className={`${CLASS_NAME}__iri`}>
                    <div className={`${CLASS_NAME}__iri-key`}>
                        {entityContext.editedIri
                            ? t.text('standard_template.iri.label_modified')
                            : t.text('standard_template.iri.label')}
                    </div>
                    <div className={`${CLASS_NAME}__iri-value`}>
                        {isEncodedBlank(finalIri)
                            ? <span>{t.text('standard_template.blank_node')}</span>
                            : <a href={finalIri}
                                title={finalIri}
                                data-iri-click-intent='openEntityIri'>
                                {finalIri}
                            </a>}
                    </div>
                </div>
                <hr className={`${CLASS_NAME}__hr`} />
            </div>
        );
    }

    function renderThumbnail() {
        if (data.image) {
            return (
                <div className={`${CLASS_NAME}__thumbnail`} aria-hidden='true'>
                    <img src={data.image} className={`${CLASS_NAME}__thumbnail-image`} />
                </div>
            );
        } else if (iconUrl) {
            return (
                <div className={`${CLASS_NAME}__thumbnail`} aria-hidden='true'>
                    <img src={iconUrl} className={`${CLASS_NAME}__thumbnail-icon`} />
                </div>
            );
        }

        return (
            <div className={`${CLASS_NAME}__thumbnail`} aria-hidden='true'>
                {typesLabel.length > 0 ? typesLabel.charAt(0).toUpperCase() : '✳'}
            </div>
        );
    }

    return (
        <div style={rootStyle}
            className={classnames(
                CLASS_NAME,
                `${CLASS_NAME}--standalone`,
                getEntityAuthoredStatusClass(data, editor.authoringState)
            )}>
            <div className={`${CLASS_NAME}__main`}>
                <div className={`${CLASS_NAME}__body`}>
                    <div className={`${CLASS_NAME}__body-horizontal`}>
                        {renderThumbnail()}
                        <div className={`${CLASS_NAME}__body-content`}>
                            <div title={typesLabel} className={`${CLASS_NAME}__type`}>
                                <div className={`${CLASS_NAME}__type-value`}>
                                    {renderTypes()}
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
                    {data.image ? (
                        <div className={`${CLASS_NAME}__photo`}>
                            <img src={data.image} className={`${CLASS_NAME}__photo-image`} />
                        </div>
                    ) : null}
                    <div className={`${CLASS_NAME}__dropdown-content`}>
                        {renderIri()}
                        <PropertyList data={data} />
                        {editor.inAuthoringMode ? <>
                            <hr className={`${CLASS_NAME}__hr`}
                                data-reactodia-no-export='true'
                            />
                            <Actions target={target}
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

interface StandardTemplateGroupProps extends StandardTemplateProps {
    items: ReadonlyArray<EntityGroupItem>;
    target: EntityGroup;
}

function StandardTemplateGroup(props: StandardTemplateGroupProps) {
    const {
        items, target, elementState,
        groupPageSize = DEFAULT_PAGE_SIZE,
        groupPageSizes = DEFAULT_PAGE_SIZES,
    } = props;
    const {canvas} = useCanvas();
    const workspace = useWorkspace();
    const {getElementStyle} = workspace;

    const {color: groupColor} = getElementStyle(target);
    const groupStyle = {
        '--reactodia-standard-group-color': groupColor,
    } as React.CSSProperties;

    const pageSizeFromState = elementState?.[TemplateProperties.GroupPageSize];
    let pageSize = typeof pageSizeFromState === 'number' ? pageSizeFromState : groupPageSize;
    pageSize = Number.isFinite(pageSize) ? pageSize : groupPageSize;

    const pageCount = Math.max(Math.ceil(items.length / pageSize), 1);
    const groupPageFromState = elementState?.[TemplateProperties.GroupPageIndex];
    let pageIndex = typeof groupPageFromState === 'number' ? groupPageFromState : 0;
    pageIndex = Number.isFinite(pageIndex) ? pageIndex : 0;
    pageIndex = Math.min(Math.max(pageIndex, 0), pageCount - 1);

    const pageOffset = pageIndex * pageSize;
    const pageItems = items.slice(
        pageOffset,
        Math.min(pageOffset + pageSize, items.length)
    );
    const fillerCount = pageCount === 1 ? 0 : pageOffset + pageSize - items.length;

    return (
        <div className={classnames(CLASS_NAME, `${CLASS_NAME}--group`)}
            style={groupStyle}
            role='list'>
            {pageItems.map(item => (
                <StandardTemplateGroupItem {...props}
                    key={item.data.id}
                    data={item.data}
                    isExpanded={false}
                    target={target}
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
                onChangePage={page => target.setElementState({
                    ...target.elementState,
                    [TemplateProperties.GroupPageIndex]: page,
                })}
                pageSize={pageSize}
                pageSizes={groupPageSizes}
                onChangePageSize={size => target.setElementState({
                    ...target.elementState,
                    [TemplateProperties.GroupPageSize]: size,
                })}
            />
        </div>
    );
}

interface StandardTemplateGroupItemProps extends TemplateProps {
    data: ElementModel;
    target: EntityGroup;
    canvas: CanvasApi;
    workspace: WorkspaceContext;
}

function StandardTemplateGroupItem(props: StandardTemplateGroupItemProps) {
    const {data, target, canvas, workspace} = props;
    const {model, editor, translation: t, ungroupSome, getElementTypeStyle} = workspace;

    useKeyedSyncStore(subscribeElementTypes, data ? data.types : [], model);

    const label = formatEntityLabel(data, model, t);
    const iri = t.formatIri(data.id);
    const typesLabel = formatEntityTypes(data, workspace);
    const title = t.text('standard_template.group_item.title', {
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
        <div className={classnames(`${CLASS_NAME}__item`, authoringStatusClass)}
            style={itemStyle}
            role='listitem'>
            <div className={`${CLASS_NAME}__item-stripe`} aria-hidden='true' />
            <div className={`${CLASS_NAME}__item-body`}>
                <WithFetchStatus type='element' target={data.id}>
                    <div className={`${CLASS_NAME}__label`} title={title}>{label}</div>
                </WithFetchStatus>
                <button type='button'
                    className={classnames(
                        `${CLASS_NAME}__ungroup-one-button`,
                        'reactodia-btn reactodia-btn-default'
                    )}
                    data-reactodia-no-export='true'
                    title={t.text('standard_template.ungroup.title')}
                    onClick={() => ungroupSome({
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

function formatEntityLabel(data: ElementModel, model: DataDiagramModel, t: Translation): string {
    const foafName = Object.prototype.hasOwnProperty.call(data.properties, FOAF_NAME)
        ? data.properties[FOAF_NAME] : undefined;
    if (foafName) {
        const literals = foafName.filter((v): v is Rdf.Literal => v.termType === 'Literal');
        if (literals.length > 0) {
            return t.formatLabel(literals, data.id, model.language);
        }
    }
    return t.formatLabel(data.label, data.id, model.language);
}

function formatEntityTypes(
    data: ElementModel,
    workspace: WorkspaceContext
): string {
    const {translation: t} = workspace;
    if (data.types.length === 0) {
        return t.text('standard_template.default_type');
    }
    return formatEntityTypeList(data, workspace);
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

    let propertyIris: PropertyTypeIri[] = Object.keys(data.properties);
    if (shouldInclude) {
        propertyIris = propertyIris.filter(shouldInclude);
    }

    useKeyedSyncStore(subscribePropertyTypes, propertyIris, model);

    if (propertyIris.length === 0) {
        return <div>{t.text('standard_template.no_properties')}</div>;
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
                                title={t.text('standard_template.property.title', {
                                    property: label,
                                    propertyIri: t.formatIri(iri),
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
                className={classnames(
                    `${CLASS_NAME}__delete-button`,
                    'reactodia-btn reactodia-btn-default'
                )}
                title={canDelete
                    ? t.text('standard_template.delete.title')
                    : t.text('standard_template.delete.title_disabled')}
                disabled={!canDelete}
                onClick={onDelete}>
                {canDelete === undefined
                    ? <HtmlSpinner width={SPINNER_WIDTH} height={SPINNER_HEIGHT} />
                    : t.text('standard_template.delete.label')}
            </button>
            <button type='button'
                className={classnames(
                    `${CLASS_NAME}__edit-button`,
                    'reactodia-btn reactodia-btn-default'
                )}
                title={canEdit
                    ? t.text('standard_template.edit.title')
                    : t.text('standard_template.edit.title_disabled')}
                disabled={!canEdit}
                onClick={() => onEdit(target)}>
                {canEdit === undefined
                    ? <HtmlSpinner width={SPINNER_WIDTH} height={SPINNER_HEIGHT} />
                    : t.text('standard_template.edit.label')}
            </button>
        </div>
    );
}
