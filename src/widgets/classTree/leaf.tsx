import * as React from 'react';
import classnames from 'classnames';

import { ElementTypeIri } from '../../data/model';
import { DiagramView } from '../../diagram/view';
import { highlightSubstring } from '../listElementView';

import { TreeNode } from './treeModel';

const DEFAULT_LEAF_ICON = require('@images/tree/leaf-default.svg');
const DEFAULT_PARENT_ICON = require('@images/tree/leaf-folder.svg');
const CREATE_ICON = require('@codicons/add.svg');

interface CommonProps {
    view: DiagramView;
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

const CLASS_NAME = 'ontodia-class-tree-item';

export class Leaf extends React.Component<LeafProps, State> {
    constructor(props: LeafProps) {
        super(props);
        this.state = {
            expanded: Boolean(this.props.searchText),
        };
    }

    componentWillReceiveProps(nextProps: LeafProps) {
        if (this.props.searchText !== nextProps.searchText) {
            this.setState({
                expanded: Boolean(nextProps.searchText),
            });
        }
    }

    render() {
        const {node, ...otherProps} = this.props;
        const {view, selectedNode, searchText, creatableClasses} = otherProps;
        const {expanded} = this.state;

        const toggleClass = (
            node.derived.length === 0 ? `${CLASS_NAME}__toggle` :
            expanded ? `${CLASS_NAME}__toggle-expanded` :
            `${CLASS_NAME}__toggle-collapsed`
        );

        let {icon} = view.getTypeStyle([node.model.id]);
        if (!icon) {
            icon = node.derived.length === 0 ? DEFAULT_LEAF_ICON : DEFAULT_PARENT_ICON;
        }

        let bodyClass = `${CLASS_NAME}__body`;
        if (selectedNode && selectedNode.model === node.model) {
            bodyClass += ` ${CLASS_NAME}__body--selected`;
        }

        const label = highlightSubstring(
            node.label, searchText, {className: `${CLASS_NAME}__highlighted-term`}
        );

        return (
            <div className={CLASS_NAME} role='tree-item'>
                <div className={`${CLASS_NAME}__row`}>
                    <div className={toggleClass}
                        onClick={this.toggle}
                        role='button'
                    />
                    <a className={bodyClass} href={node.model.id} onClick={this.onClick}>
                        <div className={`${CLASS_NAME}__icon-container`}>
                            <img className={`${CLASS_NAME}__icon`} src={icon} />
                        </div>
                        <span className={`${CLASS_NAME}__label`}>{label}</span>
                        {node.model.count ? (
                            <span className={`${CLASS_NAME}__count ontodia-badge`}>
                                {node.model.count}
                            </span>
                        ) : null}
                    </a>
                    {creatableClasses.get(node.model.id) ? (
                        <button title={'Click or drag to create new entity of this type'}
                            className={classnames(
                                `${CLASS_NAME}__create-button`,
                                'ontodia-btn ontodia-btn-default'
                            )}
                            draggable={true}
                            onClick={this.onClickCreate}
                            onDragStart={this.onDragCreate}>
                            <img src={CREATE_ICON} />
                        </button>
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

    private onClick = (e: React.MouseEvent<{}>) => {
        e.preventDefault();
        const {node, onSelect} = this.props;
        onSelect(node);
    }

    private toggle = () => {
        this.setState((state): State => ({expanded: !state.expanded}));
    }

    private onClickCreate = () => {
        this.props.onClickCreate(this.props.node);
    }

    private onDragCreate = (e: React.DragEvent<any>) => {
        // sets the drag data to support drag-n-drop in Firefox
        // see https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Drag_operations for more details
        // IE supports only 'text' and 'URL' formats, see https://msdn.microsoft.com/en-us/ie/ms536744(v=vs.94)
        e.dataTransfer.setData('text', '');

        this.props.onDragCreate(this.props.node);
    }
}

export interface ForestProps extends CommonProps {
    className?: string;
    nodes: ReadonlyArray<TreeNode>;
}

export class Forest extends React.Component<ForestProps, {}> {
    render() {
        const {nodes, className, ...otherProps} = this.props;
        return (
            <div className={className} role='tree'>
                {nodes.map(node => (
                    <Leaf key={`node-${node.model.id}`} node={node} {...otherProps} />
                ))}
            </div>
        );
    }
}
