import * as React from 'react';
import * as N3 from 'n3';

import * as Reactodia from '../src/workspace';

import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

const CERTIFICATE_ICON = require('@vscode/codicons/src/icons/symbol-class.svg');
const COG_ICON = require('@vscode/codicons/src/icons/gear.svg');

const TURTLE_DATA = require('./resources/orgOntology.ttl');

const CUSTOM_LINK_TEMPLATE: Reactodia.LinkTemplate = {
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
        <Reactodia.DefaultLinkPathTemplate {...props}
            pathProps={{stroke: '#3c4260', strokeWidth: 2}}
            primaryLabelProps={{
                textStyle: {fill: '#3c4260'},
            }}
        />
    ),
};

const Layouts = Reactodia.defineLayoutWorker(() => new Worker('layout.worker.js'));

function StyleCustomizationExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);

    const {onMount} = Reactodia.useLoadedWorkspace(async ({context, signal}) => {
        const {model} = context;

        const dataProvider = new Reactodia.RdfDataProvider();
        dataProvider.addGraph(new N3.Parser().parse(TURTLE_DATA));

        const diagram = tryLoadLayoutFromLocalStorage();
        await model.importLayout({
            diagram,
            dataProvider: dataProvider,
            validateLinks: true,
            signal,
        });
    }, []);

    return (
        <Reactodia.Workspace ref={onMount}
            defaultLayout={defaultLayout}
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
            <Reactodia.DefaultWorkspace
                canvas={{
                    linkTemplateResolver: type => CUSTOM_LINK_TEMPLATE,
                }}
                menu={<ExampleToolbarMenu />}
            />
        </Reactodia.Workspace>
    );
}

mountOnLoad(<StyleCustomizationExample />);
