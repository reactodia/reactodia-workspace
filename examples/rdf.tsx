import * as React from 'react';
import * as N3 from 'n3';

import * as Reactodia from '../src/workspace';

import { ExampleMetadataProvider, ExampleValidationProvider } from './resources/exampleMetadata';
import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

const TURTLE_DATA = require('./resources/orgOntology.ttl') as string;

const Layouts = Reactodia.defineLayoutWorker(() => new Worker('layout.worker.js'));

function RdfExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);

    const [searchCommands] = React.useState(() =>
        new Reactodia.EventSource<Reactodia.UnifiedSearchCommands>
    );

    const [turtleData, setTurtleData] = React.useState(TURTLE_DATA);
    const {onMount} = Reactodia.useLoadedWorkspace(async ({context, signal}) => {
        const {model, editor} = context;
        editor.setAuthoringMode(true);

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
            searchCommands.trigger('focus', {sectionKey: 'elementTypes'});
        }
    }, [turtleData]);

    const [metadataProvider] = React.useState(() => new ExampleMetadataProvider());
    const [validationProvider] = React.useState(() => new ExampleValidationProvider());
    const [renameLinkProvider] = React.useState(() => new RenameSubclassOfProvider());

    return (
        <Reactodia.Workspace ref={onMount}
            defaultLayout={defaultLayout}
            metadataProvider={metadataProvider}
            validationProvider={validationProvider}
            renameLinkProvider={renameLinkProvider}
            typeStyleResolver={Reactodia.SemanticTypeStyles}
            onIriClick={({iri}) => window.open(iri)}>
            <Reactodia.DefaultWorkspace
                canvas={{
                    linkTemplateResolver: type => {
                        if (type === 'http://www.w3.org/2000/01/rdf-schema#subClassOf') {
                            return Reactodia.DefaultLinkTemplate;
                        }
                        return Reactodia.OntologyLinkTemplates(type); 
                    },
                }}
                menu={
                    <>
                        <ToolbarActionOpenTurtleGraph onOpen={setTurtleData} />
                        <ExampleToolbarMenu />
                    </>
                }
                searchCommands={searchCommands}
            />
        </Reactodia.Workspace>
    );
}

class RenameSubclassOfProvider extends Reactodia.RenameLinkToLinkStateProvider {
    override canRename(link: Reactodia.Link): boolean {
        return link.typeId === 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
    }
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
