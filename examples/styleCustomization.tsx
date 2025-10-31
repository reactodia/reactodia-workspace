import * as React from 'react';
import * as N3 from 'n3';

import * as Reactodia from '../src/workspace';

import { ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage } from './resources/common';

const BOOK_ICON = require('@vscode/codicons/src/icons/book.svg') as string;
const CERTIFICATE_ICON = require('@vscode/codicons/src/icons/symbol-class.svg') as string;
const COG_ICON = require('@vscode/codicons/src/icons/gear.svg') as string;

const EXAMPLE_DIAGRAM = require('./resources/exampleDiagram.json') as Reactodia.SerializedDiagram;
const TURTLE_DATA = require('./resources/orgOntology.ttl') as string;

const Layouts = Reactodia.defineLayoutWorker(() => new Worker('layout.worker.js'));

function StyleCustomizationExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);

    const {onMount} = Reactodia.useLoadedWorkspace(async ({context, signal}) => {
        const {model} = context;

        const dataProvider = new Reactodia.RdfDataProvider();
        dataProvider.addGraph(new N3.Parser().parse(TURTLE_DATA));

        const diagram = tryLoadLayoutFromLocalStorage() ?? EXAMPLE_DIAGRAM;
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
                if (types.includes('http://www.w3.org/2000/01/rdf-schema#Class')) {
                    return {icon: CERTIFICATE_ICON, iconMonochrome: true};
                } else if (types.includes('http://www.w3.org/2002/07/owl#Class')) {
                    return {icon: CERTIFICATE_ICON, iconMonochrome: true};
                } else if (types.includes('http://www.w3.org/2002/07/owl#ObjectProperty')) {
                    return {icon: COG_ICON, iconMonochrome: true};
                } else if (types.includes('http://www.w3.org/2002/07/owl#DatatypeProperty')) {
                    return {color: '#00b9f2'};
                } else {
                    return undefined;
                }
            }}>
            <Reactodia.DefaultWorkspace
                canvas={{
                    elementTemplateResolver: (types, element) => {
                        if (
                            types.includes('http://www.w3.org/2002/07/owl#DatatypeProperty') ||
                            types.includes('http://www.w3.org/2002/07/owl#AnnotationProperty')
                        ) {
                            return PropertyTemplate;
                        }
                        return undefined;
                    },
                    linkTemplateResolver: type => {
                        if (!type.startsWith('urn:reactodia:')) {
                            return DoubleArrowLinkTemplate;
                        }
                    },
                }}
                menu={<ExampleToolbarMenu />}>
                <BookDecorations />
            </Reactodia.DefaultWorkspace>
        </Reactodia.Workspace>
    );
}

function BookDecorations() {
    const {model} = Reactodia.useCanvas();

    // Update decorations when graph content changes
    Reactodia.useSyncStore(
        Reactodia.useFrameDebouncedStore(
            Reactodia.useEventStore(model.events, 'changeCells')
        ),
        () => model.cellsVersion
    );

    return model.elements
        .filter(element => element instanceof Reactodia.EntityElement)
        .map(element => <BookDecoration key={element.id} target={element} />);
}

function BookDecoration(props: { target: Reactodia.EntityElement }) {
    const {target} = props;

    const data = Reactodia.useObservedProperty(
        target.events,
        'changeData',
        () => target.data.types.includes('http://www.w3.org/2002/07/owl#Class') ? target.data : null
    );

    return data ? (
        <Reactodia.ElementDecoration target={target}>
            <div
                style={{
                    mask: `url(${BOOK_ICON}) 0px 0px / contain no-repeat`,
                    backgroundColor: 'orange',
                    height: '36px',
                    width: '36px',
                    position: 'absolute',
                    top: '50%',
                    left: '-10px',
                    transform: 'translate(-100%,-50%)',
                }}
            />
        </Reactodia.ElementDecoration>
    ) : null;
}

const PropertyTemplate: Reactodia.ElementTemplate = {
    ...Reactodia.RoundTemplate,
    renderElement: props => (
        <>
            <Reactodia.RoundEntity {...props} />
            {props.element instanceof Reactodia.EntityElement
                ? <ElementLabelDecoration target={props.element} />
                : null}
        </>
    ),
};

function ElementLabelDecoration(props: { target: Reactodia.EntityElement }) {
    const {target} = props;
    const {model} = Reactodia.useWorkspace();
    const data = Reactodia.useObservedProperty(target.events, 'changeData', () => target.data);
    const label = model.locale.formatEntityLabel(data, model.language);
    return (
        <Reactodia.ElementDecoration target={target}>
            <div data-element-id={target.id}
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: '50%',
                    transform: 'translate(-50%,100%)',
                    color: 'cornflowerblue',
                    cursor: 'move',
                }}>
                {label}
            </div>
        </Reactodia.ElementDecoration>
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
    renderLink: props => (
        <Reactodia.DefaultLink {...props}
            pathProps={{stroke: '#747da8', strokeWidth: 2}}
            primaryLabelProps={{
                style: {color: '#747da8'},
            }}
        />
    ),
};

mountOnLoad(<StyleCustomizationExample />);
