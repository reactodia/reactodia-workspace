import * as React from 'react';
import {
    Workspace, SparqlDataProvider, WikidataSettings,
} from '../src/index';

import { mountOnLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './resources/common';

function WikidataExample() {
    const cancellation = React.useRef<AbortController>();
    function onWorkspaceMounted(workspace: Workspace | null) {
        if (!workspace) {
            cancellation.current?.abort();
            return;
        }
        cancellation.current = new AbortController();
        const diagram = tryLoadLayoutFromLocalStorage();
        const dataProvider = new SparqlDataProvider({
            endpointUrl: '/wikidata',
            imagePropertyUris: [
                'http://www.wikidata.org/prop/direct/P18',
                'http://www.wikidata.org/prop/direct/P154',
            ],
            queryMethod: 'POST',
        }, WikidataSettings);
        workspace.getModel().importLayout({
            diagram,
            dataProvider,
            validateLinks: true,
            signal: cancellation.current.signal,
        });
    }
    return (
        <Workspace
            ref={onWorkspaceMounted}
            onSaveDiagram={self => {
                const diagram = self.getModel().exportLayout();
                window.location.hash = saveLayoutToLocalStorage(diagram);
                window.location.reload();
            }}
            viewOptions={{
                onIriClick: ({iri}) => window.open(iri),
            }}
        />
    );
}

mountOnLoad(<WikidataExample />);
