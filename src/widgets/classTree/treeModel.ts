import { ElementTypeIri, ElementTypeModel } from '../../data/model';

export interface TreeNode {
    readonly iri: ElementTypeIri
    readonly data: ElementTypeModel | undefined;
    readonly label: string;
    readonly derived: ReadonlyArray<TreeNode>;
}

export const TreeNode = {
    setDerived: (node: TreeNode, derived: ReadonlyArray<TreeNode>): TreeNode => ({...node, derived}),
};
