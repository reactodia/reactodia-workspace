import { expect, describe, it } from 'vitest';

import { Sha256 } from '../../src/data/indexedDb/sha256';

describe('Sha256', () => {
    it('has correct UTF8 string digests', () => {
        expect(hashString('')).toEqual(
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        );
        expect(hashString('Small')).toEqual(
            '5263293fc202649bdc8135573ac9cd3b0bcea4355e0d8f0a59f1ddeea8eefc15'
        );
        expect(
            hashString(
                'If element type does not exists in the graph yet, it will be created ' +
                'and the data for it will be requested for it from the data provider 🎉'
            )
        ).toEqual('a3274d4c9cccf94b69921a2a2166735f490fb31aab27b1ee05a5a8173be994c9');
    });
});

function hashString(s: string) {
    const digest = new Sha256().create();
    const encodedString = new TextEncoder().encode(s);
    digest.update(encodedString);
    const digestBytes = digest.digest();
    const digestHex = Array.from(
        digestBytes,
        b => b.toString(16).padStart(2, '0')
    ).join('');
    return digestHex;
}
