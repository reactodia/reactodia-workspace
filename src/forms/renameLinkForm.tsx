import * as React from 'react';

import { CanvasContext } from '../diagram/canvasApi';
import { Link } from '../diagram/elements';

const CLASS_NAME = 'reactodia-edit-form';

export interface RenameLinkFormProps {
    link: Link;
    onFinish: () => void;
}

interface State {
    label: string;
}

export class RenameLinkForm extends React.Component<RenameLinkFormProps, State> {
    static contextType = CanvasContext;
    declare readonly context: CanvasContext;

    constructor(props: RenameLinkFormProps, context: any) {
        super(props, context);
        const label = this.computeLabel();
        this.state = {label};
    }

    componentDidUpdate(prevProps: RenameLinkFormProps) {
        if (this.props.link.typeId !== prevProps.link.typeId) {
            const label = this.computeLabel();
            this.setState({label});
        }
    }

    private computeLabel(): string {
        const {link} = this.props;
        const {canvas, model} = this.context;

        const linkType = model.getLinkType(link.typeId)!;
        const {editableLabel} = canvas.renderingState.createLinkTemplate(linkType);
        const label = editableLabel!.getLabel(link)
            ?? model.locale.formatLabel(linkType.label, linkType.id);

        return label;
    }

    render() {
        const {onFinish} = this.props;
        const {label} = this.state;
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__body`}>
                    <div className={`${CLASS_NAME}__form-row`}>
                        <label>Link Label</label>
                        <input className='reactodia-form-control' value={label}
                            onChange={e => this.setState({label: (e.target as HTMLInputElement).value})} />
                    </div>
                </div>
                <div className={`${CLASS_NAME}__controls`}>
                    <button className={`reactodia-btn reactodia-btn-primary ${CLASS_NAME}__apply-button`}
                        onClick={this.onApply}>
                        Apply
                    </button>
                    <button className='reactodia-btn reactodia-btn-default' onClick={onFinish}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    private onApply = () => {
        const {link, onFinish} = this.props;
        const {canvas, model} = this.context;
        const {label} = this.state;

        const linkType = model.getLinkType(link.typeId)!;
        const {editableLabel} = canvas.renderingState.createLinkTemplate(linkType);
        editableLabel!.setLabel(link, label);

        onFinish();
    };
}
