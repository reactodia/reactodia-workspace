import * as React from 'react';
import cx from 'clsx';

import { TranslatedText, useTranslation } from '../coreUtils/i18n';

import type { PropertyTypeIri } from '../data/model';
import {
    TemplateState, TemplateProperties, type AnnotationContent, type AnnotationTextStyle,
    type ColorVariant, DefaultColorVariants,
} from '../data/schema';

import { useCanvas } from '../diagram/canvasApi';
import { setElementState } from '../diagram/commands';
import type {
    ElementTemplate, LinkTemplate, TemplateProps,
} from '../diagram/customization';
import { ElementDecoration } from '../diagram/elementLayer';
import { Rect, Size, boundsOf } from '../diagram/geometry';
import { Command } from '../diagram/history';
import { LinkLabel, type LinkLabelProps } from '../diagram/linkLayer';

import { AnnotationElement, AnnotationLink } from '../editor/annotationCells';
import { EntityElement } from '../editor/dataElements';

import { ContentEditablePlaintext } from '../widgets/utility/contentEditablePlaintext';
import { useAuthoredEntity } from '../widgets/visualAuthoring/authoredEntity';

import { useWorkspace } from '../workspace/workspaceContext';

import { BasicLink, type BasicLinkProps } from './basicLink';

/**
 * Element template to display an {@link AnnotationElement} on a canvas.
 *
 * Uses {@link NoteAnnotation} component to render an annotation element.
 *
 * @category Constants
 */
export const NoteTemplate: ElementTemplate = {
    renderElement: props => {
        if (props.element instanceof AnnotationElement) {
            return <NoteAnnotation {...props} />;
        } else if (props.element instanceof EntityElement) {
            return <NoteEntity {...props} />;
        }
        return null;
    },
    supports: {
        [TemplateProperties.ColorVariant]: true,
        [TemplateProperties.ElementSize]: true,
    },
};

/**
 * Props for {@link NoteAnnotation} component.
 *
 * @see {@link NoteAnnotation}
 */
export interface NoteAnnotationProps extends TemplateProps {}

/**
 * Displays an {@link AnnotationElement} in a form of a editable plaintext note.
 *
 * The template supports displaying any element but always store its content
 * in the {@link Element.elementState element state}.
 *
 * The template supports the following template state:
 *   - {@link TemplateProperties.ElementSize}
 *   - {@link TemplateProperties.AnnotationText}
 *
 * @category Components
 * @see {@link NoteTemplate}
 */
export function NoteAnnotation(props: NoteAnnotationProps) {
    const {element, elementState} = props;
    const {model} = useCanvas();
    const content = elementState.get(TemplateProperties.AnnotationContent);
    return (
        <NoteAnnotationView {...props}
            content={content}
            setContent={changedContent => {
                model.history.execute(Command.compound(
                    TranslatedText.text('note_annotation.change_text.command'),
                    [
                        setElementState(
                            element,
                            element.elementState.set(
                                TemplateProperties.AnnotationContent,
                                changedContent
                            )
                        )
                    ],
                ));
            }}
        />
    );
}

/**
 * Props for {@link NoteEntity} component.
 *
 * @see {@link NoteEntity}
 */
export interface NoteEntityProps extends TemplateProps {
    /**
     * @default "http://www.w3.org/ns/oa#bodyValue"
     */
    textProperty?: PropertyTypeIri;
}

/**
 * Displays an {@link EntityElement} in a form of a editable plaintext note.
 *
 * The template supports displaying any element but will be empty
 * for any element cell type other than {@link EntityElement}.
 *
 * The property IRI for note content can be configured with
 * {@link NoteEntityProps.textProperty}; by default it uses
 * `oa:bodyValue` from [Web Annotation Ontology](https://www.w3.org/ns/oa).
 *
 * The template supports the following template state:
 *   - {@link TemplateProperties.ElementSize}
 *
 * @category Components
 * @see {@link NoteTemplate}
 */
export function NoteEntity(props: NoteEntityProps) {
    const {
        element,
        textProperty = 'http://www.w3.org/ns/oa#bodyValue',
    } = props;

    const {model, editor, translation: t} = useWorkspace();

    const data = element instanceof EntityElement ? element.data : undefined;
    const entityContext = useAuthoredEntity(data, true);

    const content = React.useMemo((): AnnotationContent | undefined => {
        const values = data?.properties[textProperty];
        if (values && values.length > 0) {
            const texts = t.selectValues(values, model.language);
            const text = texts.filter(v => v.termType === 'Literal').map(v => v.value).join('\n');
            return {type: 'plaintext', text};
        } else {
            return undefined;
        }
    }, [data]);

    return (
        <NoteAnnotationView {...props}
            readOnly={entityContext.canEdit !== true}
            content={content}
            setContent={changedContent => {
                if (data) {
                    editor.changeEntity(data.id, {
                        ...data,
                        properties: {
                            ...data.properties,
                            [textProperty]: [model.factory.literal(changedContent.text)],
                        }
                    });
                }
            }}
        />
    );
}

interface NoteAnnotationViewProps extends TemplateProps {
    readOnly?: boolean;
    content: AnnotationContent | undefined;
    setContent: (changedContent: AnnotationContent) => void;
}

const CLASS_NAME = 'reactodia-note-annotation';

function NoteAnnotationView(props: NoteAnnotationViewProps) {
    const {element, elementState, onlySelected, readOnly, content, setContent} = props;
    const {canvas, model} = useCanvas();
    
    const [isEditing, setEditing] = React.useState(false);

    const size = elementState.get(TemplateProperties.ElementSize);
    const colorVariant = elementState.get(TemplateProperties.ColorVariant);
    const plaintext = (content?.type === 'plaintext' ? content : undefined) ?? {
        type: 'plaintext',
        text: '',
    };

    return (
        <>
            <div 
                className={cx(
                    CLASS_NAME,
                    `${CLASS_NAME}--variant-${colorVariant ?? 'default'}`,
                    isEditing ? `${CLASS_NAME}--editing` : undefined
                )}
                style={{width: size?.width, height: size?.height}}
                onDoubleClick={async e => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (readOnly) {
                        return;
                    }
                    if (canvas.getScale() < 1) {
                        await canvas.centerTo(
                            Rect.center(boundsOf(element, canvas.renderingState)),
                            {scale: 1, animate: true}
                        );
                    }
                    setEditing(true);
                }}>
                <ContentEditablePlaintext
                    className={`${CLASS_NAME}__editor`}
                    style={plaintext.style}
                    text={plaintext.text}
                    setText={changedText => {
                        // Delay executing command to change text to avoid putting it into
                        // "Move elements and links" batch from PaperArea due to click on canvas
                        requestAnimationFrame(() => setContent({...plaintext, text: changedText}));
                    }}
                    isEditing={isEditing}
                    setEditing={setEditing}
                />
            </div>
            {onlySelected && (
                <ElementDecoration target={element}>
                    <NoteStyleControls
                        style={plaintext.style}
                        setStyle={changedStyle => {
                            setContent({...plaintext, style: changedStyle});
                        }}
                        variant={colorVariant}
                        setVariant={changedVariant => {
                            model.history.execute(setElementState(
                                element,
                                element.elementState.set(
                                    TemplateProperties.ColorVariant,
                                    changedVariant
                                )
                            ));
                        }}
                    />
                </ElementDecoration>
            )}
        </>
    );
}

function NoteStyleControls(props: {
    style: AnnotationTextStyle | undefined;
    setStyle: (changedStyle: AnnotationTextStyle) => void;
    variant: ColorVariant | undefined;
    setVariant: (changedVariant: ColorVariant | undefined) => void;
}) {
    const {style, setStyle, variant: selectedVariant = 'default', setVariant} = props;
    const t = useTranslation();
    const {
        fontStyle,
        fontWeight,
        textDecorationLine,
        textAlign = 'center',
    } = style ?? {};
    const preventPropagation = (e: React.MouseEvent) => e.stopPropagation();
    const buttonProps = {
        type: 'button',
        onPointerDown: preventPropagation,
    } as const satisfies React.HTMLProps<HTMLButtonElement>;
    return (
        <div className={`${CLASS_NAME}__controls`}>
            <div className='reactodia-btn-group reactodia-btn-group-xs'>
                <button {...buttonProps}
                    className={cx(
                        `${CLASS_NAME}__style-bold reactodia-btn reactodia-btn-default`,
                        fontWeight === 'bold' ? 'active' : undefined
                    )}
                    title={t.text('note_annotation.style_bold.title')}
                    onClick={() => setStyle({
                        ...style,
                        fontWeight: fontWeight === 'bold' ? undefined : 'bold',
                    })}
                />
                <button {...buttonProps}
                    className={cx(
                        `${CLASS_NAME}__style-italic reactodia-btn reactodia-btn-default`,
                        fontStyle === 'italic' ? 'active' : undefined
                    )}
                    title={t.text('note_annotation.style_italic.title')}
                    onClick={() => setStyle({
                        ...style,
                        fontStyle: fontStyle === 'italic' ? undefined : 'italic',
                    })}
                />
                <button {...buttonProps}
                    className={cx(
                        `${CLASS_NAME}__style-underline reactodia-btn reactodia-btn-default`,
                        textDecorationLine === 'underline' ? 'active' : undefined
                    )}
                    title={t.text('note_annotation.style_underline.title')}
                    onClick={() => setStyle({
                        ...style,
                        textDecorationLine: textDecorationLine === 'underline' ? undefined : 'underline',
                    })}
                />
                <button {...buttonProps}
                    className={cx(
                        `${CLASS_NAME}__style-strikethrough reactodia-btn reactodia-btn-default`,
                        textDecorationLine === 'line-through' ? 'active' : undefined
                    )}
                    title={t.text('note_annotation.style_strikethrough.title')}
                    onClick={() => setStyle({
                        ...style,
                        textDecorationLine: textDecorationLine === 'line-through' ? undefined : 'line-through',
                    })}
                />
            </div>
            <div className='reactodia-btn-group reactodia-btn-group-xs'>
                <button {...buttonProps}
                    className={cx(
                        `${CLASS_NAME}__align-left reactodia-btn reactodia-btn-default`,
                        textAlign === 'left' ? 'active' : undefined
                    )}
                    title={t.text('note_annotation.style_align_left.title')}
                    onClick={() => setStyle({...style, textAlign: 'left'})}
                />
                <button {...buttonProps}
                    className={cx(
                        `${CLASS_NAME}__align-center reactodia-btn reactodia-btn-default`,
                        textAlign === 'center' ? 'active' : undefined
                    )}
                    title={t.text('note_annotation.style_align_center.title')}
                    onClick={() => setStyle({...style, textAlign: undefined})}
                />
                <button {...buttonProps}
                    className={cx(
                        `${CLASS_NAME}__align-right reactodia-btn reactodia-btn-default`,
                        textAlign === 'right' ? 'active' : undefined
                    )}
                    title={t.text('note_annotation.style_align_right.title')}
                    onClick={() => setStyle({...style, textAlign: 'right'})}
                />
            </div>
            <div className='reactodia-btn-group reactodia-btn-group-xs'>
                {DefaultColorVariants.map(variant =>
                    <button {...buttonProps}
                        key={variant}
                        className={cx(
                            `${CLASS_NAME}__variant-${variant} reactodia-btn reactodia-btn-default`,
                            selectedVariant === variant ? 'active' : undefined
                        )}
                        title={t.text('note_annotation.style_color_variant.title', {variant})}
                        onClick={() => setVariant(variant === 'default' ? undefined : variant)}>
                        <div className={`${CLASS_NAME}__variant ${CLASS_NAME}--variant-${variant}`} />
                    </button>
                )}
            </div>
        </div>
    );
}

export const NoteLinkTemplate: LinkTemplate = {
    markerTarget: {
        fill: 'var(--reactodia-canvas-background-color)',
        stroke: 'var(--reactodia-color-emphasis-500)',
        strokeWidth: 2,
        d: 'M 7 2 a 5 5 0 1 0 0.0001 0 Z',
        width: 14,
        height: 14,
    },
    renderLink: props => {
        if (props.link instanceof AnnotationLink) {
            return <NoteLink {...props} />;
        }
        return null;
    },
};

const LINK_CLASS = 'reactodia-note-link';

/**
 * Props for {@link NoteLink} component.
 *
 * @see {@link NoteLink}
 */
export interface NoteLinkProps extends BasicLinkProps {
    /**
     * Props for the primary link label.
     *
     * By default the label is not shown unless
     * {@link LinkLabelProps.children} is specified or
     * the link is renamed with {@link RenameLinkProvider}.
     *
     * @see {@link LinkLabelProps.primary}
     */
    primaryLabelProps?: NoteLinkLabelStyle;
}

/**
 * Additional style props for the link labels in {@link StandardRelation}.
 *
 * @see {@link StandardRelationProps}
 */
type NoteLinkLabelStyle =
    Omit<LinkLabelProps, 'primary' | 'link' | 'position'> &
    Partial<Pick<LinkLabelProps, 'position'>>;

/**
 * Displays a link for an {@link AnnotationLink} on the canvas.
 *
 * {@link RenameLinkProvider} can be used to display a custom label which will
 * override a default one from {@link NoteLinkProps.primaryLabelProps}.
 *
 * @category Components
 * @see {@link NoteTemplate}
 */
export function NoteLink(props: NoteLinkProps) {
    const {link, getPathPosition, route, primaryLabelProps} = props;
    const {canvas} = useCanvas();
    const {renameLinkProvider} = canvas.renderingState.shared;
    const label = renameLinkProvider?.getLabel(link);
    const labelContent = label ?? primaryLabelProps?.children
        ?? (renameLinkProvider?.canRename(link) ? '' : undefined);
    return (
        <BasicLink {...props}
            pathProps={{
                className: `${LINK_CLASS}__path`,
            }}>
            {labelContent === undefined ? null : (
                <LinkLabel {...primaryLabelProps}
                    primary
                    textAnchor={route?.labelTextAnchor ?? primaryLabelProps?.textAnchor}
                    className={cx(`${LINK_CLASS}__label`, primaryLabelProps?.className)}
                    link={link}
                    position={primaryLabelProps?.position ?? getPathPosition(0.5)}>
                    <span>{labelContent}</span>
                </LinkLabel>
            )}
        </BasicLink>
    );
}
