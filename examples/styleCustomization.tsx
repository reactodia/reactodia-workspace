import * as React from 'react';
import classnames from 'classnames';
import * as N3 from 'n3';

import {
    Workspace, DefaultWorkspace, RdfDataProvider, LinkTemplate, DefaultLinkPathTemplate,
} from '../src/index';

import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

import './styleCustomization.css';

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
    renderLink: props => (
        <DefaultLinkPathTemplate {...props}
            className={classnames(props.className, 'custom-diagram-link')}
        />
    ),
};

function StyleCustomizationExample() {
    const workspaceRef = React.useRef<Workspace | null>(null);

    React.useEffect(() => {
        const cancellation = new AbortController();
        const {model} = workspaceRef.current!.getContext();

        const dataProvider = new RdfDataProvider();
        dataProvider.addGraph(new N3.Parser().parse(TURTLE_DATA));

        const diagram = tryLoadLayoutFromLocalStorage();
        model.importLayout({
            diagram,
            dataProvider: dataProvider,
            validateLinks: true,
            signal: cancellation.signal,
        });

        return () => cancellation.abort();
    }, []);

    return (
        <Workspace
            ref={workspaceRef}
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
            onIriClick={({iri}) => window.open(iri)}>
            <DefaultWorkspace
                canvas={{
                    linkTemplateResolver: type => CUSTOM_LINK_TEMPLATE,
                }}
                toolbar={{
                    menu: <ExampleToolbarMenu />,
                }}
            />
        </Workspace>
    );
}

mountOnLoad(<StyleCustomizationExample />);
