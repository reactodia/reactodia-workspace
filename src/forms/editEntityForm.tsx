import * as React from 'react';

import { ElementModel, ElementIri, PropertyTypeIri } from '../data/model';
import * as Rdf from '../data/rdf/rdfModel';

import { WorkspaceContext } from '../workspace/workspaceContext';

const CLASS_NAME = 'reactodia-edit-form';

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
        const {model} = this.context;
        const propertyType = model.getPropertyType(key);
        const label = model.locale.formatLabel(propertyType?.label, key);
        return (
            <div key={key} className={`${CLASS_NAME}__form-row`}>
                <label>
                    {label}
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
        const {model} = this.context;
        const {elementModel} = this.state;
        const label = model.locale.formatElementTypes(elementModel.types).join(', ');
        return (
            <label>
                Type
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
        const {elementModel} = this.state;
        return (
            <label>
                IRI
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
        const {model} = this.context;
        const label = model.locale.selectLabel(this.state.elementModel.label);
        const text = label ? label.value : '';
        return (
            <label>
                Label
                <input className='reactodia-form-control'
                    name='reactodia-edit-entity-label'
                    value={text}
                    onChange={this.onChangeLabel}
                />
            </label>
        );
    }

    render() {
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__body`}>
                    <div className={`${CLASS_NAME}__form-row`}>
                        {this.renderIri()}
                    </div>
                    <div className={`${CLASS_NAME}__form-row`}>
                        {this.renderType()}
                    </div>
                    <div className={`${CLASS_NAME}__form-row`}>
                        {this.renderLabel()}
                    </div>
                    {this.renderProperties()}
                </div>
                <div className={`${CLASS_NAME}__controls`}>
                    <button type='button'
                        className={`reactodia-btn reactodia-btn-primary ${CLASS_NAME}__apply-button`}
                        onClick={() => this.props.onApply(this.state.elementModel)}>
                        Apply
                    </button>
                    <button type='button'
                        className='reactodia-btn reactodia-btn-default'
                        onClick={this.props.onCancel}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }
}
