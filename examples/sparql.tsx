import * as React from 'react';
import {
    Workspace, SparqlDataProvider, OwlStatsSettings, DefaultWorkspace,
} from '../src/index';

import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

function SparqlExample() {
    const workspaceRef = React.useRef<Workspace | null>(null);

    React.useEffect(() => {
        const cancellation = new AbortController();
        const {model} = workspaceRef.current!.getContext();

        const diagram = tryLoadLayoutFromLocalStorage();
        const dataProvider = new SparqlDataProvider({
            endpointUrl: '/sparql',
            imagePropertyUris: [
                'http://collection.britishmuseum.org/id/ontology/PX_has_main_representation',
                'http://xmlns.com/foaf/0.1/img',
            ]
        }, OwlStatsSettings);

        model.importLayout({
            diagram,
            dataProvider: dataProvider,
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
        </Workspace>
    );
}

mountOnLoad(<SparqlExample />);
