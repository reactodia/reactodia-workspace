import * as React from 'react';
import * as Reactodia from '../src/workspace';

import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

declare const WIKIDATA_ENDPOINT: string | undefined;

const Layouts = Reactodia.defineLayoutWorker(() => new Worker('layout.worker.js'));

function WikidataExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);

    const {onMount, getContext} = Reactodia.useLoadedWorkspace(async (context, signal) => {
        const {model} = context;

        const sparqlProvider = new Reactodia.SparqlDataProvider(
            {
                endpointUrl: WIKIDATA_ENDPOINT || '/wikidata',
                imagePropertyUris: [
                    'http://www.wikidata.org/prop/direct/P18',
                    'http://www.wikidata.org/prop/direct/P154',
                ],
                queryMethod: WIKIDATA_ENDPOINT ? 'GET' : 'POST',
            },
            {
                ...Reactodia.WikidataSettings,
                // Public Wikidata endpoint is too overloaded for the connection statistics
                linkTypesStatisticsQuery: '',
            });

        const dataProvider = new Reactodia.IndexedDbCachedProvider({
            baseProvider: sparqlProvider,
            dbName: 'reactodia-wikidata-cache',
            closeSignal: signal,
        });

        const diagram = tryLoadLayoutFromLocalStorage();
        await model.importLayout({
            diagram,
            dataProvider,
            validateLinks: true,
            signal,
        });
    }, []);

    return (
        <Reactodia.Workspace ref={onMount}
            defaultLayout={defaultLayout}
            onIriClick={({iri}) => window.open(iri)}>
            <Reactodia.DefaultWorkspace
                toolbar={{
                    menu: <>
                        <ExampleToolbarMenu />
                        <Reactodia.ToolbarAction
                            title='Clear locally-cached data previously fetched from Wikidata'
                            onSelect={() => {
                                const {model: {dataProvider}} = getContext();
                                if (dataProvider instanceof Reactodia.IndexedDbCachedProvider) {
                                    dataProvider.clearCache();
                                }
                            }}>
                            Clear Wikidata cache
                        </Reactodia.ToolbarAction>
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
        </Reactodia.Workspace>
    );
}

mountOnLoad(<WikidataExample />);
