import * as React from 'react';

import { ElementModel, ElementIri, PropertyTypeIri } from '../data/model';
import * as Rdf from '../data/rdf/rdfModel';

import { WorkspaceContext } from '../workspace/workspaceContext';

const FORM_CLASS = 'reactodia-form';

export interface EditEntityFormProps {
    entity: ElementModel;
    onApply: (entity: ElementModel) => void;
    onCancel: () => void;
}

interface State {
    elementModel: ElementModel;
}

export class EditEntityForm extends React.Component<EditEntityFormProps, State> {
    static contextType = WorkspaceContext;
    declare readonly context: WorkspaceContext;

    constructor(props: EditEntityFormProps, context: any) {
        super(props, context);
        this.state = {elementModel: props.entity};
    }

    componentDidUpdate(prevProps: EditEntityFormProps) {
        if (this.props.entity !== prevProps.entity) {
            this.setState({elementModel: this.props.entity});
        }
    }

    private renderProperty(
        key: PropertyTypeIri,
        values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>
    ) {
        const {model, translation: t} = this.context;
        const propertyType = model.getPropertyType(key);
        const property = model.locale.formatLabel(propertyType?.data?.label, key);
        const propertyIri = model.locale.formatIri(key);
        return (
            <div key={key} className={`${FORM_CLASS}__row`}>
                <label
                    title={t.format('visual_authoring.edit_entity.property.title', {
                        property,
                        propertyIri,
                    })}>
                    {t.format('visual_authoring.edit_entity.property.label', {
                        property,
                        propertyIri,
                    })}
                    {
                        values.map((term, index) => (
                            <input key={index}
                                name='reactodia-edit-entity-property'
                                className='reactodia-form-control'
                                defaultValue={term.value}
                            />
                        ))
                    }
                </label>
            </div>
        );
    }

    private renderProperties() {
        const {properties} = this.props.entity;
        const propertyIris = Object.keys(properties) as PropertyTypeIri[];
        return (
            <div>
                {propertyIris.map(iri => {
                    return this.renderProperty(iri, properties[iri]);
                })}
            </div>
        );
    }

    private renderType() {
        const {model, translation: t} = this.context;
        const {elementModel} = this.state;
        const label = model.locale.formatElementTypes(elementModel.types).join(', ');
        return (
            <label>
                {t.text('visual_authoring.edit_entity.type.label')}
                <input className='reactodia-form-control'
                    name='reactodia-edit-entity-type'
                    value={label}
                    disabled={true}
                />
            </label>
        );
    }

    private onChangeIri = (e: React.FormEvent<HTMLInputElement>) => {
        const target = (e.target as HTMLInputElement);
        const iri = target.value as ElementIri;
        this.setState(prevState => {
            return {
                elementModel: {
                    ...prevState.elementModel,
                    id: iri,
                }
            };
        });
    };

    private renderIri() {
        const {translation: t} = this.context;
        const {elementModel} = this.state;
        return (
            <label>
                {t.text('visual_authoring.edit_entity.iri.label')}
                <input className='reactodia-form-control'
                    name='reactodia-edit-entity-iri'
                    defaultValue={elementModel.id}
                    onChange={this.onChangeIri}
                />
            </label>
        );
    }

    private onChangeLabel = (e: React.FormEvent<HTMLInputElement>) => {
        const {model} = this.context;
        const target = (e.target as HTMLInputElement);
        const labels = target.value.length > 0 ? [model.factory.literal(target.value)] : [];
        this.setState({elementModel: {
            ...this.state.elementModel,
            label: labels,
        }});
    };

    private renderLabel() {
        const {model, translation: t} = this.context;
        const label = model.locale.selectLabel(this.state.elementModel.label);
        const text = label ? label.value : '';
        return (
            <label>
                {t.text('visual_authoring.edit_entity.label.label')}
                <input className='reactodia-form-control'
                    name='reactodia-edit-entity-label'
                    value={text}
                    onChange={this.onChangeLabel}
                />
            </label>
        );
    }

    render() {
        const {translation: t} = this.context;
        return (
            <div className={FORM_CLASS}>
                <div className={`reactodia-scrollable ${FORM_CLASS}__body`}>
                    <div className={`${FORM_CLASS}__row`}>
                        {this.renderIri()}
                    </div>
                    <div className={`${FORM_CLASS}__row`}>
                        {this.renderType()}
                    </div>
                    <div className={`${FORM_CLASS}__row`}>
                        {this.renderLabel()}
                    </div>
                    {this.renderProperties()}
                </div>
                <div className={`${FORM_CLASS}__controls`}>
                    <button type='button'
                        className={`reactodia-btn reactodia-btn-primary ${FORM_CLASS}__apply-button`}
                        title={t.text('visual_authoring.dialog.apply.title')}
                        onClick={() => this.props.onApply(this.state.elementModel)}>
                        {t.text('visual_authoring.dialog.apply.label')}
                    </button>
                    <button type='button'
                        className='reactodia-btn reactodia-btn-default'
                        title={t.text('visual_authoring.dialog.cancel.title')}
                        onClick={this.props.onCancel}>
                        {t.text('visual_authoring.dialog.cancel.label')}
                    </button>
                </div>
            </div>
        );
    }
}
