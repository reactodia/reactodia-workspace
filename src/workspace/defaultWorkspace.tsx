import * as React from 'react';

import { Events, EventSource, EventTrigger } from '../coreUtils/events';

import { Canvas, CanvasProps } from '../widgets/canvas';
import { ClassTree, ClassTreeProps } from '../widgets/classTree';
import {
    ConnectionsMenu, ConnectionsMenuProps, ConnectionsMenuCommands,
} from '../widgets/connectionsMenu';
import { DropOnCanvas, DropOnCanvasProps } from '../widgets/dropOnCanvas';
import { Halo, HaloProps } from '../widgets/halo';
import { HaloLink, HaloLinkProps } from '../widgets/haloLink';
import { InstancesSearch, InstancesSearchProps, InstancesSearchCommands } from '../widgets/instancesSearch';
import { LinkTypesToolbox, LinkTypesToolboxProps } from '../widgets/linksToolbox';
import { Navigator, NavigatorProps } from '../widgets/navigator';
import { Selection, SelectionProps } from '../widgets/selection';
import { Toolbar, ToolbarProps } from '../widgets/toolbar';
import { ZoomControl, ZoomControlProps } from '../widgets/zoomControl';

import {
    WorkspaceLayoutRow, WorkspaceLayoutColumn, WorkspaceLayoutItem, WorkspaceLayoutContainerProps,
} from './workspaceLayout';
import { WorkspaceRoot } from './workspaceRoot';

/**
 * Props for `DefaultWorkspace` component.
 *
 * @see DefaultWorkspace
 */
export interface DefaultWorkspaceProps {
    /**
     * Props for the left layout column of the default workspace.
     *
     * @default {defaultSize: 275}
     */
    leftColumn?: Omit<WorkspaceLayoutContainerProps, 'children'>;
    /**
     * Props for the right layout column of the default workspace.
     *
     * @default {defaultSize: 275, defaultCollapsed: true}
     */
    rightColumn?: Omit<WorkspaceLayoutContainerProps, 'children'>;

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
    navigator?: NavigatorProps | null;
    /**
     * Props for the `Toolbar` canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     *
     * @see Toolbar
     */
    toolbar?: ToolbarProps | null;
    /**
     * Props for the `ZoomControl` canvas widget.
     *
     * If specified as `null`, the component will not be rendered.
     *
     * @see ZoomControl
     */
    zoomControl?: ZoomControlProps | null;

    /**
     * Props for the `ClassTree` component.
     *
     * @see ClassTree
     */
    classTree?: ClassTreeProps;
    /**
     * Props for the `InstancesSearch` component.
     *
     * @see InstancesSearch
     */
    instancesSearch?: Omit<InstancesSearchProps, 'commands'>;
    /**
     * Props for the `LinkTypesToolbox` component.
     *
     * @see LinkTypesToolbox
     */
    linkToolbox?: LinkTypesToolboxProps;

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
 * Component with default ready-to-use workspace with a canvas and
 * all components and widgets pre-configured.
 *
 * @category Components
 */
export function DefaultWorkspace(props: DefaultWorkspaceProps) {
    const {
        leftColumn, rightColumn,
        canvas, connectionsMenu, dropOnCanvas, halo, haloLink, selection, navigator, zoomControl,
        toolbar, classTree, instancesSearch, linkToolbox,
    } = props;

    const [connectionsMenuCommands] = React.useState(() =>
        props.connectionsMenuCommands ?? new EventSource<ConnectionsMenuCommands>()
    );
    const [instancesSearchCommands] = React.useState(() =>
        props.instancesSearchCommands ?? new EventSource<InstancesSearchCommands>()
    );

    return (
        <WorkspaceRoot>
            <WorkspaceLayoutRow>
                <WorkspaceLayoutColumn defaultSize={275}
                    {...leftColumn}>
                    <WorkspaceLayoutItem id='classes' heading='Classes'>
                        <ClassTree {...classTree}
                            instancesSearchCommands={instancesSearchCommands}
                        />
                    </WorkspaceLayoutItem>
                    <WorkspaceLayoutItem id='instances' heading='Instances'>
                        <InstancesSearch {...instancesSearch}
                            commands={instancesSearchCommands}
                        />
                    </WorkspaceLayoutItem>
                </WorkspaceLayoutColumn>
                <WorkspaceLayoutItem id='canvas'>
                    <Canvas {...canvas}>
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
                        {navigator === null ? null : <Navigator {...navigator} />}
                        {toolbar === null ? null : <Toolbar {...toolbar} />}
                        {zoomControl === null ? null : <ZoomControl {...zoomControl} />}
                    </Canvas>
                </WorkspaceLayoutItem>
                <WorkspaceLayoutColumn defaultSize={275}
                    defaultCollapsed={true}
                    {...rightColumn}>
                    <WorkspaceLayoutItem id='connections'
                        heading='Connections'>
                        <LinkTypesToolbox {...linkToolbox}
                            instancesSearchCommands={instancesSearchCommands}
                        />
                    </WorkspaceLayoutItem>
                </WorkspaceLayoutColumn>
            </WorkspaceLayoutRow>
        </WorkspaceRoot>
    );
}
