import * as React from 'react';

import { MetadataApi } from '../data/metadataApi';
import { ElementModel, LinkModel, sameLink } from '../data/model';

import { EditorController } from '../editor/editorController';
import { DiagramView } from '../diagram/view';
import { LinkDirection } from '../diagram/elements';

import { ProgressBar, ProgressState } from '../widgets/progressBar';

import { LinkTypeSelector, LinkValue, validateLinkType } from './linkTypeSelector';

const CLASS_NAME = 'reactodia-edit-form';

export interface EditLinkFormProps {
    editor: EditorController;
    view: DiagramView;
    metadataApi: MetadataApi | undefined;
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

export class EditLinkForm extends React.Component<EditLinkFormProps, State> {
    private validationCancellation = new AbortController();

    constructor(props: EditLinkFormProps) {
        super(props);
        this.state = {
            linkValue: {
                value: {link: props.link, direction: LinkDirection.out},
                validated: true,
                allowChange: true,
            },
        };
    }

    componentDidMount() {
        this.validate();
    }

    componentDidUpdate(prevProps: EditLinkFormProps, prevState: State) {
        const {linkValue} = this.state;
        if (!sameLink(linkValue.value.link, prevState.linkValue.value.link)) {
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
        const {editor, link: originalLink} = this.props;
        const {linkValue: {value}} = this.state;
        this.setState({isValidating: true});

        this.validationCancellation.abort();
        this.validationCancellation = new AbortController();
        const signal = this.validationCancellation.signal;

        validateLinkType(editor, value.link, originalLink).then(error => {
            if (signal.aborted) { return; }
            this.setState(({linkValue}) => ({
                linkValue: {...linkValue, ...error, validated: true},
                isValidating: false,
            }));
        });
    }

    render() {
        const {editor, view, metadataApi, source, target} = this.props;
        const {linkValue, isValidating} = this.state;
        const isValid = !linkValue.error;
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__body`}>
                    <LinkTypeSelector editor={editor}
                        view={view}
                        metadataApi={metadataApi}
                        linkValue={linkValue}
                        source={source}
                        target={target}
                        onChange={value => this.setState({
                            linkValue: {value, error: undefined, validated: false, allowChange: false},
                        })}
                    />
                    {isValidating ? (
                        <div className={`${CLASS_NAME}__progress`}>
                            <ProgressBar state='loading'
                                title='Validating selected link type'
                                height={10}
                            />
                        </div>
                    ) : null}
                </div>
                <div className={`${CLASS_NAME}__controls`}>
                    <button className={`reactodia-btn reactodia-btn-primary ${CLASS_NAME}__apply-button`}
                        onClick={() => this.props.onApply(linkValue.value.link)}
                        disabled={!isValid || isValidating}>
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
}
