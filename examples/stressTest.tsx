import * as React from 'react';

import * as Reactodia from '../src/index';

import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

const Layouts = Reactodia.defineDefaultLayouts('default-layouts.worker.js');

function StressTestExample() {
    const workspaceRef = React.useRef<Reactodia.Workspace | null>(null);

    const {defaultLayout} = Reactodia.useWorker(Layouts);

    React.useEffect(() => {
        const cancellation = new AbortController();
        const {model, view} = workspaceRef.current!.getContext();

        const dataProvider = new Reactodia.RdfDataProvider();
        const [graphData, nodes] = createLayout(500, 2, dataProvider.factory);
        dataProvider.addGraph(graphData);
    
        const diagram = tryLoadLayoutFromLocalStorage();
        if (diagram) {
            model.importLayout({
                diagram,
                dataProvider,
                validateLinks: true,
                signal: cancellation.signal,
            });
        } else {
            model.createNewDiagram({dataProvider}).then(async () => {
                const rowCount = Math.floor(Math.sqrt(nodes.length));
                const estimatedWidth = 200;
                const estimatedHeight = 100;
                const batch = model.history.startBatch();
                for (let i = 0; i < nodes.length; i++) {
                    const nodeId = nodes[i];
                    const x = (i % rowCount) * estimatedWidth;
                    const y = Math.floor(i / rowCount) * estimatedHeight;
                    model.addElement(new Reactodia.Element({
                        id: `n:${i}`,
                        data: {
                            id: nodeId,
                            types: [],
                            label: [],
                            properties: {},
                        },
                        position: {x, y},
                    }));
                }
                batch.store();
                await Promise.all([
                    model.requestElementData(nodes),
                    model.requestLinksOfType(),
                ]);
                model.history.reset();

                const canvas = view.findAnyCanvas();
                if (canvas) {
                    canvas.renderingState.syncUpdate();
                    canvas.zoomToFit();
                }
            });
        }
        return () => cancellation.abort();
    }, []);

    return (
        <Reactodia.Workspace ref={workspaceRef}
            defaultLayout={defaultLayout}>
            <Reactodia.DefaultWorkspace
                leftColumn={{defaultCollapsed: true}}
                toolbar={{
                    menu: <ExampleToolbarMenu />,
                }}
                navigator={{
                    expanded: false,
                }}
            />
        </Reactodia.Workspace>
    );
}

function createLayout(
    nodeCount: number,
    edgesPerNode: number,
    factory: Reactodia.Rdf.DataFactory
): [Reactodia.Rdf.Quad[], Reactodia.ElementIri[]] {
    const rdfType = factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
    const rdfsLabel = factory.namedNode('http://www.w3.org/2000/01/rdf-schema#label');
    const nodeType = factory.namedNode('urn:test:Node');
    const linkType = factory.namedNode('urn:test:link');

    const makeNodeIri = (n: number) => factory.namedNode(
        `urn:test:n:${n}` as Reactodia.ElementIri
    );

    const elementIris: Reactodia.ElementIri[] = [];
    const quads: Reactodia.Rdf.Quad[] = [];
    for (let i = 0; i < nodeCount; i++) {
        const iri = makeNodeIri(i);
        elementIris.push(iri.value);
        quads.push(
            factory.quad(iri, rdfType, nodeType),
            factory.quad(iri, rdfsLabel, factory.literal(`Node ${i}`))
        );

        for (let j = 0; j < edgesPerNode; j++) {
            const target = i - j - 1;
            if (target >= 0) {
                quads.push(factory.quad(iri, linkType, makeNodeIri(target)));
            }
        }
    }

    return [quads, elementIris];
}

mountOnLoad(<StressTestExample />);
