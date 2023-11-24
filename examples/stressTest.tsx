import * as React from 'react';

import {
    Workspace, DefaultWorkspace, Rdf, RdfDataProvider, ElementIri, Element,
} from '../src/index';

import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

function TurtleGraphExample() {
    const workspaceRef = React.useRef<Workspace | null>(null);

    React.useEffect(() => {
        const cancellation = new AbortController();
        const {model, view} = workspaceRef.current!.getContext();

        const dataProvider = new RdfDataProvider();
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
                    model.addElement(new Element({
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
        <Workspace ref={workspaceRef}>
            <DefaultWorkspace
                leftColumn={{defaultCollapsed: true}}
                toolbar={{
                    menu: <ExampleToolbarMenu />,
                }}
                navigator={{
                    expanded: false,
                }}
            />
        </Workspace>
    );
}

function createLayout(
    nodeCount: number,
    edgesPerNode: number,
    factory: Rdf.DataFactory
): [Rdf.Quad[], ElementIri[]] {
    const rdfType = factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
    const rdfsLabel = factory.namedNode('http://www.w3.org/2000/01/rdf-schema#label');
    const nodeType = factory.namedNode('urn:test:Node');
    const linkType = factory.namedNode('urn:test:link');

    const makeNodeIri = (n: number) => factory.namedNode(`urn:test:n:${n}` as ElementIri);

    const elementIris: ElementIri[] = [];
    const quads: Rdf.Quad[] = [];
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

mountOnLoad(<TurtleGraphExample />);
