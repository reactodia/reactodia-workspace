import * as React from 'react';

import { useEventStore, useSyncStore } from '../coreUtils/hooks';

import { Link } from '../diagram/elements';

import { useWorkspace } from '../workspace/workspaceContext';

const CLASS_NAME = 'reactodia-edit-form';

export interface RenameLinkFormProps {
    link: Link;
    onFinish: () => void;
}

export function RenameLinkForm(props: RenameLinkFormProps) {
    const {link, onFinish} = props;

    const {model, view: {renameLinkProvider}} = useWorkspace();

    const linkType = model.getLinkType(link.typeId);
    const linkTypeChangeStore = useEventStore(linkType?.events, 'changeData');
    const linkTypeLabel = useSyncStore(linkTypeChangeStore, () => linkType?.data?.label);

    const defaultLabel = React.useMemo(
        () => model.locale.formatLabel(linkTypeLabel, link.typeId),
        [link, linkTypeLabel]
    );

    const [customLabel, setCustomLabel] = React.useState(
        renameLinkProvider?.getLabel(link) ?? defaultLabel
    );

    const onApply = () => {
        if (renameLinkProvider) {
            renameLinkProvider.setLabel(link, customLabel);
        }
        onFinish();
    };

    return (
        <div className={CLASS_NAME}>
            <div className={`${CLASS_NAME}__body`}>
                <div className={`${CLASS_NAME}__form-row`}>
                    <label>Link Label</label>
                    <input className='reactodia-form-control'
                        placeholder={defaultLabel}
                        value={customLabel}
                        onChange={e => setCustomLabel((e.target as HTMLInputElement).value)}
                    />
                </div>
            </div>
            <div className={`${CLASS_NAME}__controls`}>
                <button className={`reactodia-btn reactodia-btn-primary ${CLASS_NAME}__apply-button`}
                    onClick={onApply}>
                    Apply
                </button>
                <button className='reactodia-btn reactodia-btn-default' onClick={onFinish}>
                    Cancel
                </button>
            </div>
        </div>
    );
}
