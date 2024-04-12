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
    const {model, editor} = Reactodia.useWorkspace();
    return (
        <>
            <Reactodia.ToolbarActionOpen
                fileAccept='.json'
                onSelect={async file => {
                    const preloadedElements = new Map<Reactodia.ElementIri, Reactodia.ElementModel>();
                    for (const element of model.elements.filter(Reactodia.EntityElement.is)) {
                        preloadedElements.set(element.iri, element.data);
                    }

                    const json = await file.text();
                    try {
                        const diagramLayout = JSON.parse(json);
                        await model.importLayout({
                            dataProvider: model.dataProvider,
                            diagram: diagramLayout,
                            preloadedElements,
                        });
                    } catch (err) {
                        alert('Failed to load specified file with a diagram layout.');
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
                    window.location.hash = saveLayoutToLocalStorage(diagram);
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

export function tryLoadLayoutFromLocalStorage(): Reactodia.SerializedDiagram | undefined {
    if (window.location.hash.length > 1) {
        try {
            const key = window.location.hash.substring(1);
            const unparsedLayout = localStorage.getItem(key);
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
