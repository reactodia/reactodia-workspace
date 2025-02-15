import classnames from 'classnames';
import * as React from 'react';

import { useKeyedSyncStore } from '../coreUtils/keyedObserver';

import { ElementModel, ElementIri, PropertyTypeIri } from '../data/model';
import * as Rdf from '../data/rdf/rdfModel';

import { subscribePropertyTypes } from '../editor/observedElement';
import { WithFetchStatus } from '../editor/withFetchStatus';

import { WorkspaceContext, useWorkspace } from '../workspace/workspaceContext';

const FORM_CLASS = 'reactodia-form';
const CLASS_NAME = 'reactodia-edit-entity-form';

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

    private renderType() {
        const {model, translation: t} = this.context;
        const {elementModel} = this.state;
        return (
            <label>
                {t.text('visual_authoring.edit_entity.type.label')}
                {elementModel.types.map(type => (
                    <input key={type}
                        className='reactodia-form-control'
                        name='reactodia-edit-entity-type'
                        title={type}
                        value={t.formatLabel(
                            model.getElementType(type)?.data?.label, type, model.language
                        )}
                        disabled={true}
                    />
                ))}
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
        const label = t.selectLabel(this.state.elementModel.label, model.language);
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
        const {elementModel} = this.state;
        return (
            <div className={classnames(FORM_CLASS, CLASS_NAME)}>
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
                    <Properties data={elementModel}
                        onChangeProperty={this.onChangeProperty}
                    />
                </div>
                <div className={`${FORM_CLASS}__controls`}>
                    <button type='button'
                        className={`reactodia-btn reactodia-btn-primary ${FORM_CLASS}__apply-button`}
                        title={t.text('visual_authoring.dialog.apply.title')}
                        onClick={() => this.props.onApply(this.state.elementModel)}>
                        {t.text('visual_authoring.dialog.apply.label')}
                    </button>
                    <button type='button'
                        className='reactodia-btn reactodia-btn-secondary'
                        title={t.text('visual_authoring.dialog.cancel.title')}
                        onClick={this.props.onCancel}>
                        {t.text('visual_authoring.dialog.cancel.label')}
                    </button>
                </div>
            </div>
        );
    }

    private onChangeProperty = (
        property: PropertyTypeIri,
        values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>
    ): void => {
        this.setState(prevState => {
            return {
                elementModel: {
                    ...prevState.elementModel,
                    properties: {
                        ...prevState.elementModel.properties,
                        [property]: values,
                    }
                }
            };
        });
    };
}


function Properties(props: {
    data: ElementModel;
    onChangeProperty: (
        property: PropertyTypeIri,
        values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>
    ) => void;
}) {
    const {data, onChangeProperty} = props;
    const {model, translation: t} = useWorkspace();

    const propertyIris = Object.keys(data.properties) as PropertyTypeIri[];
    useKeyedSyncStore(subscribePropertyTypes, propertyIris, model);

    if (propertyIris.length === 0) {
        return null;
    }

    const properties = propertyIris.map(iri => {
        const property = model.getPropertyType(iri);
        return {
            iri,
            label: t.formatLabel(property?.data?.label, iri, model.language),
            values: data.properties[iri],
        };
    });
    properties.sort((a, b) => a.label.localeCompare(b.label));

    return (
        <div role='list'
            className={`${CLASS_NAME}__properties`}>
            {properties.map(({iri, label, values}) => {
                return (
                    <div key={iri} className={`${FORM_CLASS}__row`}>
                        <label
                            title={t.text('visual_authoring.edit_entity.property.title', {
                                property: label,
                                propertyIri: iri,
                            })}>
                            <WithFetchStatus type='propertyType' target={iri}>
                                <span>
                                    {t.text('visual_authoring.edit_entity.property.label', {
                                        property: label,
                                        propertyIri: iri,
                                    })}
                                </span>
                            </WithFetchStatus>
                            <PropertyValues property={iri}
                                values={values}
                                onChange={onChangeProperty}
                                factory={model.factory}
                            />
                        </label>
                    </div>
                );
            })}
        </div>
    );
}

function PropertyValuesInner(props: {
    property: PropertyTypeIri;
    values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>;
    onChange: (
        property: PropertyTypeIri,
        values: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>
    ) => void;
    factory: Rdf.DataFactory;
}) {
    const {property, values, onChange, factory} = props;
    return (
        <>
            {values.map((term, index) => (
                <input key={index}
                    name='reactodia-edit-entity-property'
                    className={classnames('reactodia-form-control')}
                    value={term.value}
                    onChange={e => {
                        const changedValue = e.currentTarget.value;
                        const nextValues = [...values];
                        nextValues[index] = setTermValue(term, changedValue, factory);
                        onChange(property, nextValues);
                    }}
                />
            ))}
        </>
    );
}

function setTermValue(
    term: Rdf.NamedNode | Rdf.Literal,
    value: string,
    factory: Rdf.DataFactory
): Rdf.NamedNode | Rdf.Literal {
    if (term.termType === 'NamedNode') {
        return factory.namedNode(value);
    } else if (term.language) {
        return factory.literal(value, term.language);
    } else {
        return factory.literal(value, term.datatype);
    }
}

const PropertyValues = React.memo(
    PropertyValuesInner,
    (prevProps, nextProps) => (
        prevProps.property === nextProps.property &&
        prevProps.values === nextProps.values &&
        prevProps.onChange === nextProps.onChange &&
        prevProps.factory === nextProps.factory
    )
);
