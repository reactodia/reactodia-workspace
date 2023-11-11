import * as React from 'react';

import { DiagramView } from '../diagram/view';
import { ElementModel, ElementIri, PropertyTypeIri } from '../data/model';
import * as Rdf from '../data/rdf/rdfModel';

const CLASS_NAME = 'ontodia-edit-form';

export interface EditEntityFormProps {
    view: DiagramView;
    entity: ElementModel;
    onApply: (entity: ElementModel) => void;
    onCancel: () => void;
}

interface State {
    elementModel: ElementModel;
}

export class EditEntityForm extends React.Component<EditEntityFormProps, State> {
    constructor(props: EditEntityFormProps) {
        super(props);
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
        const {view} = this.props;
        const richProperty = view.model.getProperty(key)!;
        const label = view.formatLabel(richProperty.label, key);
        return (
            <div key={key} className={`${CLASS_NAME}__form-row`}>
                <label>
                    {label}
                    {
                        values.map((term, index) => (
                            <input key={index}
                                className='ontodia-form-control'
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
        const {view} = this.props;
        const {elementModel} = this.state;
        const label = view.getElementTypeString(elementModel);
        return (
            <label>
                Type
                <input className='ontodia-form-control' value={label} disabled={true} />
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
                <input
                    className='ontodia-form-control'
                    defaultValue={elementModel.id}
                    onChange={this.onChangeIri}
                />
            </label>
        );
    }

    private onChangeLabel = (e: React.FormEvent<HTMLInputElement>) => {
        const {view} = this.props;
        const target = (e.target as HTMLInputElement);
        const labels = target.value.length > 0 ? [view.model.factory.literal(target.value)] : [];
        this.setState({elementModel: {
            ...this.state.elementModel,
            label: labels,
        }});
    };

    private renderLabel() {
        const {view} = this.props;
        const label = view.selectLabel(this.state.elementModel.label);
        const text = label ? label.value : '';
        return (
            <label>
                Label
                <input className='ontodia-form-control' value={text} onChange={this.onChangeLabel} />
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
                    <button className={`ontodia-btn ontodia-btn-primary ${CLASS_NAME}__apply-button`}
                        onClick={() => this.props.onApply(this.state.elementModel)}>
                        Apply
                    </button>
                    <button className='ontodia-btn ontodia-btn-default'
                        onClick={this.props.onCancel}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }
}
