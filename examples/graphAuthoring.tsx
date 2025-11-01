import * as React from 'react';
import * as N3 from 'n3';

import * as Reactodia from '../src/workspace';

import { ExampleMetadataProvider, ExampleValidationProvider } from './resources/exampleMetadata';
import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

const TURTLE_DATA = require('./resources/orgOntology.ttl') as string;

const Layouts = Reactodia.defineLayoutWorker(() => new Worker('layout.worker.js'));

function GraphAuthoringExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);

    const {onMount} = Reactodia.useLoadedWorkspace(async ({context, signal}) => {
        const {model, editor, performLayout} = context;
        editor.setAuthoringMode(true);

        const dataProvider = new Reactodia.RdfDataProvider();
        try {
            dataProvider.addGraph(new N3.Parser().parse(TURTLE_DATA));
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
            const elements = [
                model.createElement('http://www.w3.org/ns/org#Organization'),
                model.createElement('http://www.w3.org/ns/org#FormalOrganization'),
                model.createElement('http://www.w3.org/ns/org#hasMember'),
                model.createElement('http://www.w3.org/ns/org#hasSubOrganization'),
                model.createElement('http://www.w3.org/ns/org#subOrganizationOf'),
                model.createElement('http://www.w3.org/ns/org#unitOf'),
            ];
            await Promise.all([
                model.requestElementData(elements.map(el => el.iri)),
                model.requestLinks(),
            ]);
            await performLayout({signal});
        }
    }, []);

    const [metadataProvider] = React.useState(() => new ExampleMetadataProvider());
    const [validationProvider] = React.useState(() => new ExampleValidationProvider());
    const [renameLinkProvider] = React.useState(() => new RenameSubclassOfProvider());

    return (
        <Reactodia.Workspace ref={onMount}
            defaultLayout={defaultLayout}
            metadataProvider={metadataProvider}
            validationProvider={validationProvider}
            renameLinkProvider={renameLinkProvider}>
            <Reactodia.DefaultWorkspace
                menu={<ExampleToolbarMenu />}
                visualAuthoring={{
                    inputResolver: (property, inputProps) => property === 'http://www.w3.org/2000/01/rdf-schema#comment'
                        ? <Reactodia.FormInputList {...inputProps} valueInput={MultilineTextInput} />
                        : undefined,
                }}
            />
        </Reactodia.Workspace>
    );
}

class RenameSubclassOfProvider extends Reactodia.RenameLinkToLinkStateProvider {
    override canRename(link: Reactodia.Link): boolean {
        return (
            link instanceof Reactodia.AnnotationLink ||
            link.typeId === 'http://www.w3.org/2000/01/rdf-schema#subClassOf'
        );
    }
}

function MultilineTextInput(props: Reactodia.FormInputSingleProps) {
    return <Reactodia.FormInputText {...props} multiline />;
}

mountOnLoad(<GraphAuthoringExample />);
