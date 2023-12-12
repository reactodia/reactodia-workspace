import * as React from 'react';
import * as N3 from 'n3';

import {
    Workspace, DefaultWorkspace, RdfDataProvider, PropertySuggestionHandler, PropertyScore,
    ClassicTemplate, GroupTemplate, SemanticTypeStyles, OntologyLinkTemplates,
    DefaultLinkTemplate, DefaultLinkPathTemplate, EditableLinkLabel, delay,
} from '../src/index';

import { ExampleMetadataApi, ExampleValidationApi } from './resources/exampleMetadataApi';
import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

const TURTLE_DATA = require('./resources/orgOntology.ttl');

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
                        } else if (types.includes('http://www.w3.org/2002/07/owl#DatatypeProperty')) {
                            return ClassicTemplate;
                        }
                        return undefined;
                    },
                    linkTemplateResolver: type => {
                        if (type === 'http://www.w3.org/2000/01/rdf-schema#subClassOf') {
                            return {
                                ...DefaultLinkTemplate,
                                editableLabel: EDITABLE_LINK_LABEL,
                            };
                        }
                        return OntologyLinkTemplates(type); 
                    },
                }}
                connectionsMenu={{suggestProperties}}
                toolbar={{
                    menu: <ExampleToolbarMenu />
                }}
            />
        </Workspace>
    );
}

const CUSTOM_LINK_LABEL_IRI = 'urn:example:custom-link-label';
const EDITABLE_LINK_LABEL: EditableLinkLabel = {
    getLabel: link => {
        const {linkState} = link;
        if (
            linkState &&
            Object.prototype.hasOwnProperty.call(linkState, CUSTOM_LINK_LABEL_IRI)
        ) {
            const customLabel = linkState[CUSTOM_LINK_LABEL_IRI];
            if (typeof customLabel === 'string') {
                return customLabel;
            }
        }
        return undefined;
    },
    setLabel: (link, label) => {
        link.setLinkState({
            ...link.linkState,
            [CUSTOM_LINK_LABEL_IRI]: label.length === 0 ? undefined : label,
        });
    },
};

mountOnLoad(<RdfExample />);
