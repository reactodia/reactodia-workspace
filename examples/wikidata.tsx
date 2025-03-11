import * as React from 'react';
import * as Reactodia from '../src/workspace';

import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

declare const WIKIDATA_ENDPOINT: string | undefined;

const Layouts = Reactodia.defineLayoutWorker(() => new Worker('layout.worker.js'));

function WikidataExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);

    const {onMount, getContext} = Reactodia.useLoadedWorkspace(async ({context, signal}) => {
        const {model, getExtensionCommands} = context;

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
                filterOnlyLanguages: ['de', 'en', 'es', 'ru', 'zh'],
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

        if (!diagram) {
            getExtensionCommands(Reactodia.UnifiedSearchExtension)
                .trigger('focus', {sectionKey: 'entities'});
        }
    }, []);

    const suggestProperties = React.useCallback<Reactodia.PropertySuggestionHandler>(params => {
        const scores = params.properties.map((iri, index): Reactodia.PropertyScore => {
            // Assumption is smaller P-properties were created earlier and are more interesting
            const match = /P([0-9]+)$/.exec(iri);
            return {
                propertyIri: iri,
                score: match ? -Number(match[1]) : (params.properties.length - index),
            };
        });
        return Promise.resolve(scores);
    }, []);

    return (
        <Reactodia.Workspace ref={onMount}
            defaultLayout={defaultLayout}
            onIriClick={({iri}) => window.open(iri)}>
            <Reactodia.DefaultWorkspace
                menu={
                    <>
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
                    </>
                }
                connectionsMenu={{suggestProperties}}
                languages={[
                    {code: 'de', label: 'Deutsch'},
                    {code: 'en', label: 'english'},
                    {code: 'es', label: 'español'},
                    {code: 'ru', label: 'русский'},
                    {code: 'zh', label: '汉语'},
                ]}
            />
        </Reactodia.Workspace>
    );
}

mountOnLoad(<WikidataExample />);
