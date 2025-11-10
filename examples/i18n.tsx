import * as React from 'react';
import * as N3 from 'n3';

import * as Reactodia from '../src/workspace';

import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

const TURTLE_DATA = require('./resources/orgOntology.ttl') as string;

const Layouts = Reactodia.defineLayoutWorker(() => new Worker('layout.worker.js'));

function I18nExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);

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
        <Reactodia.Workspace ref={onMount}
            translations={[
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
                    'search_entities': {
                        'criteria_connected_to_source':
                            '{{sourceIcon}}\u00A0{{entity}} (source) via {{relationType}}',
                        'criteria_connected_to_target':
                            '{{targetIcon}}\u00A0{{entity}} (target) via {{relationType}}',
                    },
                    'toolbar_action': {
                        'layout.label': 'Layout the graph',
                    },
                }
            ]}
            defaultLayout={defaultLayout}>
            <Reactodia.DefaultWorkspace
                menu={<ExampleToolbarMenu />}
            />
        </Reactodia.Workspace>
    );
}

mountOnLoad(<I18nExample />);
