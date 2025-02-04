import * as React from 'react';

import { Events, EventSource, EventTrigger } from '../coreUtils/events';
import { useTranslation } from '../coreUtils/i18n';

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
    /**
     * Event bus to connect {@link UnifiedSearch} to other components.
     *
     * If not specified, an internal instance will be automatically created.
     */
    searchCommands?: Events<UnifiedSearchCommands> & EventTrigger<UnifiedSearchCommands>;
    /**
     * Event bus to connect {@link ConnectionMenu} to other components.
     *
     * If not specified, an internal instance will be automatically created.
     */
    connectionsMenuCommands?: Events<ConnectionsMenuCommands> & EventTrigger<ConnectionsMenuCommands>;
    /**
     * Event bus to connect {@link InstancesSearch} to other components.
     *
     * If not specified, an internal instance will be automatically created.
     */
    instancesSearchCommands?: Events<InstancesSearchCommands> & EventTrigger<InstancesSearchCommands>;
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
    search?: UnifiedSearchProps | null;
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
        canvas, canvasWidgets, connectionsMenu, dropOnCanvas, halo, haloLink, selection,
        navigator, visualAuthoring, zoomControl,
        menu, search, actions, mainToolbar, actionsToolbar,
        languages = [],
    } = props;

    const t = useTranslation();
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
            label: t.text('default_workspace.search_section_types_title'),
            component: (
                <SearchSectionElementTypes
                    instancesSearchCommands={instancesSearchCommands}
                />
            )
        },
        {
            key: 'entities',
            label: t.text('default_workspace.search_section_entities_title'),
            component: (
                <SearchSectionEntities
                    instancesSearchCommands={instancesSearchCommands}
                />
            )
        },
        {
            key: 'linkTypes',
            label: t.text('default_workspace.search_section_link_types_title'),
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
                {canvasWidgets}
            </Canvas>
        </WorkspaceRoot>
    );
}
