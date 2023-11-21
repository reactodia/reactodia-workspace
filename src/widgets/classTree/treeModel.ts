import { RichElementType } from '../../diagram/elements';

export interface TreeNode {
    model: RichElementType;
    label: string;
    derived: ReadonlyArray<TreeNode>;
}

export const TreeNode = {
    setDerived: (node: TreeNode, derived: ReadonlyArray<TreeNode>): TreeNode => ({...node, derived}),
};
