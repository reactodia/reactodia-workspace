# Reactodia Workspace [![npm version](https://badge.fury.io/js/@reactodia%2Fworkspace.svg)](https://badge.fury.io/js/@reactodia%2Fworkspace)

[Changelog](https://github.com/reactodia/reactodia-workspace/blob/master/CHANGELOG.md) | [Interactive examples](https://reactodia.github.io/workspace/rdf.html)

`reactodia-workspace` is a TypeScript library that allows to explore, visualize and make changes to the data in the form of an interactive graph based on underlying data sources.

`reactodia-workspace` is an open-source fork of [Ontodia](https://github.com/metaphacts/ontodia) project.

![reactodia_wikidata](https://github.com/reactodia/reactodia-workspace/assets/1636942/10818259-a78d-41f1-b0c9-867b2164d8bd)

## Quick example

```ts
import * as React from 'react';
import * as N3 from 'n3';

import {
    Workspace, DefaultWorkspace, RdfDataProvider, ElementTypeIri, layoutForcePadded,
} from '@reactodia/workspace';

const GRAPH_DATA =
    'https://raw.githubusercontent.com/reactodia/reactodia-workspace/' +
    'master/examples/resources/orgOntology.ttl';

function BasicExample() {
    const workspaceRef = React.useRef<Workspace | null>(null);

    React.useEffect(() => {
        const controller = new AbortController();
        loadGraphData(controller.signal);
        return () => controller.abort();
    }, []);

    async function loadGraphData(signal: AbortSignal) {
        const {model, view, performLayout} = workspaceRef.current!.getContext();
        // Fetch graph data to use as underlying data source
        const response = await fetch(GRAPH_DATA, {signal});
        const graphData = new N3.Parser().parse(await response.text());
        const dataProvider = new RdfDataProvider({acceptBlankNodes: false});
        dataProvider.addGraph(graphData);

        // Create empty diagram and put owl:Class entities with links between them
        await model.createNewDiagram({dataProvider, signal});
        const elementTypeId = 'http://www.w3.org/2002/07/owl#Class' as ElementTypeIri;
        for (const {element} of await dataProvider.lookup({elementTypeId})) {
            model.createElement(element);
        }
        await model.requestLinksOfType();

        // Layout elements on canvas
        const canvas = view.findAnyCanvas()!;
        await performLayout({canvas, layoutFunction: layoutForcePadded, signal});
    }

    return (
        <Workspace ref={workspaceRef}>
            <DefaultWorkspace />
        </Workspace>
    );
}
```

## License

The library is distributed under LGPL-2.1 or (at your option) any later version.

## Scientific citations

If you use the library in your scientific projects, it would be great if you provide a link to this repository in your publication and a citation reference to the following paper:

Mouromtsev, D., Pavlov, D., Emelyanov, Y., Morozov, A., Razdyakonov, D. and Galkin, M., 2015. The Simple Web-based Tool for Visualization and Sharing of Semantic Data and Ontologies. In International Semantic Web Conference (Posters & Demos).

```
@inproceedings{Mouromtsev2015,
    author = {Mouromtsev, Dmitry and Pavlov, Dmitry and Emelyanov, Yury and
        Morozov, Alexey and Razdyakonov, Daniil and Galkin, Mikhail},
    year = {2015},
    month = {10},
    title = {The Simple Web-based Tool for Visualization and Sharing of Semantic Data and Ontologies},
    booktitle = {International Semantic Web Conference (Posters & Demos)}
}
```

It really helps our team to gain publicity and acknowledgment for our efforts.
Thank you for being considerate!
