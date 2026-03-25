import * as React from 'react';
import cx from 'clsx';

import { useObservedProperty } from '../../coreUtils/hooks';
import { useTranslation } from '../../coreUtils/i18n';
import { useKeyedSyncStore } from '../../coreUtils/keyedObserver';

import type { ElementIri, PropertyTypeIri, ElementModel } from '../../data/model';
import type * as Rdf from '../../data/rdf/rdfModel';
import { schema } from '../../data/rdf/vocabulary';

import { HtmlSpinner } from '../../diagram/spinner';
import { useResolvedAssetUrl } from '../../editor/dataLocaleProvider';
import { subscribePropertyTypes } from '../../editor/observedElement';
import { useWorkspace } from '../../workspace/workspaceContext';

import type { FileUploadProvider, UploadedFile } from '../fileUploadProvider';
import { DropZone, useDisallowDropOutsideZone } from './dropZone';
import type { InputMultiProps } from './inputCommon';

/**
 * Props for {@link InputFile} component.
 *
 * @see {@link InputFile}
 */
export interface InputFileProps extends InputMultiProps {
    /**
     * Provides the strategy to upload files from this input.
     */
    uploader: FileUploadProvider;
    /**
     * Accepted [file types](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/accept)
     * for the file selection.
     *
     * **Example**: `.jpg,.jpeg,.png,.svg,.gif`
     */
    fileAccept?: string;
    /**
     * Handler to check whether it is allowed to drop files into the input.
     */
    allowDrop?: (item: DataTransferItem) => boolean;
    /**
     * File metadata for files that cannot be resolved from the `uploader` provider.
     *
     * This metadata is required to be able to display info about existing files,
     * i.e. files from the dataset.
     *
     * For example, {@link useEntityData()} can be used to resolve metadata
     * from a {@link DataProvider} this way:
     * ```js
     * const {data: fileMetadata} = Reactodia.useEntityData(
     *     model.dataProvider,
     *     props.values.filter(v => v.termType === 'NamedNode').map(v => v.value)
     * );
     * ```
     */
    fileMetadata?: ReadonlyMap<ElementIri, ElementModel>;
    /**
     * Handler to determine category for a file.
     *
     * By default, {@link defaultFileCategory} is used.
     */
    getFileCategory?: (fileIri: string, metadata: ElementModel | undefined) => InputFileCategory;
}

/**
 * File category which determines how to present the file in the UI.
 */
export type InputFileCategory = 'default' | 'image';

const CLASS_NAME = 'reactodia-property-input-file';

/**
 * Form input to upload files and display previously uploaded files.
 *
 * **Unstable**: this component will likely change in the future.
 *
 * @category Components
 */
export function InputFile(props: InputFileProps) {
    const {
        fileAccept, allowDrop, fileMetadata, uploader, getFileCategory = defaultFileCategory,
        shape, factory, values, updateValues,
    } = props;
    const t = useTranslation();

    const inputRef = React.useRef<HTMLInputElement | null>(null);
    useDisallowDropOutsideZone(window);

    const [operation, setOperation] = React.useState<AbortController>();
    const onSelect = async (allFiles: File[]) => {
        const allowedCount = (shape.maxCount ?? Infinity) - values.length;
        if (allowedCount <= 0) {
            return;
        }

        const files = Number.isFinite(allowedCount) ? allFiles.slice(0, shape.maxCount) : allFiles;

        const controller = new AbortController();
        setOperation(controller);
        let uploaded: UploadedFile[];
        try {
            uploaded = await Promise.all(files.map(file =>
                uploader.uploadFile(file, { signal: controller.signal }),
            ));
        } finally {
            controller.abort();
            setOperation(undefined);
        }

        const uploadedUrls = uploaded.map(file => factory.namedNode(file.metadata.id));
        updateValues(previousValues => {
            return [...previousValues, ...uploadedUrls];
        });
    };

    const onRemove = (value: Rdf.NamedNode | Rdf.Literal) => {
        updateValues(previous => previous.filter(v => !v.equals(value)));
    };

    const displayedProperties: readonly PropertyTypeIri[] = [
        schema.encodingFormat,
        schema.fileSize
    ];

    return (
        <DropZone className={CLASS_NAME}
            allowDrop={allowDrop}
            onSelect={onSelect}>
            {values.map((v, i) => {
                const data = uploader.getFileMetadata(v.value) ?? fileMetadata?.get(v.value);
                return (
                    <FileItem key={i}
                        iri={v.value}
                        data={data}
                        category={getFileCategory(v.value, data)}
                        displayedProperties={displayedProperties}
                        onRemove={() => onRemove(v)}
                    />
                );
            })}
            {operation ? (
                <div className={`${CLASS_NAME}__spinner`}>
                    <HtmlSpinner width={50} height={50} />
                </div>
            ) : !shape.maxCount || values.length < shape.maxCount ? (
                <div className={`${CLASS_NAME}__placeholder`}>
                    <div className={`${CLASS_NAME}__hint`}>
                        {t.text('forms.input_file.drag_hint')}
                    </div>
                    <button type='button'
                        className={cx(
                            `${CLASS_NAME}__select-file`,
                            'reactodia-btn',
                            'reactodia-btn-default'
                        )}
                        onClick={() => inputRef.current?.click()}>
                        {t.text('forms.input_file.select_files.label')}
                    </button>
                </div>
            ) : null}
            <input ref={inputRef}
                type='file'
                className={`${CLASS_NAME}__input`}
                accept={fileAccept}
                onChange={e => {
                    if (e.currentTarget.files && e.currentTarget.files.length > 0) {
                        void onSelect(Array.from(e.currentTarget.files));
                    }
                }}
            />
        </DropZone>
    );
}

function FileItem(props: {
    iri: string;
    data: ElementModel | undefined;
    category?: InputFileCategory;
    displayedProperties: readonly PropertyTypeIri[];
    onRemove: () => void;
}) {
    const {iri, data, category, displayedProperties, onRemove} = props;
    const {model} = useWorkspace();
    const t = useTranslation();

    useKeyedSyncStore(
        subscribePropertyTypes,
        displayedProperties.filter(property => data && Object.hasOwn(data.properties, property)),
        model
    );
    const language = useObservedProperty(model.events, 'changeLanguage', () => model.language);
    const {data: assetUrl} = useResolvedAssetUrl(model.locale, iri);

    const title = model.locale.formatIri(iri);
    return (
        <div className={`${CLASS_NAME}__item`} title={title}>
            {category === 'image'
                ? <img className={`${CLASS_NAME}__item-image`} src={assetUrl} alt={title} />
                : <div className={`${CLASS_NAME}__item-file`} role="none" />}
            <div className={`${CLASS_NAME}__item-properties`}>
                <div className={`${CLASS_NAME}__item-label`}>
                    {data
                        ? model.locale.formatEntityLabel(data, model.language)
                        : t.formatLabel([], iri, model.language)}
                </div>
                {displayedProperties.map(propertyIri => {
                    if (data && Object.hasOwn(data.properties, propertyIri)) {
                        const property = model.getPropertyType(propertyIri);
                        const values = data.properties[propertyIri];
                        return (
                            <div className={`${CLASS_NAME}__item-property`} key={propertyIri}>
                                <span>
                                    {t.formatLabel(property?.data?.label, propertyIri, language)}
                                </span>
                                {': '}
                                {values.length === 0 ? <span>&mdash;</span> : null}
                                {values.map(v => v.value).join(', ')}
                            </div>
                        );
                    }
                    return null;
                })}
            </div>
            <button type='button'
                className={cx(
                    'reactodia-btn',
                    'reactodia-btn-default',
                    `${CLASS_NAME}__item-remove`,
                )}
                title={t.text('forms.input_file.remove_value.title')}
                onClick={onRemove}
            />
        </div>
    );
}

export function defaultFileCategory(url: string, metadata?: ElementModel): InputFileCategory {
    if (/.\.(?:jpg|jpeg|png|svg|gif)$/.test(url)) {
        return 'image';
    } else if (
        metadata?.properties &&
        Object.hasOwn(metadata.properties, schema.encodingFormat) &&
        metadata.properties[schema.encodingFormat].some(v => /^image\//.test(v.value))
    ) {
        return 'image';
    }
    return 'default';
}
