import * as React from 'react';
import * as Reactodia from '../src/workspace';

import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

const Layouts = Reactodia.defineLayoutWorker(() => new Worker('layout.worker.js'));

function SparqlExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);

    const {onMount} = Reactodia.useLoadedWorkspace(async ({context, signal}) => {
        const {model} = context;

        const diagram = tryLoadLayoutFromLocalStorage();
        const dataProvider = new Reactodia.SparqlDataProvider({
            endpointUrl: '/sparql',
            imagePropertyUris: [
                'http://collection.britishmuseum.org/id/ontology/PX_has_main_representation',
                'http://xmlns.com/foaf/0.1/img',
            ]
        }, Reactodia.OwlStatsSettings);

        model.importLayout({
            diagram,
            dataProvider: dataProvider,
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
                    menu: <ExampleToolbarMenu />,
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

mountOnLoad(<SparqlExample />);
