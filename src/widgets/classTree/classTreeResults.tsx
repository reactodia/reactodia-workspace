import cx from 'clsx';
import * as React from 'react';

import { useTranslation } from '../../coreUtils/i18n';

import { ElementTypeIri, ElementTypeModel } from '../../data/model';
import { useWorkspace } from '../../workspace/workspaceContext';

import { highlightSubstring } from '../utility/listElementView';
import {
    TreeList, type TreeListModel, type TreeListRenderItem, type TreeListFocusProps,
    TreeListState, type TreeListUpPath, treeListPathToDown,
} from '../utility/treeList';

export interface ClassTreeResultsProps extends ClassTreeProvidedContext {
    nodes: ReadonlyArray<TreeNode>;
    selection: ClassTreeSelection | undefined;
    onSelect: (selection: ClassTreeSelection) => void;
}

export interface ClassTreeProvidedContext {
    readonly searchText?: string;
    readonly creatableClasses: ReadonlyMap<ElementTypeIri, boolean>;
    readonly onClickCreate: (node: TreeNode) => void;
    readonly onDragCreate: (node: TreeNode) => void;
    readonly draggableItems: boolean;
}

export interface ClassTreeSelection {
    readonly node: TreeNode;
    readonly selection: TreeListState<TreeNode>;
}

interface ClassTreeContext extends ClassTreeProvidedContext {
    readonly onExpand: (path: TreeListUpPath) => void;
    readonly onSelect: (node: TreeNode, path: TreeListUpPath) => void;
}

const ClassTreeContext = React.createContext<ClassTreeContext | null>(null);

const CLASS_NAME = 'reactodia-class-tree-item';

export function ClassTreeResults(props: ClassTreeResultsProps) {
    const {
        nodes, selection, onSelect, searchText, creatableClasses,
        onClickCreate, onDragCreate, draggableItems,
    } = props;

    const renderItem = React.useCallback<TreeListRenderItem<TreeNode, TreeNode>>(
        ({item, path, focusProps, expanded, selected}) => (
            <Leaf node={item}
                path={path}
                focusProps={focusProps}
                expanded={expanded}
                selected={selected}
            />
        ),
        []
    );
    const rootProps = React.useMemo((): React.HTMLProps<HTMLUListElement> => ({
        className: `${CLASS_NAME}__root`,
        role: 'tree',
    }), []);
    const forestProps = React.useMemo((): React.HTMLProps<HTMLUListElement> => ({
        className: `${CLASS_NAME}__children`,
        role: 'none',
    }), []);
    const itemProps = React.useMemo((): React.HTMLProps<HTMLLIElement> => ({
        className: CLASS_NAME,
        role: 'treeitem',
    }), []);

    const defaultExpanded = Boolean(searchText);
    const [expanded, setExpanded] = React.useState<TreeListState<boolean>>();
    const onExpand = React.useCallback((path: TreeListUpPath) => {
        setExpanded(previous =>
            (previous ?? new TreeListState())
                .setAt(treeListPathToDown(path), itemExpanded => !(itemExpanded ?? defaultExpanded))
        );
    }, [defaultExpanded]);
    React.useEffect(() => setExpanded(undefined), [searchText]);

    const classTreeContext = React.useMemo(
        (): ClassTreeContext => ({
            searchText,
            creatableClasses,
            onClickCreate,
            onDragCreate,
            draggableItems,
            onExpand,
            onSelect: (node, path) => onSelect({
                node,
                selection: new TreeListState<TreeNode>().setAt(
                    treeListPathToDown(path),
                    () => node
                ),
            }),
        }),
        [
            searchText,
            creatableClasses,
            onClickCreate,
            onDragCreate,
            draggableItems,
            onExpand,
            onSelect,
        ]
    );

    return (
        <ClassTreeContext.Provider value={classTreeContext}>
            <TreeList
                model={ClassTreeModel}
                items={nodes}
                renderItem={renderItem}
                expanded={expanded}
                defaultExpanded={defaultExpanded}
                onSetExpanded={(item, path, expand) => setExpanded(previous => (
                    (previous ?? new TreeListState()).setAt(path, () => expand)
                ))}
                selected={selection?.selection}
                rootProps={rootProps}
                forestProps={forestProps}
                itemProps={itemProps}
            />
        </ClassTreeContext.Provider>
    );
}

export interface TreeNode {
    readonly iri: ElementTypeIri
    readonly data: ElementTypeModel | undefined;
    readonly label: string;
    readonly derived: ReadonlyArray<TreeNode>;
}

export const TreeNode = {
    setDerived: (node: TreeNode, derived: ReadonlyArray<TreeNode>): TreeNode => ({...node, derived}),
};

const ClassTreeModel: TreeListModel<TreeNode, TreeNode> = {
    getKey: item => item.iri,
    getChildren: item => item.derived,
    getDefaultSelected: (item, selected) => undefined,
    isActive: item => true,
};

function Leaf(props: {
    node: TreeNode;
    path: TreeListUpPath;
    focusProps: TreeListFocusProps;
    expanded: boolean;
    selected?: TreeNode;
}) {
    const {node, path, focusProps, expanded, selected} = props;
    const {
        searchText, creatableClasses, onClickCreate, onDragCreate, draggableItems, onExpand, onSelect,
    } = useClassTreeContext();

    const {getElementTypeStyle} = useWorkspace();
    const t = useTranslation();    

    const toggleClass = (
        node.derived.length === 0 ? `${CLASS_NAME}__toggle` :
        expanded ? `${CLASS_NAME}__toggle-expanded` :
        `${CLASS_NAME}__toggle-collapsed`
    );

    const typeStyle = getElementTypeStyle([node.iri]);
    const providedStyle = {
        '--reactodia-element-style-color': typeStyle.color,
    } as React.CSSProperties;

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
        <div className={`${CLASS_NAME}__row`}
            style={providedStyle}>
            <div className={toggleClass}
                role='none'
                onClick={() => onExpand(path)}
            />
            <a {...focusProps}
                className={bodyClass}
                href={node.iri}
                onClick={e => {
                    e.preventDefault();
                    onSelect(node, path);
                }}
                onKeyDown={e => {
                    if (e.key === ' ') {
                        e.preventDefault();
                        onSelect(node, path);
                    }
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
                <button {...focusProps}
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
    );
}

function useClassTreeContext(): ClassTreeContext {
    const context = React.useContext(ClassTreeContext);
    if (!context) {
        throw new Error('Reactodia: missing class tree context');
    }
    return context;
}
