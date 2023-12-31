import * as React from 'react';
import {
    Workspace, DefaultWorkspace, ToolbarAction, SparqlDataProvider, IndexedDbCachedProvider,
    WikidataSettings,
} from '../src/index';

import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

declare const WIKIDATA_ENDPOINT: string | undefined;

function WikidataExample() {
    const workspaceRef = React.useRef<Workspace | null>(null);

    React.useEffect(() => {
        const cancellation = new AbortController();
        const {model} = workspaceRef.current!.getContext();

        const sparqlProvider = new SparqlDataProvider(
            {
                endpointUrl: WIKIDATA_ENDPOINT || '/wikidata',
                imagePropertyUris: [
                    'http://www.wikidata.org/prop/direct/P18',
                    'http://www.wikidata.org/prop/direct/P154',
                ],
                queryMethod: WIKIDATA_ENDPOINT ? 'GET' : 'POST',
            },
            {
                ...WikidataSettings,
                // Public Wikidata endpoint is too overloaded for the connection statistics
                linkTypesStatisticsQuery: '',
            });

        const dataProvider = new IndexedDbCachedProvider({
            baseProvider: sparqlProvider,
            dbName: 'reactodia-wikidata-cache',
            closeSignal: cancellation.signal,
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
                    menu: <>
                        <ExampleToolbarMenu />
                        <ToolbarAction
                            title='Clear locally-cached data previously fetched from Wikidata'
                            onSelect={() => {
                                const {model: {dataProvider}} = workspaceRef.current!.getContext();
                                if (dataProvider instanceof IndexedDbCachedProvider) {
                                    dataProvider.clearCache();
                                }
                            }}>
                            Clear Wikidata cache
                        </ToolbarAction>
                    </>,
                    languages: [
                        {code: 'de', label: 'Deutsch'},
                        {code: 'en', label: 'english'},
                        {code: 'es', label: 'español'},
                        {code: 'fr', label: 'français'},
                        {code: 'ja', label: '日本語'},
                        {code: 'hi', label: 'हिन्दी'},
                        {code: 'pt', label: 'português'},
                        {code: 'ru', label: 'русский'},
                        {code: 'zh', label: '汉语'},
                    ],
                }}
            />
        </Workspace>
    );
}

mountOnLoad(<WikidataExample />);
