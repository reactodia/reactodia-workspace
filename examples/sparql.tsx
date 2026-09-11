import * as React from 'react';
import * as Reactodia from '../src/workspace';

import {
    ExampleToolbarMenu,
    mountOnLoad,
    tryLoadLayoutFromLocalStorage,
    getHashQuery,
    setHashQueryParam,
} from './resources/common';
import {
    SparqlConnectionSettings, SparqlConnectionAction, showConnectionDialog,
} from './resources/sparqlConnection';
import { SparqlFilterAction } from './resources/sparqlFilter';

const Layouts = Reactodia.defineLayoutWorker(() => new Worker(
    new URL('../src/layout.worker.ts', import.meta.url),
    {type: 'module'}
));

function SparqlExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);
    const [workspace] = React.useState(() => Reactodia.createWorkspace({
        defaultLayout,
    }));

    const [connectionSettings, setConnectionSettings] = React.useState(
        (): SparqlConnectionSettings | undefined => {
            const params = getHashQuery();
            const endpointUrl = params?.get('sparql-endpoint');
            return endpointUrl ? {
                endpointUrl,
            } : undefined;
        }
    );
    const applyConnectionSettings = (settings: SparqlConnectionSettings) => {
        setHashQueryParam('sparql-endpoint', settings.endpointUrl);
        setConnectionSettings(settings);
    };

    const {onMount} = Reactodia.useLoadedWorkspace(async ({context, signal}) => {
        const {model, getCommandBus} = context;

        if (connectionSettings) {
            const diagram = tryLoadLayoutFromLocalStorage();
            const dataProvider = new Reactodia.SparqlDataProvider({
                endpointUrl: connectionSettings.endpointUrl,
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
            <SparqlWorkspace connectionSettings={connectionSettings}
                applyConnectionSettings={applyConnectionSettings}
            />
        </Reactodia.WorkspaceProvider>
    );
}

function SparqlWorkspace(props: {
    connectionSettings: SparqlConnectionSettings | undefined;
    applyConnectionSettings: (settings: SparqlConnectionSettings) => void;
}) {
    const {connectionSettings, applyConnectionSettings} = props;
    const searchSections = useSearchSections();
    return (
        <Reactodia.DefaultWorkspace
            menu={<ExampleToolbarMenu />}
            search={{sections: searchSections}}
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
    );
}

/**
 * Same as the default search sections, with a SPARQL query filter
 * for the entity search.
 */
function useSearchSections(): ReadonlyArray<Reactodia.UnifiedSearchSection> {
    const t = Reactodia.useTranslation();
    return React.useMemo((): ReadonlyArray<Reactodia.UnifiedSearchSection> => [
        {
            key: 'elementTypes',
            label: t.text('default_workspace.search_section_entity_types.label'),
            title: t.text('default_workspace.search_section_entity_types.title'),
            component: <Reactodia.SearchSectionElementTypes />,
        },
        {
            key: 'entities',
            label: t.text('default_workspace.search_section_entities.label'),
            title: t.text('default_workspace.search_section_entities.title'),
            component: (
                <Reactodia.SearchSectionEntities
                    renderCriteriaActions={context => <SparqlFilterAction context={context} />}
                />
            ),
        },
        {
            key: 'linkTypes',
            label: t.text('default_workspace.search_section_link_types.label'),
            title: t.text('default_workspace.search_section_link_types.title'),
            component: <Reactodia.SearchSectionLinkTypes />,
        },
    ], [t]);
}

mountOnLoad(<SparqlExample />);
