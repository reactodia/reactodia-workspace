import * as React from 'react';
import classnames from 'classnames';
import { hcl } from 'd3-color';

import { ElementModel } from '../data/model';

import { useWorkspace } from '../workspace/workspaceContext';

export interface ListElementViewProps {
    element: ElementModel;
    className?: string;
    highlightText?: string;
    disabled?: boolean;
    selected?: boolean;
    onClick?: (event: React.MouseEvent<any>, model: ElementModel) => void;
    onDragStart?: React.HTMLProps<HTMLElement>['onDragStart'];
}

const CLASS_NAME = 'reactodia-list-element-view';

export function ListElementView(props: ListElementViewProps) {
    const {model, getElementTypeStyle} = useWorkspace();
    const {
        element, className, highlightText, disabled, selected, onClick, onDragStart,
    } = props;

    const {h, c, l} = hcl(getElementTypeStyle(element.types).color);
    const frontColor = (selected && !disabled) ? hcl(h, c, l * 1.2) : hcl('white');

    const combinedClass = classnames(
        CLASS_NAME,
        disabled ? `${CLASS_NAME}--disabled` : undefined,
        className
    );

    const localizedText = model.locale.formatLabel(element.label, element.id);

    let typeString = '';
    if (element.types.length > 0) {
        typeString = `\nClasses: ${model.locale.formatElementTypes(element.types).join(', ')}`;
    }

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
            title={`${localizedText} ${model.locale.formatIri(element.id)}${typeString}`}
            style={{background: hcl(h, c, l).toString()}}
            onClick={onItemClick}
            onDragStart={onDragStart}>
            <div className={`${CLASS_NAME}__label`} style={{background: frontColor.toString()}}>
                {highlightSubstring(localizedText, highlightText)}
            </div>
        </li>
    );
}

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
