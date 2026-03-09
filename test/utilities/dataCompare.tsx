import type { LinkModel } from '../../src/data/model';

export function compareLinks(a: LinkModel, b: LinkModel): number {
    let result = (
        a.sourceId < b.sourceId ? -1 :
        a.sourceId > b.sourceId ? 1 :
        0
    );
    if (result !== 0) {
        return result;
    }
    result = (
        a.targetId < b.targetId ? -1 :
        a.targetId > b.targetId ? 1 :
        0
    );
    if (result !== 0) {
        return result;
    }
    result = (
        a.linkTypeId < b.linkTypeId ? -1 :
        a.linkTypeId > b.linkTypeId ? 1 :
        0
    );
    return result;
}
