import cx from 'clsx';
import * as React from 'react';

import { useTranslation } from '../../coreUtils/i18n';

import { ElementTypeIri } from '../../data/model';
import { useWorkspace } from '../../workspace/workspaceContext';

import { highlightSubstring } from '../utility/listElementView';

import { TreeNode } from './treeModel';

export interface ClassTreeContext {
    searchText?: string;
    selectedNode?: TreeNode;
    onSelect: (node: TreeNode) => void;
    creatableClasses: ReadonlyMap<ElementTypeIri, boolean>;
    onClickCreate: (node: TreeNode) => void;
    onDragCreate: (node: TreeNode) => void;
    draggableItems: boolean;
}

export const ClassTreeContext = React.createContext<ClassTreeContext | null>(null);

const CLASS_NAME = 'reactodia-class-tree-item';

export function Leaf(props: {
    node: TreeNode;
}) {
    const {node, ...otherProps} = props;
    const {
        selectedNode, searchText, onSelect, creatableClasses, onClickCreate, onDragCreate,
        draggableItems,
    } = useClassTreeContext();

    const {getElementTypeStyle} = useWorkspace();
    const t = useTranslation();

    const [expanded, setExpanded] = React.useState(Boolean(searchText));
    React.useEffect(() => {
        setExpanded(Boolean(searchText));
    }, [searchText]);

    const toggleClass = (
        node.derived.length === 0 ? `${CLASS_NAME}__toggle` :
        expanded ? `${CLASS_NAME}__toggle-expanded` :
        `${CLASS_NAME}__toggle-collapsed`
    );

    const typeStyle = getElementTypeStyle([node.iri]);
    const providedStyle = {
        '--reactodia-element-style-color': typeStyle.color,
    } as React.CSSProperties;

    const selected = Boolean(selectedNode && selectedNode.iri === node.iri);
    const bodyClass = cx(
        `${CLASS_NAME}__body`,
        selected ? `${CLASS_NAME}__body--selected` : undefined
    );

    const label = highlightSubstring(
        node.label, searchText, {className: `${CLASS_NAME}__highlighted-term`}
    );

    const onDragStart = (e: React.DragEvent<any>) => {
        // sets the drag data to support drag-n-drop in Firefox
        // see https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Drag_operations for more details
        // IE supports only 'text' and 'URL' formats, see https://msdn.microsoft.com/en-us/ie/ms536744(v=vs.94)
        e.dataTransfer.setData('text', '');
        onDragCreate(node);
    };

    return (
        <div className={CLASS_NAME}
            style={providedStyle}
            role='treeitem'
            aria-expanded={node.derived.length === 0 ? undefined : expanded}
            aria-selected={selected}>
            <div className={`${CLASS_NAME}__row`}>
                <div className={toggleClass}
                    onClick={() => setExpanded(previous => !previous)}
                    role='button'
                />
                <a className={bodyClass}
                    href={node.iri}
                    onClick={e => {
                        e.preventDefault();
                        onSelect(node);
                    }}
                    draggable={draggableItems}>
                    <div className={`${CLASS_NAME}__icon-container`}>
                        {typeStyle.icon ? (
                            <img role='presentation'
                                className={cx(
                                    `${CLASS_NAME}__icon`,
                                    typeStyle.iconMonochrome ? `${CLASS_NAME}__icon--monochrome` : undefined
                                )}
                                src={typeStyle.icon}
                            />
                        ) : (
                            <div className={node.derived.length === 0
                                ? `${CLASS_NAME}__default-icon-leaf`
                                : `${CLASS_NAME}__default-icon-parent`
                            } />
                        )}
                    </div>
                    <span className={`${CLASS_NAME}__label`}>{label}</span>
                    {node.data?.count ? (
                        <span className={`${CLASS_NAME}__count reactodia-badge`}>
                            {node.data.count}
                        </span>
                    ) : null}
                </a>
                {creatableClasses.get(node.iri) ? (
                    <div role='button'
                        title={t.text('search_element_types.drag_create.title')}
                        className={cx(
                            `${CLASS_NAME}__create-button`,
                            'reactodia-btn reactodia-btn-default'
                        )}
                        draggable={true}
                        onClick={() => onClickCreate(node)}
                        onDragStart={onDragStart}
                    />
                ) : null}
            </div>
            {expanded && node.derived.length > 0 ? (
                <Forest className={`${CLASS_NAME}__children`}
                    nodes={node.derived}
                    {...otherProps}
                />
            ) : null}
        </div>
    );
}

export function Forest(props: {
    className?: string;
    nodes: ReadonlyArray<TreeNode>;
    root?: boolean;
    footer?: React.ReactNode;
}) {
    const {className, nodes, root, footer} = props;
    return (
        <div className={className} role={root ? 'tree' : undefined}>
            {nodes.map(node => (
                <Leaf key={`node-${node.iri}`} node={node} />
            ))}
            {footer}
        </div>
    );
}

function useClassTreeContext(): ClassTreeContext {
    const context = React.useContext(ClassTreeContext);
    if (!context) {
        throw new Error('Reactodia: missing class tree context');
    }
    return context;
}
