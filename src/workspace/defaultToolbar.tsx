import * as React from 'react';
import classnames from 'classnames';

import { useObservedProperty } from '../coreUtils/hooks';

import { CanvasContext } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';
import { CommandHistory } from '../diagram/history';
import { layoutForcePadded } from '../diagram/layout';

import { AuthoringState } from '../editor/authoringState';
import { EditorController } from '../editor/editorController';

import { WorkspaceContext } from './workspaceContext';

export interface DefaultToolbarProps {
    onSaveDiagram?: () => void;
    onPersistChanges?: () => void;
    /**
     * Set of languages to display diagram data.W
     */
    languages?: ReadonlyArray<WorkspaceLanguage>;
}

export interface WorkspaceLanguage {
    readonly code: string;
    readonly label: string;
}

const CLASS_NAME = 'ontodia-toolbar';
const DEFAULT_LANGUAGES = [
    {code: 'en', label: 'English'},
    {code: 'ru', label: 'Russian'},
];

export function DefaultToolbar(props: DefaultToolbarProps) {
    const {
        onSaveDiagram,
        onPersistChanges,
        languages = DEFAULT_LANGUAGES,
    } = props;
    const {
        model, view, editor,
        performLayout, exportSvg, exportPng, print,
    } = React.useContext(WorkspaceContext)!;
    const {canvas} = React.useContext(CanvasContext)!;

    const [cancellation] = React.useState(() => new AbortController());
    React.useEffect(() => {
        return () => cancellation.abort();
    }, []);

    return (
        <div className={CLASS_NAME}>
            <div className='ontodia-btn-group ontodia-btn-group-sm'>
                <SaveButtons editor={editor}
                    onSaveDiagram={onSaveDiagram}
                    onPersistChanges={onPersistChanges}
                />
                <HistoryButtons history={model.history} />
                <button type='button'
                    className={classnames(
                        `${CLASS_NAME}__clear-all-button`,
                        'ontodia-btn ontodia-btn-default'
                    )}
                    title='Clear All'
                    onClick={() => {
                        const batch = model.history.startBatch('Clear all');
                        editor.removeItems(model.elements);
                        batch.store();
                    }}>
                    Clear All
                </button>
                <button type='button'
                    className={classnames(
                        `${CLASS_NAME}__layout-button`,
                        'ontodia-btn ontodia-btn-default'
                    )}
                    title='Force layout'
                    onClick={() => performLayout({
                        canvas,
                        layoutFunction: layoutForcePadded,
                        animate: true,
                        signal: cancellation.signal,
                    })}>
                    Layout
                </button>
                <button type='button'
                    className={classnames(
                        `${CLASS_NAME}__export-button`,
                        'ontodia-btn ontodia-btn-default'
                    )}
                    title='Export diagram as PNG'
                    onClick={() => exportPng(canvas)}>
                    PNG
                </button>
                <button type='button'
                    className={classnames(
                        `${CLASS_NAME}__export-button`,
                        'ontodia-btn ontodia-btn-default'
                    )}
                    title='Export diagram as SVG'
                    onClick={() => exportSvg(canvas)}>
                    SVG
                </button>
                <button type='button'
                    className={classnames(
                        `${CLASS_NAME}__print-button`,
                        'ontodia-btn ontodia-btn-default'
                    )}
                    title='Print diagram'
                    onClick={() => print(canvas)}>
                    Print
                </button>
                {languages.length === 0 ? null : (
                    <span className={`${CLASS_NAME}__language-selector`}>
                        <label className='ontodia-label'><span>Data Language:</span></label>
                        <select value={view.getLanguage()}
                            onChange={e => view.setLanguage(e.currentTarget.value)}>
                            {languages.map(({code, label}) => <option key={code} value={code}>{label}</option>)}
                        </select>
                    </span>
                )}
            </div>
        </div>
    );
}

defineCanvasWidget(DefaultToolbar, element => ({element, attachment: 'viewport'}));

function SaveButtonsRaw(props: {
    editor: EditorController;
    onSaveDiagram?: () => void;
    onPersistChanges?: () => void;
}) {
    const {editor, onSaveDiagram, onPersistChanges} = props;
    const canPersistChanges = useObservedProperty(
        editor.events,
        'changeAuthoringState',
        () => !AuthoringState.isEmpty(editor.authoringState)
    );
    const canSaveDiagram = !canPersistChanges;

    return (
        <>
            {onSaveDiagram ? (
                <button type='button'
                    className={classnames(
                        `${CLASS_NAME}__save-button`,
                        'ontodia-btn ontodia-btn-primary'
                    )}
                    disabled={!canSaveDiagram}
                    onClick={() => onSaveDiagram()}>
                    Save diagram
                </button>
            ) : null}
            {onPersistChanges ? (
                <button type='button'
                    className={classnames(
                        `${CLASS_NAME}__save-button`,
                        'ontodia-btn ontodia-btn-default'
                    )}
                    disabled={!canPersistChanges}
                    onClick={() => onPersistChanges()}>
                    Save data
                </button>
            ) : null}
        </>
    );
}

const SaveButtons = React.memo(
    SaveButtonsRaw,
    (prevProps, nextProps) => !(
        nextProps.editor === prevProps.editor &&
        nextProps.onPersistChanges === prevProps.onPersistChanges &&
        nextProps.onSaveDiagram === prevProps.onSaveDiagram
    )
);

function HistoryButtonsRaw(props: {
    history: CommandHistory;
}) {
    const {history} = props;

    const {undoCommand, redoCommand} = useObservedProperty(
        history.events,
        'historyChanged',
        () => {
            const {undoStack, redoStack} = history;
            return {
                undoCommand: undoStack.length === 0
                    ? undefined : undoStack[undoStack.length - 1],
                redoCommand: history.redoStack.length === 0
                    ? undefined : redoStack[redoStack.length - 1],
            };
        },
        ({undoCommand, redoCommand}) => [undoCommand, redoCommand] as const
    );

    return (
        <>
            <button type='button'
                className={classnames(
                    `${CLASS_NAME}__undo-button`,
                    'ontodia-btn ontodia-btn-default'
                )}
                disabled={!undoCommand}
                title={
                    undoCommand && undoCommand.title
                        ? `Undo: ${undoCommand.title}`
                        : 'Undo last command'
                }
                onClick={() => history.undo()}
            />
            <button type='button'
                className={classnames(
                    `${CLASS_NAME}__redo-button`,
                    'ontodia-btn ontodia-btn-default'
                )}
                disabled={!redoCommand}
                title={
                    redoCommand && redoCommand.title
                        ? `Redo: ${redoCommand.title}`
                        : 'Redo last command'
                }
                onClick={() => history.redo()}
            />
        </>
    );
}

const HistoryButtons = React.memo(
    HistoryButtonsRaw,
    (prevProps, nextProps) => nextProps.history !== prevProps.history
);
