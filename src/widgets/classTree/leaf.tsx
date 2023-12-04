import * as React from 'react';
import classnames from 'classnames';

import { ElementTypeIri } from '../../data/model';
import { WorkspaceContext } from '../../workspace/workspaceContext';

import { highlightSubstring } from '../listElementView';

import { TreeNode } from './treeModel';

interface CommonProps {
    searchText?: string;
    selectedNode?: TreeNode;
    onSelect: (node: TreeNode) => void;
    creatableClasses: ReadonlyMap<ElementTypeIri, boolean>;
    onClickCreate: (node: TreeNode) => void;
    onDragCreate: (node: TreeNode) => void;
}

export interface LeafProps extends CommonProps {
    node: TreeNode;
}

interface State {
    expanded?: boolean;
}

const CLASS_NAME = 'reactodia-class-tree-item';

export class Leaf extends React.Component<LeafProps, State> {
    static contextType = WorkspaceContext;
    declare readonly context: WorkspaceContext;

    constructor(props: LeafProps, context: any) {
        super(props, context);
        this.state = {
            expanded: Boolean(this.props.searchText),
        };
    }

    componentDidUpdate(prevProps: LeafProps) {
        if (this.props.searchText !== prevProps.searchText) {
            this.setState({
                expanded: Boolean(this.props.searchText),
            });
        }
    }

    render() {
        const {getElementTypeStyle} = this.context;
        const {node, ...otherProps} = this.props;
        const {selectedNode, searchText, creatableClasses} = otherProps;
        const {expanded} = this.state;

        const toggleClass = (
            node.derived.length === 0 ? `${CLASS_NAME}__toggle` :
            expanded ? `${CLASS_NAME}__toggle-expanded` :
            `${CLASS_NAME}__toggle-collapsed`
        );

        const {icon} = getElementTypeStyle([node.model.id]);

        const selected = Boolean(selectedNode && selectedNode.model === node.model);
        const bodyClass = classnames(
            `${CLASS_NAME}__body`,
            selected ? `${CLASS_NAME}__body--selected` : undefined
        );

        const label = highlightSubstring(
            node.label, searchText, {className: `${CLASS_NAME}__highlighted-term`}
        );

        return (
            <div className={CLASS_NAME}
                role='treeitem'
                aria-expanded={expanded}
                aria-selected={selected}>
                <div className={`${CLASS_NAME}__row`}>
                    <div className={toggleClass}
                        onClick={this.toggle}
                        role='button'
                    />
                    <a className={bodyClass} href={node.model.id} onClick={this.onClick}>
                        <div className={`${CLASS_NAME}__icon-container`}>
                            {icon ? (
                                <img role='presentation'
                                    className={`${CLASS_NAME}__icon`}
                                    src={icon}
                                />
                            ) : (
                                <div className={node.derived.length === 0
                                    ? `${CLASS_NAME}__default-icon-leaf`
                                    : `${CLASS_NAME}__default-icon-parent`
                                } />
                            )}
                        </div>
                        <span className={`${CLASS_NAME}__label`}>{label}</span>
                        {node.model.count ? (
                            <span className={`${CLASS_NAME}__count reactodia-badge`}>
                                {node.model.count}
                            </span>
                        ) : null}
                    </a>
                    {creatableClasses.get(node.model.id) ? (
                        <div role='button'
                            title={'Click or drag to create new entity of this type'}
                            className={classnames(
                                `${CLASS_NAME}__create-button`,
                                'reactodia-btn reactodia-btn-default'
                            )}
                            draggable={true}
                            onClick={this.onClickCreate}
                            onDragStart={this.onDragCreate}
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

    private onClick = (e: React.MouseEvent) => {
        e.preventDefault();
        const {node, onSelect} = this.props;
        onSelect(node);
    };

    private toggle = () => {
        this.setState((state): State => ({expanded: !state.expanded}));
    };

    private onClickCreate = () => {
        this.props.onClickCreate(this.props.node);
    };

    private onDragCreate = (e: React.DragEvent<any>) => {
        // sets the drag data to support drag-n-drop in Firefox
        // see https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Drag_operations for more details
        // IE supports only 'text' and 'URL' formats, see https://msdn.microsoft.com/en-us/ie/ms536744(v=vs.94)
        e.dataTransfer.setData('text', '');

        this.props.onDragCreate(this.props.node);
    };
}

export interface ForestProps extends CommonProps {
    className?: string;
    nodes: ReadonlyArray<TreeNode>;
    root?: boolean;
}

export class Forest extends React.Component<ForestProps> {
    render() {
        const {className, nodes, root, ...otherProps} = this.props;
        return (
            <div className={className} role={root ? 'tree' : undefined}>
                {nodes.map(node => (
                    <Leaf key={`node-${node.model.id}`} node={node} {...otherProps} />
                ))}
            </div>
        );
    }
}
