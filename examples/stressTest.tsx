import * as React from 'react';

import * as Reactodia from '../src/workspace';

import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

const Layouts = Reactodia.defineLayoutWorker(() => new Worker('layout.worker.js'));

function StressTestExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);

    const {onMount} = Reactodia.useLoadedWorkspace(async ({context, signal}) => {
        const {model, view} = context;

        const dataProvider = new Reactodia.RdfDataProvider();
        const [graphData, nodes] = createLayout(500, 2, dataProvider.factory);
        dataProvider.addGraph(graphData);

        const diagram = tryLoadLayoutFromLocalStorage();
        await model.importLayout({
            diagram,
            dataProvider,
            validateLinks: Boolean(diagram),
            signal,
        });

        if (!diagram) {
            const rowCount = Math.floor(Math.sqrt(nodes.length));
            const estimatedWidth = 200;
            const estimatedHeight = 100;
            const batch = model.history.startBatch();
            for (let i = 0; i < nodes.length; i++) {
                const nodeId = nodes[i];
                const x = (i % rowCount) * estimatedWidth;
                const y = Math.floor(i / rowCount) * estimatedHeight;
                model.addElement(new Reactodia.EntityElement({
                    id: `n:${i}`,
                    data: Reactodia.EntityElement.placeholderData(nodeId),
                    position: {x, y},
                }));
            }
            batch.store();
            await Promise.all([
                model.requestElementData(nodes),
                model.requestLinks(),
            ]);
            model.history.reset();

            const canvas = view.findAnyCanvas();
            if (canvas) {
                canvas.renderingState.syncUpdate();
                canvas.zoomToFit();
            }
        }
    }, []);

    return (
        <Reactodia.Workspace ref={onMount}
            defaultLayout={defaultLayout}>
            <Reactodia.DefaultWorkspace
                menu={<ExampleToolbarMenu />}
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
    const rdfType = factory.namedNode(Reactodia.rdf.type);
    const rdfsLabel = factory.namedNode(Reactodia.rdfs.label);
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
