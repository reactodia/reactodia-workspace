import * as React from 'react';
import classnames from 'classnames';
import { saveAs } from 'file-saver';

import { useObservedProperty } from '../coreUtils/hooks';
import { type Translation, useTranslation } from '../coreUtils/i18n';

import { ExportRasterOptions, useCanvas } from '../diagram/canvasApi';
import type { Command } from '../diagram/history';
import { dataURLToBlob } from '../diagram/toSvg';

import { AuthoringState } from '../editor/authoringState';

import { DropdownMenuItem, useInsideDropdown } from './utility/dropdown';

import { useWorkspace } from '../workspace/workspaceContext';

const CLASS_NAME = 'reactodia-toolbar-action';

/**
 * Base props for toolbar action components.
 *
 * @see {@link ToolbarAction}
 */
export interface ToolbarActionStyleProps {
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Title for the action button or menu item.
     */
    title?: string;
    /**
     * Whether the action is disabled.
     */
    disabled?: boolean;
}

/**
 * Props for {@link ToolbarAction} component.
 *
 * @see {@link ToolbarAction}
 */
export interface ToolbarActionProps extends ToolbarActionStyleProps {
    /**
     * Handler to call when the action is selected
     * (button clicked or menu item selected).
     */
    onSelect?: () => void;
    /**
     * Action content.
     */
    children?: React.ReactNode;
}

/**
 * Base component to display an action on the {@link Toolbar} itself or
 * in the dropdown menu in a generic way.
 *
 * @category Components
 */
export function ToolbarAction(props: ToolbarActionProps) {
    const {className, title, disabled, onSelect, children} = props;
    const insideDropdown = useInsideDropdown();
    return insideDropdown ? (
        <DropdownMenuItem className={className}
            title={title}
            disabled={disabled}
            onSelect={onSelect}>
            {children}
        </DropdownMenuItem>
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

/**
 * Props for {@link ToolbarActionOpen} component.
 *
 * @see {@link ToolbarActionOpen}
 */
export interface ToolbarActionOpenProps extends ToolbarActionStyleProps {
    /**
     * Accepted [file types](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/accept)
     * for the file selection.
     */
    fileAccept?: string;
    /**
     * Handler for the selected file.
     */
    onSelect: (file: File) => void;
    /**
     * Action content.
     */
    children?: React.ReactNode;
}

/**
 * Toolbar action component to open a file selection dialog.
 *
 * @category Components
 */
export function ToolbarActionOpen(props: ToolbarActionOpenProps) {
    const {className, fileAccept, onSelect, children, ...otherProps} = props;
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    return (
        <>
            <DropdownMenuItem {...otherProps}
                className={classnames(className, `${CLASS_NAME}__open`)}
                onSelect={() => {
                    inputRef.current?.click();
                }}>
                {children}
            </DropdownMenuItem>
            <input ref={inputRef}
                type='file'
                className={`${CLASS_NAME}__open-input`}
                accept={fileAccept}
                onChange={e => {
                    if (e.currentTarget.files) {
                        const file = e.currentTarget.files[0];
                        onSelect(file);
                    }
                }}
            />
        </>
    );
}

/**
 * Props for {@link ToolbarActionSave} component.
 *
 * @see {@link ToolbarActionSave}
 */
export interface ToolbarActionSaveProps extends Omit<ToolbarActionStyleProps, 'disabled'> {
    /**
     * Enable mode for the action:
     *   - `layout` - the action is enabled when there are unsaved changes
     *     to the diagram layout (when a command history is non-empty);
     *   - `authoring` - the action is enabled when graph authoring state is non-empty.
     */
    mode: 'layout' | 'authoring';
    /**
     * Handler for the action.
     */
    onSelect: () => void;
    /**
     * Action content.
     */
    children?: React.ReactNode;
}

/**
 * Toolbar action component to save diagram layout state or apply authored changed.
 *
 * @category Components
 */
export function ToolbarActionSave(props: ToolbarActionSaveProps) {
    const {className, title, mode, onSelect, children, ...otherProps} = props;
    const {model, editor, translation: t} = useWorkspace();
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
    let defaultTitle: string | undefined;
    if (mode === 'layout') {
        enabled = hasLayoutChanges && !canPersistChanges;
        defaultTitle = t.text('toolbar_action.save_layout.title');
    } else if (mode === 'authoring') {
        enabled = canPersistChanges;
        defaultTitle = t.text('toolbar_action.save_authoring.title');
    }

    return (
        <DropdownMenuItem {...otherProps}
            className={classnames(className, `${CLASS_NAME}__save`)}
            disabled={!enabled}
            onSelect={onSelect}
            title={title ?? defaultTitle}>
            {children}
        </DropdownMenuItem>
    );
}

/**
 * Props for {@link ToolbarActionClearAll} component.
 *
 * @see {@link ToolbarActionClearAll}
 */
export interface ToolbarActionClearAllProps extends ToolbarActionStyleProps {}

/**
 * Toolbar action component to clear diagram content.
 *
 * Clearing the diagram adds a command to the command history.
 *
 * @category Components
 */
export function ToolbarActionClearAll(props: ToolbarActionClearAllProps) {
    const {className, title, ...otherProps} = props;
    const {model, editor, translation: t} = useWorkspace();
    return (
        <ToolbarAction {...otherProps}
            className={classnames(className, `${CLASS_NAME}__clear-all`)}
            title={title ?? t.text('toolbar_action.clear_all.title')}
            onSelect={() => {
                const batch = model.history.startBatch({
                    titleKey: 'toolbar_action.clear_all.command',
                });
                editor.removeItems([...model.elements]);
                batch.store();
            }}>
            {t.text('toolbar_action.clear_all.label')}
        </ToolbarAction>
    );
}

/**
 * Props for {@link ToolbarActionExport} component.
 *
 * @see {@link ToolbarActionExport}
 */
export interface ToolbarActionExportProps extends ToolbarActionStyleProps {
    /**
     * Export mode:
     *   - `exportRaster` - exports the diagram into a raster image file;
     *   - `exportSvg` - export the diagram into an SVG file;
     *   - `print` - prints the diagram.
     */
    kind: 'exportRaster' | 'exportSvg' | 'print';
    /**
     * Exported file name without extension.
     *
     * Only applicable when {@link kind} is `exportRaster` or `exportSvg`.
     *
     * @default "diagram"
     */
    fileName?: string;
    /**
     * Export options (e.g. background color) for raster images.
     *
     * Only applicable when {@link kind} is `exportRaster`.
     *
     * @default {backgroundColor: "white"}
     */
    rasterOptions?: ExportRasterOptions;
}

/**
 * Toolbar action component to export the diagram into a file, or print it.
 *
 * @category Components
 */
export function ToolbarActionExport(props: ToolbarActionExportProps) {
    const {
        className, title, kind, fileName = 'diagram', rasterOptions, ...otherProps
    } = props;
    const {canvas} = useCanvas();
    const t = useTranslation();
    if (kind === 'exportRaster') {
        return (
            <ToolbarAction {...otherProps}
                className={classnames(className, `${CLASS_NAME}__export-image`)}
                title={title ?? t.text('toolbar_action.export_raster.title')}
                onSelect={() => {
                    const exportOptions: ExportRasterOptions = rasterOptions ?? {
                        backgroundColor: 'white',
                    };
                    canvas.exportRaster(exportOptions).then(dataUri => {
                        const blob = dataURLToBlob(dataUri);
                        saveAs(blob, `${fileName}.png`);
                    });
                }}>
                {t.text('toolbar_action.export_raster.label')}
            </ToolbarAction>
        );
    } else if (kind === 'exportSvg') {
        return (
            <ToolbarAction {...otherProps}
                className={classnames(className, `${CLASS_NAME}__export-image`)}
                title={title ?? t.text('toolbar_action.export_svg.title')}
                onSelect={() => {
                    canvas.exportSvg({addXmlHeader: true}).then(svg => {
                        const blob = new Blob([svg], {type: 'image/svg+xml'});
                        saveAs(blob, `${fileName}.svg`);
                    });
                }}>
                {t.text('toolbar_action.export_svg.label')}
            </ToolbarAction>
        );
    } else if (kind === 'print') {
        return (
            <ToolbarAction {...otherProps}
                className={classnames(className, `${CLASS_NAME}__print`)}
                title={title ?? t.text('toolbar_action.export_print.title')}
                onSelect={() => {
                    const printWindow = window.open('', undefined, 'width=1280,height=720')!;
                    canvas.exportSvg().then(svg => {
                        printWindow.document.write(svg);
                        printWindow.document.close();
                        printWindow.print();
                    });
                }}>
                {t.text('toolbar_action.export_print.label')}
            </ToolbarAction>
        );
    } else {
        return null;
    }
}

/**
 * Props for {@link ToolbarActionUndo} component.
 *
 * @see {@link ToolbarActionUndo}
 */
export interface ToolbarActionUndoProps extends Omit<ToolbarActionStyleProps, 'disabled'> {}

/**
 * Toolbar action component to undo a command from the command history.
 *
 * @category Components
 */
export function ToolbarActionUndo(props: ToolbarActionUndoProps) {
    const {className, title, ...otherProps} = props;
    const {model: {history}} = useCanvas();
    const t = useTranslation();
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
    const commandTitle = !title && undoCommand ? resolveCommandTitle(undoCommand, t) : undefined;
    return (
        <ToolbarAction {...otherProps}
            className={classnames(className, `${CLASS_NAME}__undo`)}
            disabled={!undoCommand}
            title={title ?? (
                commandTitle === undefined
                    ? t.text('toolbar_action.undo.title')
                    : t.format('toolbar_action.undo.with_command_title', {command: commandTitle})
            )}
            onSelect={() => history.undo()}>
            {insideDropdown ? t.text('toolbar_action.undo.label') : null}
        </ToolbarAction>
    );
}

/**
 * Props for {@link ToolbarActionRedo} component.
 *
 * @see {@link ToolbarActionRedo}
 */
export interface ToolbarActionRedoProps extends Omit<ToolbarActionStyleProps, 'disabled'> {}

/**
 * Toolbar action component to redo a command from the command history.
 *
 * @category Components
 */
export function ToolbarActionRedo(props: ToolbarActionRedoProps) {
    const {className, title, ...otherProps} = props;
    const {model: {history}} = useCanvas();
    const t = useTranslation();
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
    const commandTitle = !title && redoCommand ? resolveCommandTitle(redoCommand, t) : undefined;
    return (
        <ToolbarAction {...otherProps}
            className={classnames(className, `${CLASS_NAME}__redo`)}
            disabled={!redoCommand}
            title={title ?? (
                commandTitle === undefined
                    ? t.text('toolbar_action.redo.title')
                    : t.format('toolbar_action.redo.with_command_title', {command: commandTitle}) 
            )}
            onSelect={() => history.redo()}>
            {insideDropdown ? t.text('toolbar_action.redo.label') : null}
        </ToolbarAction>
    );
}

function resolveCommandTitle(command: Command, t: Translation): string | undefined {
    if (command.metadata) {
        if (command.metadata.title !== undefined) {
            return command.metadata.title;
        } else if (command.metadata.titleKey) {
            return t.text(command.metadata.titleKey);
        }
    }
    return command.title;
}

/**
 * Props for {@link ToolbarActionLayout} component.
 *
 * @see {@link ToolbarActionLayout}
 */
export interface ToolbarActionLayoutProps extends Omit<ToolbarActionStyleProps, 'disabled'> {}

/**
 * Toolbar action component to perform graph layout algorithm on the diagram content.
 *
 * Applying the layout adds a command to the command history.
 *
 * @category Components
 */
export function ToolbarActionLayout(props: ToolbarActionLayoutProps) {
    const {className, title, ...otherProps} = props;
    const {model, canvas} = useCanvas();
    const {translation: t, performLayout} = useWorkspace();
    const elementCount = useObservedProperty(
        model.events,
        'changeCells',
        () => model.elements.length
    );
    return (
        <ToolbarAction {...otherProps}
            className={classnames(className, `${CLASS_NAME}__layout`)}
            title={title ?? t.text('toolbar_action.layout.title')}
            disabled={elementCount === 0}
            onSelect={() => {
                performLayout({
                    canvas,
                    animate: true,
                });
            }}>
            {t.text('toolbar_action.layout.label')}
        </ToolbarAction>
    );
}

/**
 * Props for {@link ToolbarLanguageSelector} component.
 *
 * @see {@link ToolbarLanguageSelector}
 */
export interface ToolbarLanguageSelectorProps
    extends Pick<ToolbarActionStyleProps, 'className' | 'title'> {
    /**
     * List of languages to select from.
     */
    languages: ReadonlyArray<WorkspaceLanguage>;
}

/**
 * Workspace data language variant to select.
 */
export interface WorkspaceLanguage {
    /**
     * Language code which is specified as lowercase [BCP47](https://www.rfc-editor.org/rfc/rfc5646)
     * string (examples: `en`, `en-gb`, etc).
     */
    readonly code: string;
    /**
     * Language display name.
     */
    readonly label: string;
}

/**
 * Toolbar component to select a data language for the workspace.
 *
 * @category Components
 */
export function ToolbarLanguageSelector(props: ToolbarLanguageSelectorProps) {
    const {className, title, languages} = props;
    const {model} = useCanvas();
    const t = useTranslation();
    const currentLanguage = useObservedProperty(
        model.events,
        'changeLanguage',
        () => model.language
    );
    return languages.length === 0 ? null : (
        <div className={classnames(className, `${CLASS_NAME}__language-selector`)}
            title={title ?? t.text('toolbar_action.language_selector.title')}>
            <label htmlFor='reactodia-language-selector' />
            <select id='reactodia-language-selector'
                value={currentLanguage}
                onChange={e => model.setLanguage(e.currentTarget.value)}>
                {languages.map(({code, label}) => <option key={code} value={code}>{label}</option>)}
            </select>
        </div>
    );
}
