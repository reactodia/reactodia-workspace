import * as React from 'react';
import * as N3 from 'n3';

import {
    Workspace, RdfDataProvider, GroupTemplate, PropertySuggestionHandler, PropertyScore,
    delay,
} from '../src/index';

import { ExampleMetadataApi, ExampleValidationApi } from './resources/exampleMetadataApi';
import { mountOnLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './resources/common';

const data = require('./resources/orgOntology.ttl');

function RdfExample() {
    function onWorkspaceMounted(workspace: Workspace | null) {
        if (!workspace) {
            return;
        }
        const dataProvider = new RdfDataProvider({
            acceptBlankNodes: false,
        });
        dataProvider.addGraph(new N3.Parser().parse(data));
    
        const diagram = tryLoadLayoutFromLocalStorage();
        workspace.getModel().importLayout({
            diagram,
            validateLinks: true,
            dataProvider,
        });
    }
    const [metadataApi] = React.useState(() => new ExampleMetadataApi());
    const [validationApi] = React.useState(() => new ExampleValidationApi());
    const suggestProperties = React.useCallback<PropertySuggestionHandler>(params => {
        let maxLength = 0;
        for (const iri of params.properties) {
            maxLength = Math.max(maxLength, iri.length);
        }
        const scores = params.properties.map((p): PropertyScore => ({
            propertyIri: p,
            score: 1 - p.length / maxLength,
        }));
        return delay(300).then(() => scores);
    }, []);
    return (
        <Workspace
            ref={onWorkspaceMounted}
            onSaveDiagram={workspace => {
                const diagram = workspace.getModel().exportLayout();
                window.location.hash = saveLayoutToLocalStorage(diagram);
                window.location.reload();
            }}
            onPersistChanges={workspace => {
                const state = workspace.getEditor().authoringState;
                // tslint:disable-next-line:no-console
                console.log('Authoring state:', state);
            }}
            metadataApi={metadataApi}
            validationApi={validationApi}
            viewOptions={{
                onIriClick: ({iri}) => window.open(iri),
                groupBy: [
                    {linkType: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', linkDirection: 'in'},
                ],
                suggestProperties,
            }}
            elementTemplateResolver={types => {
                if (types.length === 0) {
                    // use group template only for classes
                    return GroupTemplate;
                }
                return undefined;
            }}
        />
    );
}

mountOnLoad(<RdfExample />);
