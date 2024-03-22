import * as React from 'react';
import * as N3 from 'n3';

import * as Reactodia from '../src/workspace';

import { mountOnLoad } from './resources/common';

const GRAPH_DATA =
    'https://raw.githubusercontent.com/reactodia/reactodia-workspace/' +
    'master/examples/resources/orgOntology.ttl';

const Layouts = Reactodia.defineDefaultLayouts('default-layouts.worker.js');

function BasicExample() {
    const workspaceRef = React.useRef<Reactodia.Workspace | null>(null);

    const {defaultLayout} = Reactodia.useWorker(Layouts);

    React.useEffect(() => {
        const controller = new AbortController();
        loadGraphData(controller.signal);
        return () => controller.abort();
    }, []);

    async function loadGraphData(signal: AbortSignal) {
        const {model, performLayout} = workspaceRef.current!.getContext();
        // Fetch graph data to use as underlying data source
        const response = await fetch(GRAPH_DATA, {signal});
        const graphData = new N3.Parser().parse(await response.text());
        const dataProvider = new Reactodia.RdfDataProvider({acceptBlankNodes: false});
        dataProvider.addGraph(graphData);

        // Create empty diagram and put owl:Class entities with links between them
        await model.createNewDiagram({dataProvider, signal});
        const elementTypeId = 'http://www.w3.org/2002/07/owl#Class' as Reactodia.ElementTypeIri;
        for (const {element} of await dataProvider.lookup({elementTypeId})) {
            model.createElement(element);
        }
        await model.requestLinksOfType();

        // Layout elements on canvas
        await performLayout({signal});
    }

    return (
        <Reactodia.Workspace ref={workspaceRef}
            defaultLayout={defaultLayout}>
            <Reactodia.DefaultWorkspace />
        </Reactodia.Workspace>
    );
}

mountOnLoad(<BasicExample />);
