import * as React from 'react';
import * as N3 from 'n3';

import {
    Workspace, DefaultWorkspace, RdfDataProvider, GroupTemplate, PropertySuggestionHandler, PropertyScore,
    LinkTemplate, SemanticTypeStyles, OntologyLinkTemplates, delay,
} from '../src/index';

import { ExampleMetadataApi, ExampleValidationApi } from './resources/exampleMetadataApi';
import { mountOnLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './resources/common';

const TURTLE_DATA = require('./resources/orgOntology.ttl');

const CUSTOM_LINK_LABEL_IRI = 'urn:example:custom-link-label';
const EDITABLE_LINK_TEMPLATE: LinkTemplate = {
    renderLink: (data, state, factory) => {
        let editedLabel: string | undefined;
        if (
            state &&
            Object.prototype.hasOwnProperty.call(state, CUSTOM_LINK_LABEL_IRI)
        ) {
            const customLabel = state[CUSTOM_LINK_LABEL_IRI];
            if (typeof customLabel === 'string') {
                editedLabel = customLabel;
            }
        }
        return {
            label: editedLabel === undefined ? undefined : {
                label: [factory.literal(editedLabel)],
                text: {
                    fontStyle: 'italic',
                    fontWeight: 'normal',
                },
            },
        };
    },
    setLinkLabel: (link, label) => {
        link.setLinkState({
            ...link.linkState,
            [CUSTOM_LINK_LABEL_IRI]: label.length === 0 ? undefined : label,
        });
    },
};

function RdfExample() {
    const workspaceRef = React.useRef<Workspace | null>(null);

    React.useEffect(() => {
        const cancellation = new AbortController();
        const {model} = workspaceRef.current!.getContext();

        const dataProvider = new RdfDataProvider();
        dataProvider.addGraph(new N3.Parser().parse(TURTLE_DATA));
    
        const diagram = tryLoadLayoutFromLocalStorage();
        model.importLayout({
            diagram,
            dataProvider,
            validateLinks: true,
            signal: cancellation.signal,
        });
        return () => cancellation.abort();
    }, []);

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
            ref={workspaceRef}
            metadataApi={metadataApi}
            validationApi={validationApi}
            typeStyleResolver={SemanticTypeStyles}
            groupBy={[
                {linkType: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', linkDirection: 'in'},
            ]}
            onIriClick={({iri}) => window.open(iri)}>
            <DefaultWorkspace
                canvas={{
                    elementTemplateResolver: types => {
                        if (types.length === 0) {
                            // use group template only for classes
                            return GroupTemplate;
                        }
                        return undefined;
                    },
                    linkTemplateResolver: type => {
                        if (type === 'http://www.w3.org/2000/01/rdf-schema#subClassOf') {
                            return EDITABLE_LINK_TEMPLATE;
                        }
                        return OntologyLinkTemplates(type); 
                    },
                }}
                connectionsMenu={{suggestProperties}}
                toolbar={{
                    onSaveDiagram: () => {
                        const {model} = workspaceRef.current!.getContext();
                        const diagram = model.exportLayout();
                        window.location.hash = saveLayoutToLocalStorage(diagram);
                        window.location.reload();
                    },
                    onPersistChanges: () => {
                        const {editor} = workspaceRef.current!.getContext();
                        const state = editor.authoringState;
                        console.log('Authoring state:', state);
                    },
                }}
            />
        </Workspace>
    );
}

mountOnLoad(<RdfExample />);
