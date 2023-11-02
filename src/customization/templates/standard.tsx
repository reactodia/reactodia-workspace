import * as React from 'react';
import { Component } from 'react';

import type * as Rdf from '../../data/rdf/rdfModel';
import { TemplateProperties } from '../../data/schema';
import { isEncodedBlank } from '../../data/sparql/blankNodes';

import { TemplateProps, FormattedProperty } from '../props';

import { AuthoredEntity, AuthoredEntityContext } from '../../editor/authoredEntity';
import { AuthoringState } from '../../editor/authoringState';

import { HtmlSpinner } from '../../viewUtils/spinner';

const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name';

const CLASS_NAME = 'ontodia-standard-template';

export class StandardTemplate extends Component<TemplateProps, {}> {
    render() {
        return (
            <AuthoredEntity templateProps={this.props}>
                {context => this.renderTemplate(context)}
            </AuthoredEntity>
        );
    }

    private renderTemplate(context: AuthoredEntityContext) {
        const {data, color, isExpanded} = this.props;
        const {editor, view} = context;

        const isNewElement = AuthoringState.isNewElement(editor.authoringState, data.id);
        const leftStripeColor = isNewElement ? 'white' : color;
        const pinnedPropertyKeys = this.findPinnedProperties(context) ?? {};

        const typesLabel = data.types.length > 0 ? view.getElementTypeString(data) : 'Thing';
        const label = this.formatLabel(context);
        const propertyList = view.formatPropertyList(data.properties);
        const pinnedProperties = propertyList.filter(p => Boolean(
            Object.prototype.hasOwnProperty.call(pinnedPropertyKeys, p.propertyId) &&
            pinnedPropertyKeys[p.propertyId]
        ));

        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__main`} style={{backgroundColor: leftStripeColor, borderColor: color}}>
                    <div className={`${CLASS_NAME}__body`} style={{borderLeftColor: color}}>
                        <div className={`${CLASS_NAME}__body-horizontal`}>
                            {this.renderThumbnail(typesLabel)}
                            <div className={`${CLASS_NAME}__body-content`}>
                                <div title={typesLabel} className={`${CLASS_NAME}__type`}>
                                    <div className={`${CLASS_NAME}__type-value`}>{typesLabel}</div>
                                </div>
                                <div className={`${CLASS_NAME}__label`} title={label}>{label}</div>
                            </div>
                        </div>
                        {pinnedProperties.length > 0 ? (
                            <div className={`${CLASS_NAME}__pinned-props`} style={{borderColor: color}}>
                                {this.renderProperties(pinnedProperties)}
                            </div>
                        ) : null}
                    </div>
                </div>
                {isExpanded ? (
                    <div className={`${CLASS_NAME}__dropdown`} style={{borderColor: color}}>
                        {this.renderPhoto()}
                        <div className={`${CLASS_NAME}__dropdown-content`}>
                            {this.renderIri(context)}
                            {this.renderProperties(propertyList)}
                            {editor.inAuthoringMode ? <hr className={`${CLASS_NAME}__hr`} /> : null}
                            {editor.inAuthoringMode ? this.renderActions(context) : null}
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    private formatLabel(context: AuthoredEntityContext): string {
        const {data} = this.props;
        const {view} = context;
        const foafName = Object.prototype.hasOwnProperty.call(data.properties, FOAF_NAME)
            ? data.properties[FOAF_NAME] : undefined;
        if (foafName) {
            const literals = foafName.filter((v): v is Rdf.Literal => v.termType === 'Literal');
            if (literals.length > 0) {
                return view.formatLabel(literals, data.id);
            }
        }
        return view.formatLabel(data.label, data.id);
    }

    private findPinnedProperties(context: AuthoredEntityContext): PinnedProperties | undefined {
        const {isExpanded, elementId} = this.props;
        if (isExpanded) { return undefined; }
        const templateState = context.view.model.getElement(elementId)!.elementState;
        if (!templateState) { return undefined; }
        const pinned = templateState[TemplateProperties.PinnedProperties] as PinnedProperties;
        return pinned;
    }

    private renderProperties(propsAsList: ReadonlyArray<FormattedProperty>) {
        if (!propsAsList.length) {
            return <div>no properties</div>;
        }

        return (
            <div className={`${CLASS_NAME}__properties`}>
                {propsAsList.map(({propertyId, label, values}) => {
                    return <div key={propertyId} className={`${CLASS_NAME}__properties-row`}>
                        <div className={`${CLASS_NAME}__properties-key`} title={`${label} (${propertyId})`}>
                            {label}
                        </div>
                        <div className={`${CLASS_NAME}__properties-values`}>
                            {values.map((term, index) => (
                                <div className={`${CLASS_NAME}__properties-value`}
                                    key={index}
                                    title={term.value}>
                                    {term.value}
                                </div>
                            ))}
                        </div>
                    </div>;
                })}
            </div>
        );
    }

    private renderPhoto() {
        const {data, color} = this.props;

        if (!data.image) { return null; }

        return (
            <div className={`${CLASS_NAME}__photo`} style={{borderColor: color}}>
                <img src={data.image} className={`${CLASS_NAME}__photo-image`} />
            </div>
        );
    }

    private renderIri(context: AuthoredEntityContext) {
        const {data} = this.props;
        const finalIri = context.editedIri === undefined ? data.id : context.editedIri;
        return (
            <div>
                <div className={`${CLASS_NAME}__iri`}>
                    <div className={`${CLASS_NAME}__iri-key`}>
                        IRI{context.editedIri ? '\u00A0(edited)' : ''}:
                    </div>
                    <div className={`${CLASS_NAME}__iri-value`}>
                        {isEncodedBlank(finalIri)
                            ? <span>(blank node)</span>
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

    private renderThumbnail(typesLabel: string) {
        const {data, color, iconUrl} = this.props;

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
            <div className={`${CLASS_NAME}__thumbnail`} aria-hidden='true' style={{color}}>
                {typesLabel.length > 0 ? typesLabel.charAt(0).toUpperCase() : '✳'}
            </div>
        );
    }

    private renderActions(context: AuthoredEntityContext) {
        const {canEdit, canDelete, onEdit, onDelete} = context;
        const SPINNER_WIDTH = 15;
        const SPINNER_HEIGHT = 12;
        return (
            <div className={`${CLASS_NAME}__actions`}>
                <button type='button'
                    className='ontodia-btn ontodia-btn-default'
                    title={canDelete ? 'Delete entity' : 'Deletion is unavailable for the selected element'}
                    disabled={!canDelete}
                    onClick={onDelete}>
                    <span className='fa fa-trash' />&nbsp;
                    {canEdit === undefined
                        ? <HtmlSpinner width={SPINNER_WIDTH} height={SPINNER_HEIGHT} />
                        : 'Delete'}
                </button>
                <button type='button'
                    className='ontodia-btn ontodia-btn-default'
                    title={canEdit ? 'Edit entity' : 'Editing is unavailable for the selected element'}
                    disabled={!canEdit}
                    onClick={onEdit}>
                    <span className='fa fa-edit' />&nbsp;
                    {canEdit === undefined
                        ? <HtmlSpinner width={SPINNER_WIDTH} height={SPINNER_HEIGHT} />
                        : 'Edit'}
                </button>
            </div>
        );
    }
}

interface PinnedProperties {
    [propertyId: string]: boolean;
}
