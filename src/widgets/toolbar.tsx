import * as React from 'react';

import { defineCanvasWidget } from '../diagram/canvasWidget';

import { Dropdown } from './dropdown';
import {
    ToolbarActionClearAll, ToolbarActionExport, ToolbarActionUndo, ToolbarActionRedo,
    ToolbarActionLayout, ToolbarLanguageSelector, WorkspaceLanguage,
} from './toolbarAction';

/**
 * Props for `Toolbar` component.
 *
 * @see Toolbar
 */
export interface ToolbarProps {
    /**
     * Main menu content, in a form of `ToolbarAction` elements.
     *
     * If `null`, the menu toggle button will be hidden.
     *
     * **Default**:
     * ```jsx
     * <>
     *     <ToolbarActionClearAll />
     *     <ToolbarActionExport kind='exportRaster' />
     *     <ToolbarActionExport kind='exportSvg' />
     *     <ToolbarActionExport kind='print' />
     * </>
     * ```
     */
    menu?: React.ReactNode | null;
    /**
     * Toolbar panel content, in a form of `ToolbarAction` or other elements.
     *
     * If `null`, the panel will be hidden.
     *
     * **Default**:
     * ```jsx
     * <>
     *     <ToolbarActionUndo />
     *     <ToolbarActionRedo />
     *     <ToolbarActionLayout />
     *     <ToolbarLanguageSelector languages={props.languages} />
     * </>
     * ```
     */
    children?: React.ReactNode | null;
    /**
     * Set of languages to display diagram data.
     */
    languages?: ReadonlyArray<WorkspaceLanguage>;
}

const CLASS_NAME = 'reactodia-toolbar';

/**
 * Canvas widget component to display a simple toolbar with a dropdown menu.
 *
 * @category Components
 */
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
