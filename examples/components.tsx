import * as React from 'react';
import * as N3 from 'n3';

import * as Reactodia from '../src/workspace';
import {
    SearchInput, useSearchInputStore,
} from '../src/widgets/utility/searchInput';
import { EntitySelect } from '../src/widgets/instancesSearch/entitySelect';
import {
    SchemaTypeSelect, useProvidedSchemaTypes,
} from '../src/widgets/instancesSearch/schemaTypeSelect';

import { mountOnLoad } from './resources/common';

const GRAPH_DATA =
    'https://raw.githubusercontent.com/reactodia/reactodia-workspace/' +
    'master/examples/resources/orgOntology.ttl';

const Layouts = Reactodia.defineLayoutWorker(() => new Worker(
    new URL('../src/layout.worker.ts', import.meta.url),
    {type: 'module'}
));

function ComponentsExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);
    const [workspace] = React.useState(() => Reactodia.createWorkspace({
        defaultLayout,
    }));

    const {onMount} = Reactodia.useLoadedWorkspace(async ({context, signal}) => {
        const {model} = context;
        // Fetch graph data to use as underlying data source
        const response = await fetch(GRAPH_DATA, {signal});
        const graphData = new N3.Parser().parse(await response.text());
        const dataProvider = new Reactodia.RdfDataProvider({acceptBlankNodes: false});
        dataProvider.addGraph(graphData);

        // Create empty diagram and put owl:Class entities with links between them
        await model.createNewDiagram({dataProvider, signal});
    }, []);

    return (
        <Reactodia.WorkspaceProvider workspace={workspace}
            onMount={onMount}>
            <Reactodia.WorkspaceRoot style={{margin: 20}}>
                <h2>Storybook-like internal playground</h2>
                <h3>Input sizing</h3>
                <InputSizing />
            </Reactodia.WorkspaceRoot>
        </Reactodia.WorkspaceProvider>
    );
}

function InputSizing() {
    const {model} = Reactodia.useWorkspace();
    const dataProvider = Reactodia.useObservedProperty(
        model.events,
        'loadingSuccess',
        () => model.dataProvider
    );
    
    const store = useSearchInputStore({initialValue: 'Test value!'});

    const [entityIris, setEntityIris] = React.useState((): readonly Reactodia.ElementIri[] => [
        'http://www.w3.org/ns/org#Organization',
    ]);
    const {data: entityData} = Reactodia.useProvidedEntities(dataProvider, entityIris);
    const entities = React.useMemo(() => Array.from(entityData.values()), [entityData]);

    const [elementTypeIris, setElementTypeIris] =
        React.useState<readonly Reactodia.ElementTypeIri[]>(
            ['http://www.w3.org/ns/org#ChangeEvent']
        );
    const elementTypes = useProvidedSchemaTypes('elementType', elementTypeIris);

    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: 5, margin: 10}}>
            <SearchInput store={store} sizeVariant='m' />
            <SearchInput store={store} sizeVariant='s' />
            <EntitySelect dataProvider={dataProvider}
                selected={entities}
                setSelected={update => setEntityIris(update(entities).map(m => m.id))}
                sizeVariant='m'
            />
            <EntitySelect dataProvider={dataProvider}
                selected={entities}
                setSelected={update => setEntityIris(update(entities).map(m => m.id))}
                sizeVariant='s'
            />
            <SchemaTypeSelect typeKind='elementType'
                selected={elementTypes}
                setSelected={next => setElementTypeIris(next.map(item => item.id))}
                sizeVariant='m'
            />
            <SchemaTypeSelect typeKind='elementType'
                selected={elementTypes}
                setSelected={next => setElementTypeIris(next.map(item => item.id))}
                sizeVariant='s'
            />
        </div>
    );
}

mountOnLoad(<ComponentsExample />);
