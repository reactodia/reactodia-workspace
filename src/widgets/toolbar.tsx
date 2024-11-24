import * as React from 'react';

import { defineCanvasWidget } from '../diagram/canvasWidget';

import { DropdownMenu } from './utility/dropdown';
import { DockDirection, ViewportDock } from './utility/viewportDock';

/**
 * Props for `Toolbar` component.
 *
 * @see Toolbar
 */
export interface ToolbarProps {
    /**
     * Dock direction on the canvas viewport.
     */
    dock: DockDirection;
    /**
     * Horizontal offset from the dock direction.
     *
     * @default 0
     */
    dockOffsetX?: number;
    /**
     * Vertical offset from the dock direction.
     *
     * @default 0
     */
    dockOffsetY?: number;
    /**
     * Main menu content, in a form of `ToolbarAction` elements.
     *
     * If not specified or `null`, the menu toggle button will be hidden.
     */
    menu?: React.ReactNode;
    /**
     * Toolbar panel content, in a form of `ToolbarAction` or other elements.
     */
    children: React.ReactNode;
}

const CLASS_NAME = 'reactodia-toolbar';

/**
 * Canvas widget component to display a simple toolbar with a dropdown menu.
 *
 * @category Components
 */
export function Toolbar(props: ToolbarProps) {
    const {dock, dockOffsetX, dockOffsetY, menu, children} = props;
    return (
        <ViewportDock className={`${CLASS_NAME}__dock`}
            dock={dock}
            dockOffsetX={dockOffsetX}
            dockOffsetY={dockOffsetY}>
            <div className={CLASS_NAME}>
                {menu ? (
                    <DropdownMenu className={`${CLASS_NAME}__menu`}
                        title='Open menu'>
                        {menu}
                    </DropdownMenu>
                ) : null}
                {children ? (
                    <div className={`${CLASS_NAME}__quick-access-group reactodia-btn-group reactodia-btn-group-sm`}>
                        {children}
                    </div>
                ) : null}
            </div>
        </ViewportDock>
    );
}

defineCanvasWidget(Toolbar, element => ({element, attachment: 'viewport'}));
