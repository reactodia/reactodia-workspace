import * as React from 'react';
import * as N3 from 'n3';

import * as Reactodia from '../src/workspace';
import { SemanticTypeStyles, makeOntologyLinkTemplates } from '../src/legacy-styles';
const OntologyLinkTemplates = makeOntologyLinkTemplates(Reactodia);

import { ExampleMetadataProvider, ExampleValidationProvider } from './resources/exampleMetadata';
import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

const TURTLE_DATA = require('./resources/orgOntology.ttl') as string;

const Layouts = Reactodia.defineLayoutWorker(() => new Worker('layout.worker.js'));

function ClassicWorkspaceExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);

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
            typeStyleResolver={SemanticTypeStyles}>
            <Reactodia.ClassicWorkspace
                canvas={{
                    elementTemplateResolver: types => {
                        if (types.includes('http://www.w3.org/2002/07/owl#DatatypeProperty')) {
                            return Reactodia.ClassicTemplate;
                        }
                        return undefined;
                    },
                    linkTemplateResolver: (linkType, link) => {
                        if (linkType === 'http://www.w3.org/2000/01/rdf-schema#subClassOf') {
                            return Reactodia.DefaultLinkTemplate;
                        }
                        return OntologyLinkTemplates(linkType, link);
                    },
                }}
                toolbar={{
                    menu: (
                        <>
                            <ToolbarActionOpenTurtleGraph onOpen={setTurtleData} />
                            <ExampleToolbarMenu />
                        </>
                    ),
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

mountOnLoad(<ClassicWorkspaceExample />);
