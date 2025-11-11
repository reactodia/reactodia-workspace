import * as React from 'react';
import * as N3 from 'n3';

import * as Reactodia from '../src/workspace';

import { mountOnLoad } from './resources/common';

const GRAPH_DATA =
    'https://raw.githubusercontent.com/reactodia/reactodia-workspace/' +
    'master/examples/resources/orgOntology.ttl';

const Layouts = Reactodia.defineLayoutWorker(() => new Worker(
    new URL('../src/layout.worker.ts', import.meta.url),
    {type: 'module'}
));

function BasicExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);

    const {onMount} = Reactodia.useLoadedWorkspace(async ({context, signal}) => {
        const {model, performLayout} = context;
        // Fetch graph data to use as underlying data source
        const response = await fetch(GRAPH_DATA, {signal});
        const graphData = new N3.Parser().parse(await response.text());
        const dataProvider = new Reactodia.RdfDataProvider({acceptBlankNodes: false});
        dataProvider.addGraph(graphData);

        // Create empty diagram and put owl:Class entities with links between them
        await model.createNewDiagram({dataProvider, signal});
        const elementTypeId = 'http://www.w3.org/2002/07/owl#Class';
        for (const {element} of await dataProvider.lookup({elementTypeId})) {
            model.createElement(element.id);
        }
        await model.requestData();

        // Layout elements on canvas
        await performLayout({signal});
    }, []);

    return (
        <Reactodia.Workspace ref={onMount}
            defaultLayout={defaultLayout}>
            <Reactodia.DefaultWorkspace />
        </Reactodia.Workspace>
    );
}

mountOnLoad(<BasicExample />);
