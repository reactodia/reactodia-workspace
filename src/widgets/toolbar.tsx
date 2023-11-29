import * as React from 'react';
import classnames from 'classnames';
import { saveAs } from 'file-saver';

import { useObservedProperty } from '../coreUtils/hooks';

import { CanvasContext, ExportRasterOptions } from '../diagram/canvasApi';
import { defineCanvasWidget } from '../diagram/canvasWidget';
import { layoutForcePadded } from '../diagram/layout';
import { dataURLToBlob } from '../diagram/toSvg';

import { AuthoringState } from '../editor/authoringState';

import { Dropdown, DropdownItem, useInsideDropdown } from './dropdown';

import { WorkspaceContext } from '../workspace/workspaceContext';

export interface ToolbarProps {
    /**
     * Main menu content, in a form of `<ToolbarItem>` elements.
     *
     * If `null`, the menu toggle button will be hidden.
     */
    menu?: React.ReactNode | null;
    /**
     * Toolbar panel content, in a form of `<ToolbarItem>` or other elements.
     *
     * If `null`, the panel will be hidden.
     */
    children?: React.ReactNode | null;
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

export function Toolbar(props: ToolbarProps) {
    const {menu, children, languages = []} = props;
    const menuContent = menu === null ? null : (
        menu ?? <>
            <ToolbarActionClearAll />
            <ToolbarActionExport kind='exportRaster' />
            <ToolbarActionExport kind='exportSvg' />
            <ToolbarActionExport kind='print' />
        </>
    );
    const childrenContent = children === null ? null : (
        children ?? <>
            <ToolbarActionUndo />
            <ToolbarActionRedo />
            <ToolbarActionLayout />
            <ToolbarLanguageSelector languages={languages} />
        </>
    );
    return (
        <div className={CLASS_NAME}>
            {menuContent ? (
                <Dropdown className={`${CLASS_NAME}__menu`}
                    title='Open menu'>
                    {menuContent}
                </Dropdown>
            ) : null}
            {childrenContent ? (
                <div className={`${CLASS_NAME}__quick-access-group reactodia-btn-group reactodia-btn-group-sm`}>
                    {childrenContent}
                </div>
            ) : null}
        </div>
    );
}

defineCanvasWidget(Toolbar, element => ({element, attachment: 'viewport'}));

export interface ToolbarItemProps {
    className?: string;
    title?: string;
    disabled?: boolean;
    onSelect?: () => void;
    children?: React.ReactNode;
}

export function ToolbarItem(props: ToolbarItemProps) {
    const {className, title, disabled, onSelect, children} = props;
    const insideDropdown = useInsideDropdown();
    return insideDropdown ? (
        <DropdownItem className={className}
            title={title}
            disabled={disabled}
            onSelect={onSelect}>
            {children}
        </DropdownItem>
    ) : (
        <button type='button'
            className={classnames(
                className,
                'reactodia-btn reactodia-btn-default'
            )}
            title={title}
            disabled={disabled}
            onClick={onSelect}>
            {children}
        </button>
    );
}

export interface ToolbarActionSaveProps {
    mode: 'layout' | 'authoring';
    onSelect: () => void;
    children?: React.ReactNode;
}

export function ToolbarActionSave(props: ToolbarActionSaveProps) {
    const {mode, onSelect, children} = props;
    const {model, editor} = React.useContext(WorkspaceContext)!;
    const hasLayoutChanges = useObservedProperty(
        model.history.events,
        'historyChanged',
        () => model.history.undoStack.length > 0
    );
    const canPersistChanges = useObservedProperty(
        editor.events,
        'changeAuthoringState',
        () => !AuthoringState.isEmpty(editor.authoringState)
    );

    let enabled = true;
    if (mode === 'layout') {
        enabled = hasLayoutChanges && !canPersistChanges;
    } else if (mode === 'authoring') {
        enabled = canPersistChanges;
    }

    return (
        <DropdownItem
            className={`${CLASS_NAME}__save`}
            disabled={!enabled}
            onSelect={onSelect}>
            {children}
        </DropdownItem>
    );
}

export interface ToolbarActionClearAllProps {}

export function ToolbarActionClearAll(props: ToolbarActionClearAllProps) {
    const {model, editor} = React.useContext(WorkspaceContext)!;
    return (
        <ToolbarItem
            className={`${CLASS_NAME}__clear-all`}
            title='Remove all elements and links from the diagram'
            onSelect={() => {
                const batch = model.history.startBatch('Clear all');
                editor.removeItems([...model.elements]);
                batch.store();
            }}>
            Clear All
        </ToolbarItem>
    );
}

export interface ToolbarActionExportProps {
    kind: 'exportRaster' | 'exportSvg' | 'print';
    /**
     * Exported file name without extension.
     *
     * @default "diagram"
     */
    fileName?: string;
    /**
     * Exported image background color for raster images.
     *
     * @default {backgroundColor: 'white'}
     */
    rasterOptions?: ExportRasterOptions;
}

export function ToolbarActionExport(props: ToolbarActionExportProps) {
    const {canvas} = React.useContext(CanvasContext)!;
    const {kind, fileName = 'diagram', rasterOptions} = props;
    if (kind === 'exportRaster') {
        return (
            <ToolbarItem
                className={`${CLASS_NAME}__export-image`}
                title='Export the diagram as a PNG image'
                onSelect={() => {
                    const exportOptions: ExportRasterOptions = rasterOptions ?? {
                        backgroundColor: 'white',
                    };
                    canvas.exportRaster(exportOptions).then(dataUri => {
                        const blob = dataURLToBlob(dataUri);
                        saveAs(blob, `${fileName}.png`);
                    });
                }}>
                Export as PNG
            </ToolbarItem>
        );
    } else if (kind === 'exportSvg') {
        return (
            <ToolbarItem
                className={`${CLASS_NAME}__export-image`}
                title='Export the diagram as an SVG image'
                onSelect={() => {
                    canvas.exportSvg({addXmlHeader: true}).then(svg => {
                        const blob = new Blob([svg], {type: 'image/svg+xml'});
                        saveAs(blob, `${fileName}.svg`);
                    });
                }}>
                Export as SVG
            </ToolbarItem>
        );
    } else if (kind === 'print') {
        return (
            <ToolbarItem
                className={`${CLASS_NAME}__print`}
                title='Print the diagram'
                onSelect={() => {
                    const printWindow = window.open('', undefined, 'width=1280,height=720')!;
                    canvas.exportSvg().then(svg => {
                        printWindow.document.write(svg);
                        printWindow.document.close();
                        printWindow.print();
                    });
                }}>
                Print
            </ToolbarItem>
        );
    } else {
        return null;
    }
}

export interface ToolbarActionUndoProps {}

function ToolbarActionUndoRaw(props: ToolbarActionUndoProps) {
    const {model: {history}} = React.useContext(CanvasContext)!;
    const insideDropdown = useInsideDropdown();
    const undoCommand = useObservedProperty(
        history.events,
        'historyChanged',
        () => {
            const {undoStack} = history;
            return undoStack.length === 0
                ? undefined : undoStack[undoStack.length - 1];
        }
    );
    return (
        <ToolbarItem className={`${CLASS_NAME}__undo`}
            disabled={!undoCommand}
            title={
                undoCommand && undoCommand.title
                    ? `Undo: ${undoCommand.title}`
                    : 'Undo last command'
            }
            onSelect={() => history.undo()}>
            {insideDropdown ? 'Undo' : null}
        </ToolbarItem>
    );
}

export const ToolbarActionUndo = React.memo(
    ToolbarActionUndoRaw,
    (prevProps, nextProps) => true
);

export interface ToolbarActionRedoProps {}

function ToolbarActionRedoRaw(props: ToolbarActionRedoProps) {
    const {model: {history}} = React.useContext(CanvasContext)!;
    const insideDropdown = useInsideDropdown();
    const redoCommand = useObservedProperty(
        history.events,
        'historyChanged',
        () => {
            const {redoStack} = history;
            return history.redoStack.length === 0
                ? undefined : redoStack[redoStack.length - 1];
        }
    );
    return (
        <ToolbarItem className={`${CLASS_NAME}__redo`}
            disabled={!redoCommand}
            title={
                redoCommand && redoCommand.title
                    ? `Redo: ${redoCommand.title}`
                    : 'Redo last command'
            }
            onSelect={() => history.redo()}>
            {insideDropdown ? 'Redo' : null}
        </ToolbarItem>
    );
}

export const ToolbarActionRedo = React.memo(
    ToolbarActionRedoRaw,
    (prevProps, nextProps) => true
);

export interface ToolbarActionLayoutProps {}

function ToolbarActionLayoutRaw(props: ToolbarActionLayoutProps) {
    const {performLayout} = React.useContext(WorkspaceContext)!;
    const {model, canvas} = React.useContext(CanvasContext)!;
    const elementCount = useObservedProperty(
        model.events,
        'changeCells',
        () => model.elements.length
    );
    return (
        <ToolbarItem className={`${CLASS_NAME}__layout`}
            title='Layout diagram using force-directed algorithm'
            disabled={elementCount === 0}
            onSelect={() => {
                performLayout({
                    canvas,
                    layoutFunction: layoutForcePadded,
                    animate: true,
                });
            }}>
            Layout
        </ToolbarItem>
    );
}

export const ToolbarActionLayout = React.memo(
    ToolbarActionLayoutRaw,
    (prevProps, nextProps) => true
);

export interface ToolbarLanguageSelectorProps {
    languages: ReadonlyArray<WorkspaceLanguage>;
}

export function ToolbarLanguageSelector(props: ToolbarLanguageSelectorProps) {
    const {view} = React.useContext(WorkspaceContext)!;
    const {languages} = props;
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
