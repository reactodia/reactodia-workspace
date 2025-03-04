import * as React from 'react';
import * as N3 from 'n3';

import * as Reactodia from '../src/workspace';

import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

const CERTIFICATE_ICON = require('@vscode/codicons/src/icons/symbol-class.svg');
const COG_ICON = require('@vscode/codicons/src/icons/gear.svg');

const TURTLE_DATA = require('./resources/orgOntology.ttl');

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
                    return {color: '#00b9f2'};
                } else {
                    return undefined;
                }
            }}
            onIriClick={({iri}) => window.open(iri)}>
            <Reactodia.DefaultWorkspace
                canvas={{
                    elementTemplateResolver: (types, element) => {
                        if (types.includes('http://www.w3.org/2002/07/owl#DatatypeProperty')) {
                            return RoundEntityTemplate;
                        }
                        return undefined;
                    },
                    linkTemplateResolver: type => DoubleArrowLinkTemplate,
                }}
                menu={<ExampleToolbarMenu />}
            />
        </Reactodia.Workspace>
    );
}

const RoundEntityTemplate: Reactodia.ElementTemplate = {
    shape: 'ellipse',
    renderElement: props => <RoundEntity {...props} />,
};

function RoundEntity(props: Reactodia.TemplateProps) {
    const {element} = props;
    const {model, translation: t, getElementTypeStyle} = Reactodia.useWorkspace();

    const data = element instanceof Reactodia.EntityElement ? element.data : undefined;
    if (!data) {
        return null;
    }

    const label = t.formatLabel(data.label, data.id, model.language);
    const {color} = getElementTypeStyle(data.types);
    return (
        <div
            style={{
                width: 120,
                height: 120,
                background: 'var(--reactodia-element-background-color)',
                border: '10px solid',
                borderColor: color,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
            {label}
        </div>
    );
}

const DoubleArrowLinkTemplate: Reactodia.LinkTemplate = {
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
    spline: 'smooth',
    renderLink: props => (
        <Reactodia.DefaultLinkPathTemplate {...props}
            pathProps={{stroke: '#747da8', strokeWidth: 2}}
            primaryLabelProps={{
                textStyle: {fill: '#747da8'},
            }}
        />
    ),
};

mountOnLoad(<StyleCustomizationExample />);
