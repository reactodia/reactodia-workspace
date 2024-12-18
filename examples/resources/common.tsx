import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { saveAs } from 'file-saver';

import * as Reactodia from '../../src/workspace';

function onPageLoad(callback: (container: HTMLDivElement) => void) {
    document.addEventListener('DOMContentLoaded', () => {
        const container = document.createElement('div');
        container.id = 'root';
        document.body.appendChild(container);
        callback(container);
    });
}

export function mountOnLoad(node: React.ReactElement): void {
    onPageLoad(container => {
        ReactDOM.render(node, container);
    });
}

export function ExampleToolbarMenu() {
    const {model, editor, overlay} = Reactodia.useWorkspace();
    return (
        <>
            <Reactodia.ToolbarActionOpen
                fileAccept='.json'
                onSelect={async file => {
                    const preloadedElements = new Map<Reactodia.ElementIri, Reactodia.ElementModel>();
                    for (const element of model.elements) {
                        if (element instanceof Reactodia.EntityElement) {
                            preloadedElements.set(element.iri, element.data);
                        }
                    }

                    const task = overlay.startTask({title: 'Importing a layout from file'});
                    try {
                        const json = await file.text();
                        const diagramLayout = JSON.parse(json);
                        await model.importLayout({
                            dataProvider: model.dataProvider,
                            diagram: diagramLayout,
                            preloadedElements,
                            validateLinks: true,
                        });
                    } catch (err) {
                        task.setError(new Error(
                            'Failed to load specified file with a diagram layout.',
                            {cause: err}
                        ));
                    } finally {
                        task.end();
                    }
                }}>
                Open diagram from file
            </Reactodia.ToolbarActionOpen>
            <Reactodia.ToolbarActionSave mode='layout'
                onSelect={() => {
                    const diagramLayout = model.exportLayout();
                    const layoutString = JSON.stringify(diagramLayout);
                    const blob = new Blob([layoutString], {type: 'application/json'});
                    const timestamp = new Date().toISOString().replaceAll(/[Z\s:-]/g, '');
                    saveAs(blob, `reactodia-diagram-${timestamp}.json`);
                }}>
                Save diagram to file
            </Reactodia.ToolbarActionSave>
            <Reactodia.ToolbarActionSave mode='layout'
                onSelect={() => {
                    const diagram = model.exportLayout();
                    const layoutKey = saveLayoutToLocalStorage(diagram);
                    setHashQueryParam('local-diagram', layoutKey);
                    window.location.reload();
                }}>
                Save diagram to local storage
            </Reactodia.ToolbarActionSave>
            {editor.inAuthoringMode ? (
                <Reactodia.ToolbarActionSave mode='authoring'
                    onSelect={() => {
                        const state = editor.authoringState;
                        // eslint-disable-next-line no-console
                        console.log('Authoring state:', state);
                        alert('Please check browser console for result');
                    }}>
                    Persist changes to data
                </Reactodia.ToolbarActionSave>
            ) : null}
            <Reactodia.ToolbarActionClearAll />
            <Reactodia.ToolbarActionExport kind='exportRaster' />
            <Reactodia.ToolbarActionExport kind='exportSvg' />
            <Reactodia.ToolbarActionExport kind='print' />
        </>
    );
}

export function getHashQuery(): URLSearchParams | undefined {
    const hash = window.location.hash;
    if (hash.length > 1 && hash.includes('=')) {
        try {
            const hashQuery = new URLSearchParams(hash.substring(1));
            return hashQuery;
        } catch (e) {
            /* ignore */
        }
    }
    return undefined;
}

export function setHashQueryParam(paramName: string, paramValue: string | null): void {
    const hashQuery = getHashQuery() ?? new URLSearchParams();
    if (paramValue) {
        hashQuery.set(paramName, paramValue);
    } else {
        hashQuery.delete(paramName);
    }
    window.location.hash = hashQuery.toString();
}

export function tryLoadLayoutFromLocalStorage(): Reactodia.SerializedDiagram | undefined {
    let layoutKey: string | null = null;

    const hashQuery = getHashQuery();
    if (hashQuery) {
        layoutKey = hashQuery.get('local-diagram');
    } else if (window.location.hash.length > 1) {
        layoutKey = window.location.hash.substring(1);
    }

    if (layoutKey) {
        try {
            const unparsedLayout = localStorage.getItem(layoutKey);
            const entry = unparsedLayout && JSON.parse(unparsedLayout);
            return entry;
        } catch (e) {
            /* ignore */
        }
    }
    return undefined;
}

function saveLayoutToLocalStorage(diagram: Reactodia.SerializedDiagram): string {
    const randomKey = Math.floor((1 + Math.random()) * 0x10000000000)
        .toString(16).substring(1);
    localStorage.setItem(randomKey, JSON.stringify(diagram));
    return randomKey;
}
