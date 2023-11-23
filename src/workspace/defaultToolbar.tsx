import * as React from 'react';
import classnames from 'classnames';

import { useObservedProperty } from '../coreUtils/hooks';

import { CanvasContext } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';
import { CommandHistory } from '../diagram/history';
import { layoutForcePadded } from '../diagram/layout';
import { DiagramModel } from '../diagram/model';
import { DiagramView } from '../diagram/view';

import { AuthoringState } from '../editor/authoringState';
import { EditorController } from '../editor/editorController';

import { HamburgerMenu, HamburgerMenuItem } from '../widgets/hamburgerMenu';

import { WorkspaceContext } from './workspaceContext';

export interface DefaultToolbarProps {
    onSaveDiagram?: () => void;
    onPersistChanges?: () => void;
    /**
     * Set of languages to display diagram data.
     */
    languages?: ReadonlyArray<WorkspaceLanguage>;
}

export interface WorkspaceLanguage {
    readonly code: string;
    readonly label: string;
}

const CLASS_NAME = 'reactodia-toolbar';

export function DefaultToolbar(props: DefaultToolbarProps) {
    const {
        onSaveDiagram,
        onPersistChanges,
        languages = [],
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
            <HamburgerMenu className={`${CLASS_NAME}__menu`}
                title='Open main menu'>
                <SaveButtons editor={editor}
                    onSaveDiagram={onSaveDiagram}
                    onPersistChanges={onPersistChanges}
                />
                <HamburgerMenuItem
                    className={classnames(
                        `${CLASS_NAME}__clear-all-button`,
                        'reactodia-btn reactodia-btn-default'
                    )}
                    title='Remove all elements and links from the diagram'
                    onClick={() => {
                        const batch = model.history.startBatch('Clear all');
                        editor.removeItems([...model.elements]);
                        batch.store();
                    }}>
                    Clear All
                </HamburgerMenuItem>
                <HamburgerMenuItem
                    className={classnames(
                        `${CLASS_NAME}__export-button`,
                        'reactodia-btn reactodia-btn-default'
                    )}
                    title='Export the diagram as a PNG image'
                    onClick={() => exportPng(canvas)}>
                    Export as PNG
                </HamburgerMenuItem>
                <HamburgerMenuItem
                    className={classnames(
                        `${CLASS_NAME}__export-button`,
                        'reactodia-btn reactodia-btn-default'
                    )}
                    title='Export the diagram as an SVG image'
                    onClick={() => exportSvg(canvas)}>
                    Export as SVG
                </HamburgerMenuItem>
                <HamburgerMenuItem
                    className={classnames(
                        `${CLASS_NAME}__print-button`,
                        'reactodia-btn reactodia-btn-default'
                    )}
                    title='Print the diagram'
                    onClick={() => print(canvas)}>
                    Print
                </HamburgerMenuItem>
            </HamburgerMenu>
            <div className={`${CLASS_NAME}__quick-access-group reactodia-btn-group reactodia-btn-group-sm`}>
                <HistoryButtons history={model.history} />
                <LayoutButton model={model}
                    onClick={() => performLayout({
                        canvas,
                        layoutFunction: layoutForcePadded,
                        animate: true,
                        signal: cancellation.signal,
                    })}
                />
                <LanguageSelector view={view}
                    languages={languages}
                />
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
                <HamburgerMenuItem
                    className={classnames(
                        `${CLASS_NAME}__save-button`,
                        'reactodia-btn reactodia-btn-default'
                    )}
                    disabled={!canSaveDiagram}
                    onClick={() => onSaveDiagram()}>
                    Save diagram
                </HamburgerMenuItem>
            ) : null}
            {onPersistChanges ? (
                <HamburgerMenuItem
                    className={classnames(
                        `${CLASS_NAME}__save-button`,
                        'reactodia-btn reactodia-btn-default'
                    )}
                    disabled={!canPersistChanges}
                    onClick={() => onPersistChanges()}>
                    Save data
                </HamburgerMenuItem>
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
                    'reactodia-btn reactodia-btn-default'
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
                    'reactodia-btn reactodia-btn-default'
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

function LayoutButton(props: {
    model: DiagramModel;
    onClick: () => void;
}) {
    const {model, onClick} = props;
    const elementCount = useObservedProperty(
        model.events,
        'changeCells',
        () => model.elements.length
    );
    return (
        <button type='button'
            className={classnames(
                `${CLASS_NAME}__layout-button`,
                'reactodia-btn reactodia-btn-default'
            )}
            title='Layout diagram using force-directed algorithm'
            disabled={elementCount === 0}
            onClick={onClick}>
            Layout
        </button>
    );
}

function LanguageSelector(props: {
    view: DiagramView;
    languages: ReadonlyArray<WorkspaceLanguage>;
}) {
    const {view, languages} = props;
    const currentLanguage = useObservedProperty(
        view.events,
        'changeLanguage',
        () => view.getLanguage()
    );
    return languages.length === 0 ? null : (
        <div className={`${CLASS_NAME}__language-selector`}
            title='Select language for the data (labels, properties, etc)'>
            <label htmlFor='reactodia-language-selector' />
            <select id='reactodia-language-selector'
                value={currentLanguage}
                onChange={e => view.setLanguage(e.currentTarget.value)}>
                {languages.map(({code, label}) => <option key={code} value={code}>{label}</option>)}
            </select>
        </div>
    );
}
