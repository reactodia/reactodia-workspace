import cx from 'clsx';
import * as React from 'react';

import { useTranslation } from '../../coreUtils/i18n';
import { useAsync } from '../../coreUtils/hooks';

import { ElementModel, LinkModel, PropertyTypeIri, equalLinks, equalProperties } from '../../data/model';
import type { MetadataProvider, MetadataRelationShape } from '../../data/metadataProvider';

import { HtmlSpinner } from '../../diagram/spinner';

import { EntityElement, RelationLink } from '../../editor/dataElements';

import { ProgressBar } from '../utility/progressBar';

import type { InputMultiUpdater, InputMultiProps } from '../../forms';

import { useWorkspace } from '../../workspace/workspaceContext';

import type { PropertyEditorOptionsRelation } from '../visualAuthoring/visualAuthoring';

import { InputGroup } from './inputGroup';
import {
    LinkTypeSelector, type ValidatedLink,
    dataFromExtendedLink, relationFromExtendedLink, validateLinkType,
} from './linkTypeSelector';

const FORM_CLASS = 'reactodia-form';
const CLASS_NAME = 'reactodia-edit-relation-form';

/**
 * State provided by {@link RelationEditor} to nested components.
 */
export interface RelationEditorProvidedProps {
    /**
     * Relation editor status:
     *  - `ok`: relation is valid and ready to be submitted;
     *  - `validating`: relation is checked whether it can be created or changed
     *    to the selected type;
     *  - `invalid`: relation cannot be created or changed to the selected type.
     */
    status: 'ok' | 'validating' | 'invalid';
    /**
     * Current (draft) relation data to edit.
     */
    data: LinkModel;
    /**
     * Data for the current relation source.
     */
    linkSource: ElementModel;
    /**
     * Data for the current relation target.
     */
    linkTarget: ElementModel;
    /**
     * Handler to update current relation data in the property editor.
     *
     * **Note**: only relation properties can be changed via `update` function.
     */
    updateData: (update: (previous: LinkModel) => LinkModel) => void;
    /**
     * Handler to apply changes to the relation, including changes
     * from calling {@link updateData} or from {@link RelationTypeSelector}.
     */
    applyChanges: () => void;
}

interface RelationEditorContext {
    readonly value: ValidatedLink;
    readonly setValue: (nextValue: ValidatedLink) => void;
    readonly validating: boolean;
}

const RelationEditorContext = React.createContext<RelationEditorContext | null>(null);

/**
 * Component which allows to build an relation editor by using provided state
 * and callbacks to the nested components.
 *
 * `target` must be a {@link RelationLink} placed on the canvas.
 *
 * @category Components
 */
export function RelationEditor(props: {
    /**
     * Target relation link to edit.
     */
    relation: RelationLink;
    /**
     * Handler to update the edited link when its endpoint (source or target element) changes.
     *
     * This is required to be handled because link endpoints cannot be changed directly
     * without re-creating the link itself.
     */
    onChangeTarget: (newLink: RelationLink) => void;
    /**
     * Render function to make an editor UI using provided state.
     */
    children: (props: RelationEditorProvidedProps) => React.ReactNode;
}) {
    const {relation, onChangeTarget, children} = props;
    const {model} = useWorkspace();
    const [version, setVersion] = React.useState(0);
    const relationSource = model.getElement(relation.sourceId);
    const relationTarget = model.getElement(relation.targetId);
    if (!(relationSource instanceof EntityElement && relationTarget instanceof EntityElement)) {
        throw new Error('Reactodia: cannot find relation source and target on the canvas');
    }
    React.useLayoutEffect(() => {
        // Reset the form completely on source/target changes
        setVersion(previous => previous + 1);
    }, [relationSource, relationTarget]);
    return (
        <RelationEditorInner key={version}
            original={relation}
            originalSource={relationSource}
            originalTarget={relationTarget}
            onChangeTarget={onChangeTarget}>
            {children}
        </RelationEditorInner>
    );
}

function RelationEditorInner(props: {
    original: RelationLink;
    originalSource: EntityElement;
    originalTarget: EntityElement;
    onChangeTarget: (newLink: RelationLink) => void;
    children: (props: RelationEditorProvidedProps) => React.ReactNode;
}) {
    const {original, originalSource, originalTarget, onChangeTarget, children} = props;
    const workspace = useWorkspace();
    const t = useTranslation();
    const {editor} = workspace;

    const [value, setValue] = React.useState((): ValidatedLink => ({
        link: {
            base: original.data,
            source: originalSource.data,
            target: originalTarget.data,
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
            void validateLinkType(
                toValidate,
                original.data,
                workspace,
                t,
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
            editor.temporaryState.links.has(original.data) &&
            value.validated &&
            value.allowChange
        ) {
            const toApply = dataFromExtendedLink(value.link);
            if (!equalLinks(original.data, toApply)) {
                const linkBase = relationFromExtendedLink(value.link, originalSource, originalTarget);
                const recreatedTarget = editor.createRelation(linkBase, {temporary: true});
                onChangeTarget(recreatedTarget);
            }
        }
    }, [value]);

    const context = React.useMemo(
        (): RelationEditorContext => ({value, setValue, validating}),
        [value, validating]
    );

    return (
        <RelationEditorContext.Provider value={context}>
            {children({
                status: (
                    validating ? 'validating' :
                    value.error ? 'invalid' :
                    'ok'
                ),
                data: dataFromExtendedLink(value.link),
                linkSource: value.link.source,
                linkTarget: value.link.target,
                updateData: update => {
                    setValue((previous): ValidatedLink => {
                        const nextData = update(dataFromExtendedLink(previous.link));
                        const previousProperties = previous.link.base.properties;
                        if (nextData.properties === previousProperties) {
                            return previous;
                        }
                        return {
                            ...previous,
                            link: {
                                ...previous.link,
                                base: {
                                    ...previous.link.base,
                                    properties: nextData.properties,
                                }
                            }
                        };
                    });
                },
                applyChanges: () => {
                    const toApply = dataFromExtendedLink(value.link);

                    if (editor.temporaryState.links.has(original.data)) {
                        editor.removeTemporaryCells([original]);
                        const linkBase = relationFromExtendedLink(value.link, originalSource, originalTarget);
                        editor.createRelation(linkBase);
                    } else if (!(
                        equalLinks(original.data, toApply) &&
                        equalProperties(original.data.properties, toApply.properties)
                    )) {
                        editor.changeRelation(original.data, toApply);
                    }
                },
            })}
        </RelationEditorContext.Provider>
    );
}

export interface DefaultEditRelationFormProps extends PropertyEditorOptionsRelation {
    resolveInput: (property: PropertyTypeIri, inputProps: InputMultiProps) =>
        React.ReactElement | null;
}

export function DefaultEditRelationForm(props: DefaultEditRelationFormProps) {
    const {target, onChangeTarget, onClose, resolveInput} = props;
    return (
        <RelationEditor relation={target}
            onChangeTarget={onChangeTarget}>
            {providedProps => (
                <EditRelationProperties {...providedProps}
                    resolveInput={resolveInput}
                    onClose={onClose}
                />
            )}
        </RelationEditor>
    );
}

interface EditRelationPropertiesProps extends RelationEditorProvidedProps {
    resolveInput: (property: PropertyTypeIri, inputProps: InputMultiProps) =>
        React.ReactElement | null;
    onClose: () => void;
}

function EditRelationProperties(props: EditRelationPropertiesProps) {
    const {
        status, data: linkData, linkSource, linkTarget,
        updateData, applyChanges, onClose, resolveInput,
    } = props;
    const {editor} = useWorkspace();
    const t = useTranslation();

    const [metadata, metadataError] = useRelationMetadata(
        editor.metadataProvider, linkData, linkSource, linkTarget
    );
    const languages = React.useMemo(
        () => editor.metadataProvider?.getLiteralLanguages() ?? [], []
    );

    const onChangeProperty = (
        property: PropertyTypeIri,
        updater: InputMultiUpdater
    ): void => {
        updateData(previous => {
            const {properties} = previous;
            const values = Object.prototype.hasOwnProperty.call(properties, property)
                ? properties[property] : undefined;
            const nextValues = updater(values ?? []);
            const nextProperties = {...properties, [property]: nextValues};
            if (nextValues.length === 0) {
                delete nextProperties[property];
            }
            return {...previous, properties: nextProperties};
        });
    };

    return (
        <div className={FORM_CLASS}>
            <div className={`reactodia-scrollable ${FORM_CLASS}__body`}>
                <RelationTypeSelector />
                {!metadata ? (
                    <div className={cx(FORM_CLASS, CLASS_NAME, `${CLASS_NAME}--loading`)}>
                        <HtmlSpinner width={30} height={30}
                            errorOccurred={Boolean(metadataError)}
                        />
                    </div>
                ) : metadata.shape ? (
                    <InputGroup className={`${CLASS_NAME}__properties`}
                        languages={languages}
                        extraPropertyShape={metadata.shape.extraProperty}
                        propertyShapes={metadata.shape.properties}
                        propertyValues={linkData.properties}
                        onChangeData={onChangeProperty}
                        resolveInput={resolveInput}
                    />
                ) : null}
            </div>
            <div className={`${FORM_CLASS}__controls`}>
                <button className={`reactodia-btn reactodia-btn-primary ${FORM_CLASS}__apply-button`}
                    onClick={() => {
                        applyChanges();
                        onClose();
                    }}
                    disabled={status !== 'ok'}
                    title={
                        t.textOptional('visual_authoring.edit_relation.dialog.apply.title') ??
                        t.text('visual_authoring.dialog.apply.title')
                    }>
                    {(
                        t.textOptional('visual_authoring.edit_relation.dialog.apply.label') ??
                        t.text('visual_authoring.dialog.apply.label')
                    )}
                </button>
                <button className='reactodia-btn reactodia-btn-secondary'
                    onClick={onClose}
                    title={t.text('visual_authoring.dialog.cancel.title')}>
                    {t.text('visual_authoring.dialog.cancel.label')}
                </button>
            </div>
        </div>
    );
}

/**
 * Component to change relation type and/or its direction from a custom property editor
 * for the {@link VisualAuthoring}.
 *
 * @category Components
 */
export function RelationTypeSelector() {
    const t = useTranslation();
    const context = React.useContext(RelationEditorContext);
    if (!context) {
        throw new Error('Reactodia: cannot use <RelationTypeSelector> outside <RelationEditor>');
    }
    const {value, setValue, validating} = context;
    return (
        <>
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
        </>
    );
}

interface RelationMetadata {
    readonly shape: MetadataRelationShape | null;
}

function useRelationMetadata(
    metadataProvider: MetadataProvider | undefined,
    link: LinkModel,
    linkSource: ElementModel,
    linkTarget: ElementModel
): readonly [shape: RelationMetadata | undefined, error?: unknown] {
    const {data, status, error} = useAsync({
        input: [metadataProvider, link.linkTypeId, linkSource, linkTarget],
        load: ([provider, _typeId, source, target], {signal}) => {
            if (provider) {
                return Promise.all([
                    provider.canModifyRelation(link, source, target, {signal}),
                    provider.getRelationShape(
                        link.linkTypeId,
                        linkSource,
                        linkTarget,
                        {signal}
                    ),
                ]);
            } else {
                return undefined;
            }
        }
    });

    if (data && status === 'completed') {
        const [loadedStatus, loadedShape] = data;
        return [{shape: loadedStatus.canEdit ? loadedShape : null}];
    } else {
        return [undefined, error];
    }
}
