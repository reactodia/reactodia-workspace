import * as React from 'react';

import { Link } from '../diagram/elements';
import { DiagramView } from '../diagram/view';

const CLASS_NAME = 'ontodia-edit-form';

export interface EditLinkLabelFormProps {
    view: DiagramView;
    link: Link;
    onApply: (label: string) => void;
    onCancel: () => void;
}

interface State {
    label: string;
}

export class EditLinkLabelForm extends React.Component<EditLinkLabelFormProps, State> {
    constructor(props: EditLinkLabelFormProps) {
        super(props);
        const label = this.computeLabel();
        this.state = {label};
    }

    componentDidUpdate(prevProps: EditLinkLabelFormProps) {
        if (this.props.link.typeId !== prevProps.link.typeId) {
            const label = this.computeLabel();
            this.setState({label});
        }
    }

    private computeLabel(): string {
        const {view, link} = this.props;

        const linkType = view.model.getLinkType(link.typeId)!;
        const template = view.createLinkTemplate(linkType);
        const {label = {}} = template.renderLink(link, view.model);

        return (label.label && label.label.length > 0)
            ? view.selectLabel(label.label)!.value
            : view.formatLabel(linkType.label, linkType.id);
    }

    render() {
        const {onApply, onCancel} = this.props;
        const {label} = this.state;
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__body`}>
                    <div className={`${CLASS_NAME}__form-row`}>
                        <label>Link Label</label>
                        <input className='ontodia-form-control' value={label}
                            onChange={e => this.setState({label: (e.target as HTMLInputElement).value})} />
                    </div>
                </div>
                <div className={`${CLASS_NAME}__controls`}>
                    <button className={`ontodia-btn ontodia-btn-success ${CLASS_NAME}__apply-button`}
                        onClick={() => onApply(label)}>
                        Apply
                    </button>
                    <button className='ontodia-btn ontodia-btn-danger' onClick={() => onCancel()}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }
}
