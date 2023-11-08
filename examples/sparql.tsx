import * as React from 'react';
import {
    Workspace, SparqlDataProvider, OwlStatsSettings, DefaultWorkspace,
} from '../src/index';

import { mountOnLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './resources/common';

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
                    onSaveDiagram: () => {
                        const {model} = workspaceRef.current!.getContext();
                        const diagram = model.exportLayout();
                        window.location.hash = saveLayoutToLocalStorage(diagram);
                        window.location.reload();
                    },
                    languages: [
                        {code: 'en', label: 'English'},
                        {code: 'de', label: 'German'},
                        {code: 'ru', label: 'Russian'},
                    ],
                }}
            />
        </Workspace>
    );
}

mountOnLoad(<SparqlExample />);
