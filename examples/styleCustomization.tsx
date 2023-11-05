import * as N3 from 'n3';

import { Workspace, RdfDataProvider, LinkTemplate, LinkStyle } from '../src/index';

import { mountOnLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './resources/common';

const CERTIFICATE_ICON = require('@vscode/codicons/src/icons/symbol-class.svg');
const COG_ICON = require('@vscode/codicons/src/icons/gear.svg');

const TURTLE_DATA = require('./resources/orgOntology.ttl');

const CUSTOM_LINK_TEMPLATE: LinkTemplate = {
    markerSource: {
        fill: '#4b4a67',
        stroke: '#4b4a67',
        d: 'M0,3a3,3 0 1,0 6,0a3,3 0 1,0 -6,0',
        width: 6,
        height: 6,
    },
    markerTarget: {
        fill: '#4b4a67',
        stroke: '#4b4a67',
        d: 'm 20,5.88 -10.3,-5.95 0,5.6 -9.7,-5.6 0,11.82 9.7,-5.53 0,5.6 z',
        width: 20,
        height: 12,
    },
    renderLink: (): LinkStyle => ({
        connection: {
            stroke: '#3c4260',
            strokeWidth: 2,
        },
        label: {
            text: {fill: '#3c4260'},
        },
    }),
};

function StyleCustomizationExample() {
    function onWorkspaceMounted(workspace: Workspace | null) {
        if (!workspace) {
            return;
        }

        const dataProvider = new RdfDataProvider();
        dataProvider.addGraph(new N3.Parser().parse(TURTLE_DATA));

        const diagram = tryLoadLayoutFromLocalStorage();
        workspace.getModel().importLayout({diagram, dataProvider});
    }

    return (
        <Workspace
            ref={onWorkspaceMounted}
            onSaveDiagram={workspace => {
                const diagram = workspace.getModel().exportLayout();
                window.location.hash = saveLayoutToLocalStorage(diagram);
                window.location.reload();
            }}
            viewOptions={{
                onIriClick: ({iri}) => window.open(iri),
            }}
            typeStyleResolver={types => {
                if (types.indexOf('http://www.w3.org/2000/01/rdf-schema#Class') !== -1) {
                    return {icon: CERTIFICATE_ICON};
                } else if (types.indexOf('http://www.w3.org/2002/07/owl#Class') !== -1) {
                    return {icon: CERTIFICATE_ICON};
                } else if (types.indexOf('http://www.w3.org/2002/07/owl#ObjectProperty') !== -1) {
                    return {icon: COG_ICON};
                } else if (types.indexOf('http://www.w3.org/2002/07/owl#DatatypeProperty') !== -1) {
                    return {color: '#046380'};
                } else {
                    return undefined;
                }
            }}
            linkTemplateResolver={type => CUSTOM_LINK_TEMPLATE}
        />
    );
}

mountOnLoad(<StyleCustomizationExample />);
