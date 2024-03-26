import { ElementType } from '../../diagram/elements';

export interface TreeNode {
    model: ElementType;
    label: string;
    derived: ReadonlyArray<TreeNode>;
}

export const TreeNode = {
    setDerived: (node: TreeNode, derived: ReadonlyArray<TreeNode>): TreeNode => ({...node, derived}),
};
