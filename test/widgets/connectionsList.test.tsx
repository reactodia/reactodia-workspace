import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';

import type { LinkTypeModel } from '../../src/data/model';
import { ConnectionsList } from '../../src/widgets/connectionsMenu/connectionList';
import { WorkspaceProvider, createWorkspace } from '../../src/workspace/workspaceProvider';
import { blockingDefaultLayout } from '../../src/layout-sync';

describe('ConnectionsList', () => {
    it('renders the only connection link', async () => {
        const link: LinkTypeModel = {id: 'urn:test:single-link', label: []};
        const workspace = createWorkspace({
            defaultLayout: blockingDefaultLayout,
        });

        await render(
            <WorkspaceProvider workspace={workspace}>
                <ConnectionsList
                    data={{
                        links: [link],
                        counts: new Map([
                            [link.id, {inCount: 1, outCount: 0, inexact: false}]
                        ]),
                    }}
                    filterKey=''
                    sortMode='alphabet'
                    suggestions={{filterKey: null, scores: new Map()}}
                    allRelatedLink={{id: 'all', label: []}}
                    onExpandLink={() => undefined}
                />
            </WorkspaceProvider>
        );

        expect(document.body.querySelector(
            '[data-linktypeid="urn:test:single-link"]'
        )).toBeTruthy();
    });
});
