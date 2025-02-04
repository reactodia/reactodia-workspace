import * as React from 'react';

import { useEventStore, useSyncStore } from '../coreUtils/hooks';

import { Link } from '../diagram/elements';

import { useWorkspace } from '../workspace/workspaceContext';

const FORM_CLASS = 'reactodia-form';

export interface RenameLinkFormProps {
    link: Link;
    onFinish: () => void;
}

export function RenameLinkForm(props: RenameLinkFormProps) {
    const {link, onFinish} = props;

    const {model, view: {renameLinkProvider}, translation: t} = useWorkspace();

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
        <div className={FORM_CLASS}>
            <div className={`${FORM_CLASS}__body`}>
                <div className={`${FORM_CLASS}__row`}>
                    <label>{t.text('visual_authoring.rename_link.label.label')}</label>
                    <input className='reactodia-form-control'
                        placeholder={defaultLabel}
                        autoFocus
                        value={customLabel}
                        onChange={e => setCustomLabel((e.target as HTMLInputElement).value)}
                    />
                </div>
            </div>
            <div className={`${FORM_CLASS}__controls`}>
                <button className={`reactodia-btn reactodia-btn-primary ${FORM_CLASS}__apply-button`}
                    title={t.text('visual_authoring.dialog.apply.title')}
                    onClick={onApply}>
                    {t.text('visual_authoring.dialog.apply.label')}
                </button>
                <button className='reactodia-btn reactodia-btn-default'
                    title={t.text('visual_authoring.dialog.cancel.title')}
                    onClick={onFinish}>
                    {t.text('visual_authoring.dialog.cancel.label')}
                </button>
            </div>
        </div>
    );
}
