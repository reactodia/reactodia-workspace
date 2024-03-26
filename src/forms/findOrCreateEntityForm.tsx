import * as React from 'react';

import { setElementData } from '../diagram/commands';
import { Element, Link, makeLinkWithDirection } from '../diagram/elements';
import { HtmlSpinner } from '../diagram/spinner';

import { AuthoringState, TemporaryState } from '../editor/authoringState';

import { ProgressBar } from '../widgets/progressBar';

import { WorkspaceContext } from '../workspace/workspaceContext';

import { ElementTypeSelector, ElementValue, validateElementType } from './elementTypeSelector';
import { LinkTypeSelector, LinkValue, validateLinkType } from './linkTypeSelector';

const CLASS_NAME = 'reactodia-edit-form';

export interface FindOrCreateEntityFormProps {
    source: Element;
    target: Element;
    initialTargetIsNew: boolean;
    originalLink: Link;
    onAfterApply: () => void;
    onCancel: () => void;
}

interface State {
    elementValue: ElementValue;
    linkValue: LinkValue;
    isValidating?: boolean;
}

export class FindOrCreateEntityForm extends React.Component<FindOrCreateEntityFormProps, State> {
    static contextType = WorkspaceContext;
    declare readonly context: WorkspaceContext;

    private link: Link;

    private validationCancellation = new AbortController();

    constructor(props: FindOrCreateEntityFormProps, context: any) {
        super(props, context);
        const {target, initialTargetIsNew, originalLink} = this.props;
        this.link = originalLink;
        this.state = {
            elementValue: {
                value: target.data,
                isNew: initialTargetIsNew,
                loading: false,
                validated: true,
                allowChange: true,
            },
            linkValue: {
                value: {link: originalLink.data, direction: 'out'},
                validated: true,
                allowChange: true,
            },
        };
    }

    componentDidMount() {
        this.validate();
    }

    componentWillUnmount() {
        this.validationCancellation.abort();
    }

    private validate() {
        const {originalLink} = this.props;
        const {elementValue, linkValue} = this.state;
        this.setState({isValidating: true});

        this.validationCancellation.abort();
        this.validationCancellation = new AbortController();
        const signal = this.validationCancellation.signal;

        const validateElement = validateElementType(elementValue.value);
        const validateLink = validateLinkType(
            linkValue.value.link, originalLink.data, this.context
        );
        Promise.all([validateElement, validateLink]).then(([elementError, linkError]) => {
            if (signal.aborted) { return; }
            this.setState({isValidating: false});
            this.setElementOrLink({
                elementValue: {...elementValue, ...elementError, validated: true},
                linkValue: {...linkValue, ...linkError, validated: true},
            });
        });
    }

    render() {
        const {source, originalLink} = this.props;
        const {elementValue, linkValue, isValidating} = this.state;
        const isValid = !elementValue.error && !linkValue.error;
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__body`}>
                    <ElementTypeSelector source={source.data}
                        elementValue={elementValue}
                        onChange={newState => {
                            this.setElementOrLink({
                                elementValue: {
                                    value: newState.value,
                                    isNew: newState.isNew,
                                    loading: newState.loading,
                                    error: undefined,
                                    validated: false,
                                    allowChange: false,
                                },
                                linkValue: {
                                    value: {
                                        link: {...originalLink.data, targetId: newState.value.id},
                                        direction: 'out',
                                    },
                                    validated: false,
                                    allowChange: false,
                                },
                            });
                        }} />
                    {elementValue.loading ? (
                        <div style={{display: 'flex'}}>
                            <HtmlSpinner width={20} height={20} />&nbsp;Loading entity...
                        </div>
                    ) : (
                        <LinkTypeSelector linkValue={linkValue}
                            source={source.data}
                            target={elementValue.value}
                            onChange={value => this.setElementOrLink({
                                linkValue: {value, error: undefined, validated: false, allowChange: false},
                            })}
                            disabled={elementValue.error !== undefined}
                        />
                    )}
                    {isValidating ? (
                        <div className={`${CLASS_NAME}__progress`}>
                            <ProgressBar state='loading'
                                title='Validating selected element and link types'
                                height={10}
                            />
                        </div>
                    ) : null}
                </div>
                <div className={`${CLASS_NAME}__controls`}>
                    <button className={`reactodia-btn reactodia-btn-primary ${CLASS_NAME}__apply-button`}
                        onClick={this.onApply}
                        disabled={elementValue.loading || !isValid || isValidating}>
                        Apply
                    </button>
                    <button className='reactodia-btn reactodia-btn-default'
                        onClick={this.props.onCancel}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    private setElementOrLink({elementValue, linkValue}: {
        elementValue?: ElementValue;
        linkValue?: LinkValue;
    }) {
        const {model, editor} = this.context;
        this.setState(state => ({
            elementValue: elementValue || state.elementValue,
            linkValue: linkValue || state.linkValue,
        }),
        () => {
            const {source, target} = this.props;
            const {elementValue, linkValue} = this.state;
            if ((elementValue && !elementValue.validated) || (linkValue && !linkValue.validated)) {
                this.validate();
            }
            if (elementValue && elementValue.validated && elementValue.allowChange) {
                const previous = target.data;

                let temporaryState = editor.temporaryState;
                temporaryState = TemporaryState.deleteElement(temporaryState, previous);
                temporaryState = TemporaryState.deleteLink(temporaryState, this.link.data);
                editor.setTemporaryState(temporaryState);
                // Target IRI change may also update link data
                const batch = model.history.startBatch();
                batch.history.execute(setElementData(model, target.iri, elementValue.value));
                batch.discard();
                
                temporaryState = TemporaryState.addElement(temporaryState, target.data);
                temporaryState = TemporaryState.addLink(temporaryState, this.link.data);
                editor.setTemporaryState(temporaryState);
            }
            if (linkValue && linkValue.validated && linkValue.allowChange) {
                editor.removeTemporaryCells([this.link]);
                const newLink = makeLinkWithDirection(
                    new Link({
                        sourceId: source.id,
                        targetId: target.id,
                        data: {
                            ...linkValue.value.link,
                            sourceId: source.iri,
                            targetId: target.iri,
                        }
                    }),
                    linkValue.value.link
                );
                this.link = editor.createNewLink({link: newLink, temporary: true});
            }
        });
    }

    private onApply = () => {
        const {model, editor} = this.context;
        const {source, target, onAfterApply} = this.props;
        const {elementValue, linkValue} = this.state;
        const link = this.link;

        if (!elementValue.isNew) {
            editor.setTemporaryState(TemporaryState.deleteElement(
                editor.temporaryState,
                elementValue.value
            ));
        }
        editor.removeTemporaryCells([target, link]);

        const batch = model.history.startBatch(
            elementValue.isNew ? 'Create new entity' : 'Link to entity'
        );

        if (elementValue.isNew) {
            model.addElement(target);
            target.setExpanded(true);
            editor.setAuthoringState(
                AuthoringState.addElement(editor.authoringState, target.data)
            );
        } else {
            model.requestLinksOfType();
        }

        const newLink = makeLinkWithDirection(
            new Link({
                sourceId: source.id,
                targetId: target.id,
                data: {
                    ...link.data,
                    sourceId: source.iri,
                    targetId: target.iri,
                }
            }),
            linkValue.value.link
        );
        editor.createNewLink({link: newLink});

        batch.store();

        onAfterApply();
    };
}
