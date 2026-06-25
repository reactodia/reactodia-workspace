import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';

import { type Translation, TranslationProvider } from '../../src/coreUtils/i18n';
import { ConnectionsList } from '../../src/widgets/connectionsMenu/connectionList';
import {
    WorkspaceContext,
    type WorkspaceContext as WorkspaceContextType,
} from '../../src/workspace/workspaceContext';

const link = {id: 'iri', label: []};
const translation = {
    formatLabel: () => 'relation',
    text: (key: string) => key,
} as unknown as Translation;
const workspace = {
    model: {
        language: 'en',
        locale: {formatIri: (value: string) => value},
        operations: [],
        getLinkType: () => undefined,
        getOperationFailReason: () => undefined,
        events: {
            on: () => undefined,
            off: () => undefined,
        },
    },
} as unknown as WorkspaceContextType;

describe('ConnectionsList', () => {
    it('renders the only connection link', async () => {
        await render(
            <TranslationProvider translation={translation}>
                <WorkspaceContext.Provider value={workspace}>
                    <ConnectionsList
                        data={{
                            links: [link],
                            counts: new Map([[link.id, {inCount: 1, outCount: 0, inexact: false}]]),
                        }}
                        filterKey=''
                        sortMode='alphabet'
                        suggestions={{filterKey: null, scores: new Map()}}
                        allRelatedLink={{id: 'all', label: []}}
                        onExpandLink={() => undefined}
                        onMoveToFilter={undefined}
                        scrolledListRef={React.createRef<HTMLUListElement>()}
                    />
                </WorkspaceContext.Provider>
            </TranslationProvider>
        );

        expect(document.body.textContent).toContain('relation');
    });
});
