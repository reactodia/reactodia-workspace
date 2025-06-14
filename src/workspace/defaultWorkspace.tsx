import * as React from 'react';

import { useTranslation } from '../coreUtils/i18n';

import { Canvas, CanvasProps } from '../widgets/canvas';
import { ConnectionsMenu, ConnectionsMenuProps } from '../widgets/connectionsMenu';
import { DropOnCanvas, DropOnCanvasProps } from '../widgets/dropOnCanvas';
import { Halo, HaloProps } from '../widgets/halo';
import { HaloLink, HaloLinkProps } from '../widgets/haloLink';
import { Navigator, NavigatorProps } from '../widgets/navigator';
import { Selection, SelectionProps } from '../widgets/selection';
import { Toolbar, ToolbarProps } from '../widgets/toolbar';
import {
    ToolbarActionClearAll, ToolbarActionExport, ToolbarActionUndo, ToolbarActionRedo,
    ToolbarActionLayout, ToolbarLanguageSelector, WorkspaceLanguage,
} from '../widgets/toolbarAction';
import {
    UnifiedSearch, UnifiedSearchProps, UnifiedSearchSection,
    SearchSectionElementTypes,
    SearchSectionEntities,
    SearchSectionLinkTypes,
} from '../widgets/unifiedSearch';
import { VisualAuthoring, VisualAuthoringProps } from '../widgets/visualAuthoring';
import { ZoomControl, ZoomControlProps } from '../widgets/zoomControl';

import { WorkspaceRoot } from './workspaceRoot';

export interface BaseDefaultWorkspaceProps {
    /**
     * Sets a color scheme for the UI components.
     *
     * If set to `auto`, the component will track the following places in order:
     *  - `<html data-theme="...">` attribute in case it is set to `dark`;
     *  - `(prefers-color-scheme: dark)` media query matches;
     *  - fallback to the default `light` color scheme otherwise.
     *
     * @default "auto"
     */
    colorScheme?: 'auto' | 'light' | 'dark';
    /**
     * Props for the {@link Canvas} component.
     */
    canvas?: CanvasProps;
    /**
     * Additional widgets to pass as children to the {@link Canvas} component.
     */
    canvasWidgets?: ReadonlyArray<React.ReactElement>;
    /**
     * Props for the {@link ConnectionMenu} canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     */
    connectionsMenu?: Omit<ConnectionsMenuProps, 'commands'> | null;
    /**
     * Props for the {@link DropOnCanvas} canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     */
    dropOnCanvas?: DropOnCanvasProps | null;
    /**
     * Props for the {@link Halo} canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     */
    halo?: HaloProps | null;
    /**
     * Props for the {@link HaloLink} canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     */
    haloLink?: HaloLinkProps | null;
    /**
     * Props for the {@link Selection} canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     */
    selection?: SelectionProps | null;
    /**
     * Props for the {@link Navigator} canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     */
    navigator?: Partial<NavigatorProps> | null;
    /**
     * Props for the {@link VisualAuthoring} context component.
     */
    visualAuthoring?: Omit<VisualAuthoringProps, 'commands' | 'children'>;
    /**
     * Props for the {@link ZoomControl} canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     */
    zoomControl?: Partial<ZoomControlProps> | null;
}

/**
 * Props for {@link DefaultWorkspace} component.
 *
 * @see {@link DefaultWorkspace}
 */
export interface DefaultWorkspaceProps extends BaseDefaultWorkspaceProps {
    /**
     * Main menu content, in a form of {@link ToolbarAction} elements.
     *
     * If specified as `null`, the menu toggle button will be hidden.
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
     * @see {@link ToolbarProps.menu}
     */
    menu?: React.ReactNode | null;
    /**
     * Props for the {@link UnifiedSearch} canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     */
    search?: Partial<UnifiedSearchProps> | null;
    /**
     * Content for the secondary (actions) toolbar, in a form of
     * {@link ToolbarAction} elements.
     *
     * If specified as `null`, the secondary toolbar will be hidden.
     *
     * * **Default**:
     * ```jsx
     * <>
     *     <ToolbarActionUndo />
     *     <ToolbarActionRedo />
     *     <ToolbarActionLayout />
     *     <ToolbarLanguageSelector languages={props.languages} />
     * </>
     * ```
     */
    actions?: React.ReactNode | null;
    /**
     * Additional props for the primary (main) toolbar.
     */
    mainToolbar?: Pick<ToolbarProps, 'dock' | 'dockOffsetX' | 'dockOffsetY'>;
    /**
     * Additional props for the secondary (actions) toolbar.
     */
    actionsToolbar?: Pick<ToolbarProps, 'dock' | 'dockOffsetX' | 'dockOffsetY'>;
    /**
     * Set of languages for the diagram data language selector.
     *
     * If not specified or empty, the selector will be hidden.
     */
    languages?: ReadonlyArray<WorkspaceLanguage>;
}

/**
 * Component with default ready-to-use workspace with a canvas and
 * all components and widgets pre-configured.
 *
 * @category Components
 */
export function DefaultWorkspace(props: DefaultWorkspaceProps) {
    const {
        colorScheme,
        canvas, canvasWidgets, connectionsMenu, dropOnCanvas, halo, haloLink, selection,
        navigator, visualAuthoring, zoomControl,
        menu, search, actions, mainToolbar, actionsToolbar,
        languages = [],
    } = props;

    const t = useTranslation();

    const menuContent = menu === null ? null : (
        menu ?? <>
            <ToolbarActionClearAll />
            <ToolbarActionExport kind='exportRaster' />
            <ToolbarActionExport kind='exportSvg' />
            <ToolbarActionExport kind='print' />
        </>
    );

    const actionsContent = actions === null ? null : (
        actions ?? <>
            <ToolbarActionUndo />
            <ToolbarActionRedo />
            <ToolbarActionLayout />
            <ToolbarLanguageSelector languages={languages} />
        </>
    );

    const defaultSections = React.useMemo((): readonly UnifiedSearchSection[] => [
        {
            key: 'elementTypes',
            label: t.text('default_workspace.search_section_entity_types.label'),
            title: t.text('default_workspace.search_section_entity_types.title'),
            component: <SearchSectionElementTypes />,
        },
        {
            key: 'entities',
            label: t.text('default_workspace.search_section_entities.label'),
            title: t.text('default_workspace.search_section_entities.title'),
            component: <SearchSectionEntities />,
        },
        {
            key: 'linkTypes',
            label: t.text('default_workspace.search_section_link_types.label'),
            title: t.text('default_workspace.search_section_link_types.title'),
            component: <SearchSectionLinkTypes />,
        }
    ], []);

    const menuDock = mainToolbar?.dock ?? 'nw';
    const menuDropUp = menuDock === 's' || menuDock === 'sw' || menuDock === 'se';

    return (
        <WorkspaceRoot colorScheme={colorScheme}>
            <Canvas {...canvas}>
                <VisualAuthoring {...visualAuthoring} />
                {connectionsMenu === null ? null : <ConnectionsMenu {...connectionsMenu} />}
                {dropOnCanvas === null ? null : <DropOnCanvas {...dropOnCanvas} />}
                {halo === null ? null : <Halo {...halo} />}
                {haloLink === null ? null : <HaloLink {...haloLink} />}
                {selection === null ? null : <Selection {...selection} />}
                {zoomControl === null ? null : (
                    <ZoomControl dock='w'
                        {...zoomControl}
                    />
                )}
                {navigator === null ? null : (
                    <Navigator dock='se'
                        {...navigator}
                    />
                )}
                <Toolbar {...mainToolbar}
                    dock={menuDock}
                    menu={menuContent}>
                    {search === null ? null : (
                        <UnifiedSearch {...search}
                            direction={search?.direction ?? (menuDropUp ? 'up' : 'down')}
                            sections={search?.sections ?? defaultSections}
                        />
                    )}
                </Toolbar>
                {actionsContent === null ? null : (
                    <Toolbar {...actionsToolbar}
                        dock={actionsToolbar?.dock ?? 'sw'}
                        menu={null}>
                        {actionsContent}
                    </Toolbar>
                )}
                {canvasWidgets}
            </Canvas>
        </WorkspaceRoot>
    );
}
