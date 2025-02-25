import * as React from 'react';
import classnames from 'classnames';
import { hcl } from 'd3-color';

import { useKeyedSyncStore } from '../../coreUtils/keyedObserver';

import { ElementModel } from '../../data/model';

import { subscribeElementTypes } from '../../editor/observedElement';

import { type WorkspaceContext, useWorkspace } from '../../workspace/workspaceContext';

/**
 * Props for {@link ListElementView} component.
 *
 * @see {@link ListElementView}
 */
export interface ListElementViewProps {
    /**
     * Entity data to display.
     */
    element: ElementModel;
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Text sub-string to highlight in the displayed entity.
     */
    highlightText?: string;
    /**
     * Whether to disable item selection and ability to drag and drop it.
     */
    disabled?: boolean;
    /**
     * Whether the list item is selected.
     */
    selected?: boolean;
    /**
     * Handler for a click on the list item.
     */
    onClick?: (event: React.MouseEvent<any>, model: ElementModel) => void;
    /**
     * Handler for a drag start event of the list item.
     */
    onDragStart?: React.HTMLProps<HTMLElement>['onDragStart'];
}

const CLASS_NAME = 'reactodia-list-element-view';

/**
 * Utility component to display an entity as a draggable list item.
 *
 * @category Components
 */
export function ListElementView(props: ListElementViewProps) {
    const workspace = useWorkspace();
    const {model, translation: t, getElementTypeStyle} = workspace;
    const {
        element, className, highlightText, disabled, selected, onClick, onDragStart,
    } = props;

    useKeyedSyncStore(subscribeElementTypes, element.types, model);

    const {color: elementColor} = getElementTypeStyle(element.types);
    const {h, c, l} = hcl(elementColor);
    const frontColor = (selected && !disabled) ? hcl(h, c, l * 1.2).toString() : undefined;

    const combinedClass = classnames(
        CLASS_NAME,
        selected ? `${CLASS_NAME}--selected` : undefined,
        disabled ? `${CLASS_NAME}--disabled` : undefined,
        className
    );
    const providedStyle = {
        '--reactodia-element-style-color': elementColor,
    } as React.CSSProperties;

    const localizedText = t.formatLabel(element.label, element.id, model.language);

    const onItemClick = (event: React.MouseEvent<any>) => {
        if (!disabled && onClick) {
            event.persist();
            onClick(event, element);
        }
    };

    return (
        <li className={combinedClass}
            role='option'
            draggable={!disabled && Boolean(onDragStart)}
            title={formatEntityTitle(element, workspace)}
            style={providedStyle}
            onClick={onItemClick}
            onDragStart={onDragStart}>
            <div className={`${CLASS_NAME}__label`}
                style={{background: frontColor}}>
                {highlightSubstring(localizedText, highlightText)}
            </div>
        </li>
    );
}

/**
 * Configure [DragEvent](https://developer.mozilla.org/en-US/docs/Web/API/DragEvent) data to
 * contain a list of entity IRIs.
 *
 * The data uses `application/x-reactodia-elements` format with a `text` format fallback.
 *
 * A list of entity IRIs is represented as serialized JSON array of IRI strings.
 *
 * When the configured drag data is dropped on the diagram canvas, corresponding
 * entities will be added to it.
 *
 * @category Utilities
 */
export function startDragElements(e: React.DragEvent<unknown>, iris: ReadonlyArray<string>) {
    try {
        e.dataTransfer.setData('application/x-reactodia-elements', JSON.stringify(iris));
    } catch (ex) { // IE fix
        e.dataTransfer.setData('text', JSON.stringify(iris));
    }
    return false;
}

const DEFAULT_HIGHLIGHT_PROPS: React.HTMLProps<HTMLSpanElement> = {
    className: 'reactodia-text-highlight'
};

/**
 * Renders a text span with all occurrences of the specified sub-string
 * highlighted.
 * 
 * @param text source text to display
 * @param substring sub-string to highlight each instance of inside the `text`
 * @param highlightProps props to pass to each `<span>` for a sub-string occurrence
 *
 * @category Utilities
 */
export function highlightSubstring(
    text: string,
    substring: string | undefined,
    highlightProps = DEFAULT_HIGHLIGHT_PROPS,
) {
    if (!substring) {
        return <span>{text}</span>;
    }

    const start = text.toLowerCase().indexOf(substring.toLowerCase());
    if (start < 0) {
        return <span>{text}</span>;
    }

    const end = start + substring.length;
    const before = text.substring(0, start);
    const highlighted = text.substring(start, end);
    const after = text.substring(end);

    return <span>{before}<span {...highlightProps}>{highlighted}</span>{after}</span>;
}

export function formatEntityTitle(entity: ElementModel, workspace: WorkspaceContext): string {
    const {model, translation: t} = workspace;

    const label = t.formatLabel(entity.label, entity.id, model.language);
    const entityIri = t.formatIri(entity.id);
    const entityTypes = formatEntityTypeList(entity, workspace);

    const title = t.text('inline_entity.title', {entity: label, entityIri, entityTypes});
    const titleExtra = t.text('inline_entity.title_extra', {entity: label, entityIri, entityTypes});

    return `${title}${titleExtra ? `\n${titleExtra}` : ''}`;
}

/**
 * Formats an entity types into a sorted labels list to display in the UI.
 */
export function formatEntityTypeList(entity: ElementModel, workspace: WorkspaceContext): string {
    const {model, translation: t} = workspace;
    const labelList = entity.types.map(iri => {
        const labels = model.getElementType(iri)?.data?.label;
        return t.formatLabel(labels, iri, model.language);
    });
    labelList.sort();
    return labelList.join(', ');
}
