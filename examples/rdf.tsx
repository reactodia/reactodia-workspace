import * as React from 'react';
import * as N3 from 'n3';

import * as Reactodia from '../src/workspace';

import { ExampleMetadataApi, ExampleValidationApi } from './resources/exampleMetadataApi';
import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

const TURTLE_DATA = require('./resources/orgOntology.ttl') as string;

const Layouts = Reactodia.defineLayoutWorker(() => new Worker('layout.worker.js'));

function RdfExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);

    const [turtleData, setTurtleData] = React.useState(TURTLE_DATA);
    const {onMount} = Reactodia.useLoadedWorkspace(async ({context, signal}) => {
        const {model} = context;

        const dataProvider = new Reactodia.RdfDataProvider();
        try {
            dataProvider.addGraph(new N3.Parser().parse(turtleData));
        } catch (err) {
            throw new Error('Error parsing RDF graph data', {cause: err});
        }
    
        const diagram = tryLoadLayoutFromLocalStorage();
        model.importLayout({
            diagram,
            dataProvider,
            validateLinks: true,
            signal,
        });
    }, [turtleData]);

    const [metadataApi] = React.useState(() => new ExampleMetadataApi());
    const [validationApi] = React.useState(() => new ExampleValidationApi());
    const [renameLinkProvider] = React.useState(() => new RenameSubclassOfProvider());

    const suggestProperties = React.useCallback<Reactodia.PropertySuggestionHandler>(params => {
        let maxLength = 0;
        for (const iri of params.properties) {
            maxLength = Math.max(maxLength, iri.length);
        }
        const scores = params.properties.map((p): Reactodia.PropertyScore => ({
            propertyIri: p,
            score: 1 - p.length / maxLength,
        }));
        return Reactodia.delay(300).then(() => scores);
    }, []);

    return (
        <Reactodia.Workspace ref={onMount}
            defaultLayout={defaultLayout}
            metadataApi={metadataApi}
            validationApi={validationApi}
            renameLinkProvider={renameLinkProvider}
            typeStyleResolver={Reactodia.SemanticTypeStyles}
            onIriClick={({iri}) => window.open(iri)}>
            <Reactodia.DefaultWorkspace
                canvas={{
                    elementTemplateResolver: types => {
                        if (types.includes('http://www.w3.org/2002/07/owl#DatatypeProperty')) {
                            return Reactodia.ClassicTemplate;
                        }
                        return undefined;
                    },
                    linkTemplateResolver: type => {
                        if (type === 'http://www.w3.org/2000/01/rdf-schema#subClassOf') {
                            return Reactodia.DefaultLinkTemplate;
                        }
                        return Reactodia.OntologyLinkTemplates(type); 
                    },
                }}
                connectionsMenu={{suggestProperties}}
                toolbar={{
                    menu: <>
                        <ToolbarActionOpenTurtleGraph onOpen={setTurtleData} />
                        <ExampleToolbarMenu />
                    </>
                }}
            />
        </Reactodia.Workspace>
    );
}

class RenameSubclassOfProvider extends Reactodia.RenameLinkToLinkStateProvider {
    override canRename(link: Reactodia.Link): boolean {
        return link.typeId === 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
    }
}

interface ToolbarActionOpenTurtleGraphProps {
    onOpen: (turtleText: string) => void;
}

function ToolbarActionOpenTurtleGraph(props: ToolbarActionOpenTurtleGraphProps) {
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
