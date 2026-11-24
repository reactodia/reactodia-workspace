import * as React from 'react';
import * as N3 from 'n3';

import * as Reactodia from '../src/workspace';

import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

import TURTLE_DATA from './resources/orgOntology.ttl?raw';

const Layouts = Reactodia.defineLayoutWorker(() => new Worker(
    new URL('../src/layout.worker.ts', import.meta.url),
    {type: 'module'}
));

function I18nExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);
    const [workspace] = React.useState(() => Reactodia.createWorkspace({
        translation: new Reactodia.DefaultTranslation({
            bundles: [
                {
                    'default_workspace': {
                        'search_section_entities.label': 'Nodes',
                        'search_section_entities.title': 'Graph Nodes Lookup',
                        'search_section_entity_types.label': 'Node Types',
                        'search_section_entity_types.title': 'Graph Node Type Hierarchy',
                        'search_section_link_types.label': 'Edge Types',
                        'search_section_link_types.title': 'Graph Edge Types on the diagram'
                    },
                    'search_defaults': {
                        'input_term_too_short': 'Minimum search term length is {{termLength}}',
                    },
                    'search_criteria': {
                        'from_values.any_entity': 'any node',
                        'from_values.many_entities': 'one of {{count}} nodes',
                        'from_values.header': 'One of nodes',
                        'from_values.input.placeholder': 'Search for nodes...',
                        'from_values.label': 'one of nodes',
                        'has_type.input.placeholder': 'Search for node types...',
                        'connected.any_link': 'any edge',
                        'connected.input.placeholder': 'Search for edge types...',
                        'connected.label': 'has edge to',
                        'connected.mode_ignore.label': 'any edge except',
                        'connected.other_entity': 'node',
                        'connected.to_source':
                            'Has edge to {{sourceIcon}}\u00A0{{entity}} (source) as {{relationType}}',
                        'connected.to_target':
                            'Has edge to {{targetIcon}}\u00A0{{entity}} (target) as {{relationType}}',
                        'connected.to_source_or_target':
                            'Has edge to {{entity}} as {{relationType}}',
                        'placeholder_any': 'any node',
                    },
                    'toolbar_action': {
                        'layout.label': 'Layout the graph',
                    },
                },
                Reactodia.DefaultTranslationBundle,
            ],
        }),
        defaultLayout,
    }));

    const {onMount} = Reactodia.useLoadedWorkspace(async ({context, signal}) => {
        const {model} = context;

        const dataProvider = new Reactodia.RdfDataProvider();
        dataProvider.addGraph(new N3.Parser().parse(TURTLE_DATA));

        const diagram = tryLoadLayoutFromLocalStorage();
        await model.importLayout({
            diagram,
            dataProvider: dataProvider,
            validateLinks: true,
            signal,
        });
    }, []);

    return (
        <Reactodia.WorkspaceProvider workspace={workspace}
            onMount={onMount}>
            <Reactodia.DefaultWorkspace
                menu={<ExampleToolbarMenu />}
            />
        </Reactodia.WorkspaceProvider>
    );
}

mountOnLoad(<I18nExample />);
