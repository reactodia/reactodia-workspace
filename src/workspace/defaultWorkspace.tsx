import * as React from 'react';

import { Events, EventSource, EventTrigger } from '../coreUtils/events';

import { Canvas, CanvasProps } from '../widgets/canvas';
import {
    ConnectionsMenu, ConnectionsMenuProps, ConnectionsMenuCommands,
} from '../widgets/connectionsMenu';
import { DropOnCanvas, DropOnCanvasProps } from '../widgets/dropOnCanvas';
import { Halo, HaloProps } from '../widgets/halo';
import { HaloLink, HaloLinkProps } from '../widgets/haloLink';
import type { InstancesSearchCommands } from '../widgets/instancesSearch';
import { Navigator, NavigatorProps } from '../widgets/navigator';
import { Selection, SelectionProps } from '../widgets/selection';
import { Toolbar, ToolbarProps } from '../widgets/toolbar';
import {
    ToolbarActionClearAll, ToolbarActionExport, ToolbarActionUndo, ToolbarActionRedo,
    ToolbarActionLayout, ToolbarLanguageSelector, WorkspaceLanguage,
} from '../widgets/toolbarAction';
import {
    UnifiedSearch, UnifiedSearchProps, UnifiedSearchCommands, UnifiedSearchSection,
    SearchSectionElementTypes,
    SearchSectionEntities,
    SearchSectionLinkTypes,
} from '../widgets/unifiedSearch';
import { VisualAuthoring, VisualAuthoringProps } from '../widgets/visualAuthoring';
import { ZoomControl, ZoomControlProps } from '../widgets/zoomControl';

import { WorkspaceRoot } from './workspaceRoot';

export interface BaseDefaultWorkspaceProps {
    /**
     * Props for the `Canvas` component.
     *
     * @see Canvas
     */
    canvas?: CanvasProps;
    /**
     * Props for the `ConnectionMenu` canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     *
     * @see ConnectionsMenu
     */
    connectionsMenu?: Omit<ConnectionsMenuProps, 'commands'> | null;
    /**
     * Props for the `DropOnCanvas` canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     *
     * @see DropOnCanvas
     */
    dropOnCanvas?: DropOnCanvasProps | null;
    /**
     * Props for the `Halo` canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     *
     * @see Halo
     */
    halo?: HaloProps | null;
    /**
     * Props for the `HaloLink` canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     *
     * @see HaloLink
     */
    haloLink?: HaloLinkProps | null;
    /**
     * Props for the `Selection` canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     *
     * @see Selection
     */
    selection?: SelectionProps | null;
    /**
     * Props for the `Navigator` canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     *
     * @see Navigator
     */
    navigator?: Partial<NavigatorProps> | null;
    /**
     * Props for the `VisualAuthoring` context component.
     *
     * @see VisualAuthoring
     */
    visualAuthoring?: Omit<VisualAuthoringProps, 'commands' | 'children'>;
    /**
     * Props for the `ZoomControl` canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     *
     * @see ZoomControl
     */
    zoomControl?: Partial<ZoomControlProps> | null;
    /**
     * Event bus to connect `UnifiedSearch` to other components.
     *
     * If not specified, an internal instance will be automatically created.
     */
    searchCommands?: Events<UnifiedSearchCommands> & EventTrigger<UnifiedSearchCommands>;
    /**
     * Event bus to connect `ConnectionMenu` to other components.
     *
     * If not specified, an internal instance will be automatically created.
     */
    connectionsMenuCommands?: Events<ConnectionsMenuCommands> & EventTrigger<ConnectionsMenuCommands>;
    /**
     * Event bus to connect `InstancesSearch` to other components.
     *
     * If not specified, an internal instance will be automatically created.
     */
    instancesSearchCommands?: Events<InstancesSearchCommands> & EventTrigger<InstancesSearchCommands>;
}

/**
 * Props for `DefaultWorkspace` component.
 *
 * @see DefaultWorkspace
 */
export interface DefaultWorkspaceProps extends BaseDefaultWorkspaceProps {
    /**
     * Main menu content, in a form of `ToolbarAction` elements.
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
     * @see ToolbarProps.menu
     */
    menu?: React.ReactNode | null;
    /**
     * Props for the `UnifiedSearch` canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     *
     * @see UnifiedSearch
     */
    search?: UnifiedSearchProps | null;
    /**
     * Content for the secondary (actions) toolbar, in a form of
     * `ToolbarAction` elements.
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
        canvas, connectionsMenu, dropOnCanvas, halo, haloLink, selection, navigator,
        visualAuthoring, zoomControl, menu, search, actions, mainToolbar, actionsToolbar,
        languages = [],
    } = props;

    const [searchCommands] = React.useState(() =>
        props.searchCommands ?? new EventSource<UnifiedSearchCommands>()
    );
    const [connectionsMenuCommands] = React.useState(() =>
        props.connectionsMenuCommands ?? new EventSource<ConnectionsMenuCommands>()
    );
    const [instancesSearchCommands] = React.useState(() =>
        props.instancesSearchCommands ?? new EventSource<InstancesSearchCommands>()
    );

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
            label: 'Types',
            component: (
                <SearchSectionElementTypes
                    instancesSearchCommands={instancesSearchCommands}
                />
            )
        },
        {
            key: 'entities',
            label: 'Entities',
            component: (
                <SearchSectionEntities
                    instancesSearchCommands={instancesSearchCommands}
                />
            )
        },
        {
            key: 'linkTypes',
            label: 'Links',
            component: (
                <SearchSectionLinkTypes
                    instancesSearchCommands={instancesSearchCommands}
                />
            )
        }
    ], [instancesSearchCommands]);

    return (
        <WorkspaceRoot>
            <Canvas {...canvas}>
                <VisualAuthoring {...visualAuthoring} />
                {connectionsMenu === null ? null : (
                    <ConnectionsMenu {...connectionsMenu}
                        commands={connectionsMenuCommands}
                        instancesSearchCommands={instancesSearchCommands}
                    />
                )}
                {dropOnCanvas === null ? null : <DropOnCanvas {...dropOnCanvas} />}
                {halo === null ? null : (
                    <Halo {...halo}
                        instancesSearchCommands={instancesSearchCommands}
                        connectionsMenuCommands={
                            connectionsMenu === null ? undefined : connectionsMenuCommands
                        }
                    />
                )}
                {haloLink === null ? null : <HaloLink {...haloLink} />}
                {selection === null ? null : (
                    <Selection {...selection}
                        connectionsMenuCommands={
                            connectionsMenu === null ? undefined : connectionsMenuCommands
                        }
                    />
                )}
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
                    dock={mainToolbar?.dock ?? 'nw'}
                    menu={menuContent}>
                    {search === null ? null : (
                        <UnifiedSearch {...search}
                            sections={search?.sections ?? defaultSections}
                            commands={searchCommands}
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
            </Canvas>
        </WorkspaceRoot>
    );
}
