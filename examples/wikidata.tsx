import * as React from 'react';
import {
    Workspace, DefaultWorkspace, SparqlDataProvider, IndexedDbCachedProvider, WikidataSettings,
} from '../src/index';

import { mountOnLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './resources/common';

declare const WIKIDATA_ENDPOINT: string | undefined;

function WikidataExample() {
    const workspaceRef = React.useRef<Workspace | null>(null);

    React.useEffect(() => {
        const cancellation = new AbortController();
        const {model} = workspaceRef.current!.getContext();

        const sparqlProvider = new SparqlDataProvider({
            endpointUrl: WIKIDATA_ENDPOINT || '/wikidata',
            imagePropertyUris: [
                'http://www.wikidata.org/prop/direct/P18',
                'http://www.wikidata.org/prop/direct/P154',
            ],
            queryMethod: WIKIDATA_ENDPOINT ? 'GET' : 'POST',
        }, WikidataSettings);

        const dataProvider = new IndexedDbCachedProvider({
            baseProvider: sparqlProvider,
            dbName: 'reactodia-wikidata-cache',
        });

        const diagram = tryLoadLayoutFromLocalStorage();
        model.importLayout({
            diagram,
            dataProvider,
            validateLinks: true,
            signal: cancellation.signal,
        });

        return () => cancellation.abort();
    }, []);

    return (
        <Workspace
            ref={workspaceRef}
            onIriClick={({iri}) => window.open(iri)}>
            <DefaultWorkspace
                toolbar={{
                    onSaveDiagram: () => {
                        const {model} = workspaceRef.current!.getContext();
                        const diagram = model.exportLayout();
                        window.location.hash = saveLayoutToLocalStorage(diagram);
                        window.location.reload();
                    },
                }}
            />
        </Workspace>
    );
}

mountOnLoad(<WikidataExample />);
