import * as React from 'react';

import { ElementModel, LinkModel, equalLinks } from '../data/model';

import { ProgressBar } from '../widgets/utility/progressBar';

import { WorkspaceContext } from '../workspace/workspaceContext';

import { LinkTypeSelector, LinkValue, validateLinkType } from './linkTypeSelector';

const FORM_CLASS = 'reactodia-form';

export interface EditRelationFormProps {
    link: LinkModel;
    source: ElementModel;
    target: ElementModel;
    onChange: (entity: LinkModel) => void;
    onApply: (entity: LinkModel) => void;
    onCancel: () => void;
}

interface State {
    linkValue: LinkValue;
    isValidating?: boolean;
}

export class EditRelationForm extends React.Component<EditRelationFormProps, State> {
    static contextType = WorkspaceContext;
    declare readonly context: WorkspaceContext;
    
    private validationCancellation = new AbortController();

    constructor(props: EditRelationFormProps, context: any) {
        super(props, context);
        this.state = {
            linkValue: {
                value: {link: props.link, direction: 'out'},
                validated: true,
                allowChange: true,
            },
        };
    }

    componentDidMount() {
        this.validate();
    }

    componentDidUpdate(prevProps: EditRelationFormProps, prevState: State) {
        const {linkValue} = this.state;
        if (!equalLinks(linkValue.value.link, prevState.linkValue.value.link)) {
            this.validate();
        }
        if (linkValue !== prevState.linkValue && linkValue.validated && linkValue.allowChange) {
            this.props.onChange(linkValue.value.link);
        }
    }

    componentWillUnmount() {
        this.validationCancellation.abort();
    }

    private validate() {
        const {link: originalLink} = this.props;
        const {linkValue: {value}} = this.state;
        this.setState({isValidating: true});

        this.validationCancellation.abort();
        this.validationCancellation = new AbortController();
        const signal = this.validationCancellation.signal;

        validateLinkType(
            value.link,
            originalLink,
            this.context,
            signal,
        ).then(error => {
            if (signal.aborted) { return; }
            this.setState(({linkValue}) => ({
                linkValue: {...linkValue, ...error, validated: true},
                isValidating: false,
            }));
        });
    }

    render() {
        const {translation: t} = this.context;
        const {source, target} = this.props;
        const {linkValue, isValidating} = this.state;
        const isValid = !linkValue.error;
        return (
            <div className={FORM_CLASS}>
                <div className={`${FORM_CLASS}__body`}>
                    <LinkTypeSelector linkValue={linkValue}
                        source={source}
                        target={target}
                        onChange={value => this.setState({
                            linkValue: {value, error: undefined, validated: false, allowChange: false},
                        })}
                    />
                    {isValidating ? (
                        <div className={`${FORM_CLASS}__progress`}>
                            <ProgressBar state='loading'
                                title={t.text('visual_authoring.edit_relation.validation_progress.title')}
                                height={10}
                            />
                        </div>
                    ) : null}
                </div>
                <div className={`${FORM_CLASS}__controls`}>
                    <button className={`reactodia-btn reactodia-btn-primary ${FORM_CLASS}__apply-button`}
                        onClick={() => this.props.onApply(linkValue.value.link)}
                        disabled={!isValid || isValidating}
                        title={t.text('visual_authoring.dialog.apply.title')}>
                        {t.text('visual_authoring.dialog.apply.label')}
                    </button>
                    <button className='reactodia-btn reactodia-btn-default'
                        onClick={this.props.onCancel}
                        title={t.text('visual_authoring.dialog.cancel.title')}>
                        {t.text('visual_authoring.dialog.cancel.label')}
                    </button>
                </div>
            </div>
        );
    }
}
