import * as React from 'react';
import * as Reactodia from '../src/workspace';

import {
    ExampleToolbarMenu,
    mountOnLoad,
    tryLoadLayoutFromLocalStorage,
} from './resources/common';
import {
    SparqlConnectionSettings, SparqlConnectionAction, showConnectionDialog,
    loadConnectionSettings, saveConnectionSettings, createConnectionOptions,
} from './resources/sparqlConnection';

const Layouts = Reactodia.defineLayoutWorker(() => new Worker(
    new URL('../src/layout.worker.ts', import.meta.url),
    {type: 'module'}
));

function SparqlExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);
    const [workspace] = React.useState(() => Reactodia.createWorkspace({
        defaultLayout,
    }));

    const [connectionSettings, setConnectionSettings] = React.useState(loadConnectionSettings);
    const applyConnectionSettings = (settings: SparqlConnectionSettings) => {
        saveConnectionSettings(settings);
        setConnectionSettings(settings);
    };

    const {onMount} = Reactodia.useLoadedWorkspace(async ({context, signal}) => {
        const {model, getCommandBus} = context;

        if (connectionSettings) {
            const diagram = tryLoadLayoutFromLocalStorage();
            const dataProvider = new Reactodia.SparqlDataProvider({
                ...createConnectionOptions(connectionSettings),
                imagePropertyUris: ['http://xmlns.com/foaf/0.1/img'],
            }, Reactodia.OwlStatsSettings);
    
            await model.importLayout({
                diagram,
                dataProvider: dataProvider,
                validateLinks: true,
                signal,
            });
    
            if (!diagram) {
                getCommandBus(Reactodia.UnifiedSearchTopic)
                    .trigger('focus', {sectionKey: 'elementTypes'});
            }
        } else {
            showConnectionDialog(connectionSettings, applyConnectionSettings, context);
        }
    }, [connectionSettings]);

    return (
        <Reactodia.WorkspaceProvider workspace={workspace}
            onMount={onMount}>
            <Reactodia.DefaultWorkspace
                menu={<ExampleToolbarMenu />}
                languages={[
                    {code: 'de', label: 'Deutsch'},
                    {code: 'en', label: 'English'},
                    {code: 'es', label: 'Español'},
                    {code: 'fr', label: 'Français'},
                    {code: 'hi', label: 'हिन्दी'},
                    {code: 'it', label: 'Italiano'},
                    {code: 'ja', label: '日本語'},
                    {code: 'pt', label: 'português'},
                    {code: 'ru', label: 'Русский'},
                    {code: 'zh', label: '汉语'},
                ]}>
                <Reactodia.Toolbar dock='sw'
                    dockOffsetY={40}>
                    <SparqlConnectionAction settings={connectionSettings}
                        applySettings={applyConnectionSettings}
                    />
                </Reactodia.Toolbar> 
            </Reactodia.DefaultWorkspace>
        </Reactodia.WorkspaceProvider>
    );
}

mountOnLoad(<SparqlExample />);
