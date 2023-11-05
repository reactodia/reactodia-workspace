import * as React from 'react';
import classnames from 'classnames';

import { CommandHistory, Command } from '../diagram/history';
import { EventObserver } from '../viewUtils/events';

import { WorkspaceLanguage } from './workspace';

export interface ToolbarProps {
    history?: CommandHistory;
    canSaveDiagram?: boolean;
    onSaveDiagram?: () => void;
    canPersistChanges?: boolean;
    onPersistChanges?: () => void;
    onForceLayout?: () => void;
    onClearAll?: () => void;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onZoomToFit?: () => void;
    onExportSVG?: (fileName?: string) => void;
    onExportPNG?: (fileName?: string) => void;
    onPrint?: () => void;
    languages?: ReadonlyArray<WorkspaceLanguage>;
    selectedLanguage?: string;
    onChangeLanguage?: (language: string) => void;
    hidePanels?: boolean;
}

const CLASS_NAME = 'ontodia-toolbar';

export class DefaultToolbar extends React.Component<ToolbarProps, {}> {
    render() {
        const {history} = this.props;
        return (
            <div className={CLASS_NAME}>
                <div className='ontodia-btn-group ontodia-btn-group-sm'>
                    {this.renderSaveDiagramButton()}
                    {this.renderPersistAuthoredChangesButton()}
                    {history ? <HistoryButtons history={history} /> : null}
                    {this.props.onClearAll ? (
                        <button type='button'
                            className={classnames(
                                `${CLASS_NAME}__clear-all-button`,
                                'ontodia-btn ontodia-btn-default'
                            )}
                            title='Clear All' onClick={this.props.onClearAll}>
                            Clear All
                        </button>
                    ) : null}
                    <button type='button'
                        className={classnames(
                            `${CLASS_NAME}__layout-button`,
                            'ontodia-btn ontodia-btn-default'
                        )}
                        title='Force layout' onClick={this.props.onForceLayout}>
                         Layout
                    </button>
                    <button type='button'
                        className={classnames(
                            `${CLASS_NAME}__export-button`,
                            'ontodia-btn ontodia-btn-default'
                        )}
                        title='Export diagram as PNG' onClick={this.onExportPNG}>
                        PNG
                    </button>
                    <button type='button'
                        className={classnames(
                            `${CLASS_NAME}__export-button`,
                            'ontodia-btn ontodia-btn-default'
                        )}
                        title='Export diagram as SVG' onClick={this.onExportSVG}>
                        SVG
                    </button>
                    <button type='button'
                        className={classnames(
                            `${CLASS_NAME}__print-button`,
                            'ontodia-btn ontodia-btn-default'
                        )}
                        title='Print diagram' onClick={this.props.onPrint}>
                        Print
                    </button>
                    {this.renderLanguages()}
                </div>
            </div>
        );
    }

    private renderSaveDiagramButton() {
        if (!this.props.onSaveDiagram) { return null; }
        return (
            <button type='button'
                className={classnames(
                    `${CLASS_NAME}__save-button`,
                    'ontodia-btn ontodia-btn-primary'
                )}
                disabled={this.props.canSaveDiagram === false}
                onClick={this.props.onSaveDiagram}>
                Save diagram
            </button>
        );
    }

    private renderPersistAuthoredChangesButton() {
        if (!this.props.onPersistChanges) { return null; }
        return (
            <button type='button'
                className={classnames(
                    `${CLASS_NAME}__save-button`,
                    'ontodia-btn ontodia-btn-success'
                )}
                disabled={this.props.canPersistChanges === false}
                onClick={this.props.onPersistChanges}>
                Save data
            </button>
        );
    }

    private onExportSVG = () => {
        this.props.onExportSVG?.();
    }

    private onExportPNG = () => {
        this.props.onExportPNG?.();
    }

    private renderLanguages() {
        const {selectedLanguage, languages} = this.props;
        if (!(languages && languages.length > 0)) { return null; }

        return (
            <span className={`${CLASS_NAME}__language-selector`}>
                <label className='ontodia-label'><span>Data Language:</span></label>
                <select value={selectedLanguage} onChange={this.onChangeLanguage}>
                    {languages.map(({code, label}) => <option key={code} value={code}>{label}</option>)}
                </select>
            </span>
        );
    }

    private onChangeLanguage = (event: React.SyntheticEvent<HTMLSelectElement>) => {
        const value = event.currentTarget.value;
        this.props.onChangeLanguage?.(value);
    }
}

function HistoryButtonsRaw(props: {
    history: CommandHistory;
}) {
    const {history} = props;

    const [version, setVersion] = React.useState(0);
    React.useEffect(() => {
        const observer = new EventObserver();
        observer.listen(history.events, 'historyChanged', e => {
            setVersion(v => v + 1);
        });
        return () => observer.stopListening();
    }, [history]);

    let undoCommand: Command | undefined;
    let redoCommand: Command | undefined;
    if (history) {
        undoCommand = history.undoStack.length === 0
            ? undefined : history.undoStack[history.undoStack.length - 1];
        redoCommand = history.redoStack.length === 0
            ? undefined : history.redoStack[history.redoStack.length - 1];
    }

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
