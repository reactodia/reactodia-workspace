import * as React from 'react';

import { TranslatedText } from '../coreUtils/i18n';

import { HtmlSpinner } from '../diagram/spinner';

import { AuthoringState, TemporaryState } from '../editor/authoringState';
import { EntityElement, RelationLink, changeEntityData } from '../editor/dataElements';

import { ProgressBar } from '../widgets/utility/progressBar';

import { WorkspaceContext } from '../workspace/workspaceContext';

import { ElementTypeSelector, ElementValue, validateElementType } from './elementTypeSelector';
import {
    LinkTypeSelector, ValidatedLink, dataFromExtendedLink, relationFromExtendedLink, validateLinkType,
} from './linkTypeSelector';

export interface FindOrCreateEntityFormProps {
    source: EntityElement;
    target: EntityElement;
    initialTargetIsNew: boolean;
    originalLink: RelationLink;
    onAfterApply: () => void;
    onCancel: () => void;
}

interface State {
    elementValue: ElementValue;
    linkValue: ValidatedLink;
    isValidating?: boolean;
}

const FORM_CLASS = 'reactodia-form';

export class FindOrCreateEntityForm extends React.Component<FindOrCreateEntityFormProps, State> {
    static contextType = WorkspaceContext;
    declare readonly context: WorkspaceContext;

    private link: RelationLink;

    private validationCancellation = new AbortController();

    constructor(props: FindOrCreateEntityFormProps) {
        super(props);
        const {source, target, initialTargetIsNew, originalLink} = this.props;
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
                link: {
                    base: originalLink.data,
                    source: source.data,
                    target: target.data,
                    direction: 'out',
                },
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

        const validateElement = validateElementType(elementValue.value, this.context);
        const validateLink = validateLinkType(
            dataFromExtendedLink(linkValue.link),
            originalLink.data,
            this.context,
            signal
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
        const {translation: t} = this.context;
        const {source, originalLink} = this.props;
        const {elementValue, linkValue, isValidating} = this.state;
        const isValid = !elementValue.error && !linkValue.error;
        return (
            <div className={FORM_CLASS}>
                <div className={`${FORM_CLASS}__body`}>
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
                                    link: {
                                        base: originalLink.data,
                                        source: source.data,
                                        target: newState.value,
                                        direction: 'out',
                                    },
                                    validated: false,
                                    allowChange: false,
                                },
                            });
                        }} />
                    {elementValue.loading ? (
                        <div style={{display: 'flex'}}>
                            <HtmlSpinner width={20} height={20} />
                            &nbsp;{t.text('visual_authoring.find_or_create.loading.label')}
                        </div>
                    ) : (
                        <LinkTypeSelector link={linkValue.link}
                            error={linkValue.error}
                            onChange={link => this.setElementOrLink({
                                linkValue: {link, error: undefined, validated: false, allowChange: false},
                            })}
                            disabled={elementValue.error !== undefined}
                        />
                    )}
                    {isValidating ? (
                        <div className={`${FORM_CLASS}__progress`}>
                            <ProgressBar state='loading'
                                title={t.text('visual_authoring.find_or_create.validation_progress.title')}
                                height={10}
                            />
                        </div>
                    ) : null}
                </div>
                <div className={`${FORM_CLASS}__controls`}>
                    <button className={`reactodia-btn reactodia-btn-primary ${FORM_CLASS}__apply-button`}
                        onClick={this.onApply}
                        disabled={elementValue.loading || !isValid || isValidating}
                        title={t.text('visual_authoring.dialog.apply.title')}>
                        {t.text('visual_authoring.dialog.apply.label')}
                    </button>
                    <button className='reactodia-btn reactodia-btn-secondary'
                        onClick={this.props.onCancel}
                        title={t.text('visual_authoring.dialog.cancel.title')}>
                        {t.text('visual_authoring.dialog.cancel.label')}
                    </button>
                </div>
            </div>
        );
    }

    private setElementOrLink({elementValue, linkValue}: {
        elementValue?: ElementValue;
        linkValue?: ValidatedLink;
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
                temporaryState = TemporaryState.removeEntity(temporaryState, previous);
                temporaryState = TemporaryState.removeRelation(temporaryState, this.link.data);
                editor.setTemporaryState(temporaryState);
                // Target IRI change may also update link data
                const batch = model.history.startBatch();
                batch.history.execute(changeEntityData(model, target.iri, elementValue.value));
                batch.discard();
                
                temporaryState = TemporaryState.addEntity(temporaryState, target.data);
                temporaryState = TemporaryState.addRelation(temporaryState, this.link.data);
                editor.setTemporaryState(temporaryState);
            }
            if (linkValue && linkValue.validated && linkValue.allowChange) {
                editor.removeTemporaryCells([this.link]);
                const linkBase = relationFromExtendedLink(linkValue.link, source, target);
                this.link = editor.createRelation(linkBase, {temporary: true});
            }
        });
    }

    private onApply = () => {
        const {model, editor} = this.context;
        const {source, target, onAfterApply} = this.props;
        const {elementValue, linkValue} = this.state;
        const link = this.link;

        if (!elementValue.isNew) {
            editor.setTemporaryState(TemporaryState.removeEntity(
                editor.temporaryState,
                elementValue.value
            ));
        }
        editor.removeTemporaryCells([target, link]);

        const batch = model.history.startBatch(
            elementValue.isNew
                ? TranslatedText.text('visual_authoring.find_or_create.create_command')
                : TranslatedText.text('visual_authoring.find_or_create.connect_command')
        );

        if (elementValue.isNew) {
            model.addElement(target);
            target.setExpanded(true);
            editor.setAuthoringState(
                AuthoringState.addEntity(editor.authoringState, target.data)
            );
        } else {
            model.requestLinks({addedElements: [elementValue.value.id]});
        }

        const linkBase = relationFromExtendedLink(linkValue.link, source, target);
        editor.createRelation(linkBase);

        batch.store();

        onAfterApply();
    };
}
