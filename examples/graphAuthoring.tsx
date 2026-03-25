import * as React from 'react';
import * as N3 from 'n3';

import * as Reactodia from '../src/workspace';
import * as Forms from '../src/forms';

import {
    ExampleMetadataProvider, ExampleValidationProvider, rdfs, example,
} from './resources/exampleMetadata';
import {
    ExampleToolbarMenu, mountOnLoad, tryLoadLayoutFromLocalStorage,
} from './resources/common';

import TURTLE_DATA from './resources/orgOntology.ttl?raw';

const Layouts = Reactodia.defineLayoutWorker(() => new Worker(
    new URL('../src/layout.worker.ts', import.meta.url),
    {type: 'module'}
));

function GraphAuthoringExample() {
    const {defaultLayout} = Reactodia.useWorker(Layouts);

    const {onMount} = Reactodia.useLoadedWorkspace(async ({context, signal}) => {
        const {model, editor, translation: t, performLayout} = context;
        editor.setAuthoringMode(true);

        const uploader = new Forms.MemoryFileUploader({
            factory: Reactodia.Rdf.DefaultDataFactory,
            disposeSignal: signal,
        });
        const dataProvider = new GraphDataProvider({}, uploader);
        try {
            dataProvider.addGraph(new N3.Parser().parse(TURTLE_DATA));
        } catch (err) {
            throw new Error('Error parsing RDF graph data', {cause: err});
        }
    
        const diagram = tryLoadLayoutFromLocalStorage();
        await model.importLayout({
            diagram,
            dataProvider,
            locale: new GraphLocaleProvider({model, translation: t}, uploader),
            validateLinks: true,
            signal,
        });

        if (!diagram) {
            const entities = [
                'http://www.w3.org/ns/org#Organization',
                'http://www.w3.org/ns/org#FormalOrganization',
                'http://www.w3.org/ns/org#hasMember',
                'http://www.w3.org/ns/org#hasSubOrganization',
                'http://www.w3.org/ns/org#subOrganizationOf',
                'http://www.w3.org/ns/org#unitOf',
            ];
            for (const entity of entities) {
                model.createElement(entity);
            }
            await model.requestData();
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
                    propertyEditor: options => (
                        <Reactodia.DefaultPropertyEditor options={options}
                            resolveInput={(property, inputProps) => {
                                if (property === Reactodia.schema.thumbnailUrl) {
                                    return <ThumbnailInput {...inputProps} />;
                                } else if (property === rdfs.comment) {
                                    return (
                                        <Forms.InputList {...inputProps}
                                            valueInput={MultilineTextInput}
                                        />
                                    );
                                } else if (property === example.workflowStatus) {
                                    return (
                                        <Forms.InputList {...inputProps}
                                            valueInput={WorkflowStatusInput}
                                        />
                                    );
                                }
                                return (
                                    <Forms.InputList {...inputProps}
                                        valueInput={Forms.InputText}
                                    />
                                );
                            }}
                        />
                    ),
                }}
                languages={[
                    {code: 'en', label: 'English'},
                    {code: 'es', label: 'Español'},
                    {code: 'fr', label: 'Français'},
                    {code: 'it', label: 'Italiano'},
                    {code: 'ja', label: '日本語'},
                ]}
            />
        </Reactodia.Workspace>
    );
}

class GraphDataProvider extends Reactodia.RdfDataProvider {
    constructor(
        options: Reactodia.RdfDataProviderOptions,
        readonly uploader: Forms.FileUploadProvider
    ) {
        super(options);
    }
}

class GraphLocaleProvider extends Reactodia.DefaultDataLocaleProvider {
    constructor(
        options: Reactodia.DefaultDataLocaleProviderOptions,
        private readonly uploader: Forms.FileUploadProvider
    ) {
        super(options);
    }

    async resolveAssetUrl(assetIri: string, options: { signal?: AbortSignal; }): Promise<string> {
        const {signal} = options;
        const resolved = await this.uploader.resolveFileUrl(assetIri, {signal});
        return resolved ?? assetIri;
    }
}

class RenameSubclassOfProvider extends Reactodia.RenameLinkToLinkStateProvider {
    override canRename(link: Reactodia.Link): boolean {
        return (
            link instanceof Reactodia.AnnotationLink ||
            link.typeId === 'http://www.w3.org/2000/01/rdf-schema#subClassOf'
        );
    }
}

function WorkflowStatusInput(props: Forms.InputSingleProps) {
    const {factory} = props;
    const variants = React.useMemo((): Forms.InputSelectVariant[] => [
        {value: factory.literal('draft'), label: 'draft'},
        {value: factory.literal('reviewed'), label: 'reviewed'},
        {value: factory.literal('published'), label: 'published'},
    ], []);
    return <Forms.InputSelect {...props} variants={variants} />;
}

function ThumbnailInput(props: Forms.InputMultiProps) {
    const {model} = Reactodia.useWorkspace();
    const provider = model.dataProvider instanceof GraphDataProvider
        ? model.dataProvider : undefined;
    const {data: fileMetadata, error: loadError} = Reactodia.useProvidedEntities(
        provider,
        props.values.filter(v => v.termType === 'NamedNode').map(v => v.value)
    );
    if (!provider) {
        return null;
    }
    return (
        <>
            <Forms.InputFile
                {...props}
                uploader={provider.uploader}
                fileAccept='.jpg,.jpeg,.png,.svg,.gif'
                allowDrop={item => /^image\//.test(item.type)}
                fileMetadata={fileMetadata}
            />
            {loadError ? (
                <Forms.InlineDiagnostic severity='error'
                    message='Failed to load thumbnail metadata'
                    error={loadError}
                />
            ) : null}
        </>
    );
}

function MultilineTextInput(props: Forms.InputSingleProps) {
    return <Forms.InputText {...props} multiline />;
}

mountOnLoad(<GraphAuthoringExample />);
