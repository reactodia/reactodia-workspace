import * as React from 'react';
import * as N3 from 'n3';

import * as Reactodia from '../src/workspace';

import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

const TURTLE_DATA = require('./resources/orgOntology.ttl') as string;

const Layouts = Reactodia.defineLayoutWorker(() => new Worker('layout.worker.js'));

function RdfExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);

    const [turtleData, setTurtleData] = React.useState(TURTLE_DATA);
    const {onMount} = Reactodia.useLoadedWorkspace(async ({context, signal}) => {
        const {model, getCommandBus} = context;

        const dataProvider = new Reactodia.RdfDataProvider();
        try {
            dataProvider.addGraph(new N3.Parser().parse(turtleData));
        } catch (err) {
            throw new Error('Error parsing RDF graph data', {cause: err});
        }
    
        const diagram = tryLoadLayoutFromLocalStorage();
        await model.importLayout({
            diagram,
            dataProvider,
            validateLinks: true,
            signal,
        });

        if (!diagram) {
            getCommandBus(Reactodia.UnifiedSearchTopic)
                .trigger('focus', {sectionKey: 'elementTypes'});
        }
    }, [turtleData]);

    return (
        <Reactodia.Workspace ref={onMount}
            defaultLayout={defaultLayout}
            onIriClick={({iri}) => window.open(iri)}>
            <Reactodia.DefaultWorkspace
                menu={
                    <>
                        <ToolbarActionOpenTurtleGraph onOpen={setTurtleData} />
                        <ExampleToolbarMenu />
                    </>
                }
                languages={[
                    {code: 'de', label: 'Deutsch'},
                    {code: 'en', label: 'english'},
                    {code: 'es', label: 'español'},
                    {code: 'ru', label: 'русский'},
                    {code: 'zh', label: '汉语'},
                ]}
            />
        </Reactodia.Workspace>
    );
}

function ToolbarActionOpenTurtleGraph(props: {
    onOpen: (turtleText: string) => void;
}) {
    const {onOpen} = props;
    return (
        <Reactodia.ToolbarActionOpen
            fileAccept='.ttl'
            onSelect={async file => {
                const turtleText = await file.text();
                onOpen(turtleText);
            }}>
            Load RDF (Turtle) data
        </Reactodia.ToolbarActionOpen>
    );
}

mountOnLoad(<RdfExample />);
