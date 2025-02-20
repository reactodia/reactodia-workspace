import * as React from 'react';

import { LinkModel, equalLinks, equalProperties } from '../data/model';

import { EntityElement, RelationLink } from '../editor/dataElements';

import { ProgressBar } from '../widgets/utility/progressBar';

import { useWorkspace } from '../workspace/workspaceContext';

import {
    LinkTypeSelector, ValidatedLink, dataFromExtendedLink, relationFromExtendedLink, validateLinkType,
} from './linkTypeSelector';

const FORM_CLASS = 'reactodia-form';

export interface EditRelationFormProps {
    originalLink: RelationLink;
    source: EntityElement;
    target: EntityElement;
    onChangeTarget: (newTarget: RelationLink) => void;
    onAfterApply: () => void;
    onCancel: () => void;
}

export function EditRelationForm(props: EditRelationFormProps) {
    const [version, setVersion] = React.useState(0);
    React.useLayoutEffect(() => {
        // Reset the form completely on source/target changes
        setVersion(previous => previous + 1);
    }, [props.source, props.target]);
    return <EditRelationFormInner key={version} {...props} />;
}

function EditRelationFormInner(props: EditRelationFormProps) {
    const {originalLink, source, target, onChangeTarget, onAfterApply, onCancel} = props;
    const workspace = useWorkspace();
    const {editor, translation: t} = workspace;

    const [value, setValue] = React.useState((): ValidatedLink => ({
        link: {
            base: props.originalLink.data,
            source: props.source.data,
            target: props.target.data,
            direction: 'out',
        },
        validated: true,
        allowChange: true,
    }));

    const [validating, setValidating] = React.useState(false);
    const lastValidated = React.useRef<LinkModel | undefined>(undefined);

    React.useEffect(() => {
        const toValidate = dataFromExtendedLink(value.link);
        if (!lastValidated.current || !equalLinks(toValidate, lastValidated.current)) {
            const cancellation = new AbortController();
            setValidating(true);
            validateLinkType(
                toValidate,
                originalLink.data,
                workspace,
                cancellation.signal,
            ).then(error => {
                if (cancellation.signal.aborted) { return; }
                lastValidated.current = toValidate;
                setValue(previous => ({
                    ...previous,
                    ...error,
                    validated: true,
                }));
                setValidating(false);
            });
            return () => cancellation.abort();
        }
    }, [value.link]);

    React.useEffect(() => {
        if (
            editor.temporaryState.links.has(originalLink.data) &&
            value.validated &&
            value.allowChange
        ) {
            const toApply = dataFromExtendedLink(value.link);
            if (!equalLinks(originalLink.data, toApply)) {
                const linkBase = relationFromExtendedLink(value.link, source, target);
                const recreatedTarget = editor.createRelation(linkBase, {temporary: true});
                onChangeTarget(recreatedTarget);
            }
        }
    }, [value]);

    const onApply = () => {
        const toApply = dataFromExtendedLink(value.link);

        if (editor.temporaryState.links.has(originalLink.data)) {
            editor.removeTemporaryCells([originalLink]);
            const linkBase = relationFromExtendedLink(value.link, source, target);
            editor.createRelation(linkBase);
        } else if (!(
            equalLinks(originalLink.data, toApply) &&
            equalProperties(originalLink.data.properties, toApply.properties)
        )) {
            editor.changeRelation(originalLink.data, toApply);
        }

        onAfterApply();
    };

    const linkIsValid = !value.error;
    return (
        <div className={FORM_CLASS}>
            <div className={`${FORM_CLASS}__body`}>
                <LinkTypeSelector link={value.link}
                    error={value.error}
                    onChange={link => setValue({
                        link,
                        error: undefined,
                        validated: false,
                        allowChange: false,
                    })}
                />
                {validating ? (
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
                    onClick={onApply}
                    disabled={!linkIsValid || validating}
                    title={t.text('visual_authoring.dialog.apply.title')}>
                    {t.text('visual_authoring.dialog.apply.label')}
                </button>
                <button className='reactodia-btn reactodia-btn-secondary'
                    onClick={onCancel}
                    title={t.text('visual_authoring.dialog.cancel.title')}>
                    {t.text('visual_authoring.dialog.cancel.label')}
                </button>
            </div>
        </div>
    );
}
