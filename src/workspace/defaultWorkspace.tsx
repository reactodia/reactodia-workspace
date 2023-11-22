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
import { ZoomControl, ZoomControlProps } from '../widgets/zoomControl';

import { DefaultToolbar, DefaultToolbarProps } from './defaultToolbar';
import {
    WorkspaceLayoutRow, WorkspaceLayoutColumn, WorkspaceLayoutItem, WorkspaceLayoutContainerProps,
} from './workspaceLayout';
import { WorkspaceRoot } from './workspaceRoot';

export interface DefaultWorkspaceProps {
    /**
     * **Default**: `{defaultSize: 275}`
     */
    leftColumn?: Omit<WorkspaceLayoutContainerProps, 'children'>;
    /**
     * **Default**: `{defaultSize: 275, defaultCollapsed: true}`
     */
    rightColumn?: Omit<WorkspaceLayoutContainerProps, 'children'>;

    canvas?: CanvasProps;
    connectionsMenu?: Omit<ConnectionsMenuProps, 'commands'> | null;
    dropOnCanvas?: DropOnCanvasProps | null;
    halo?: HaloProps | null;
    haloLink?: HaloLinkProps | null;
    navigator?: NavigatorProps | null;
    zoomControl?: ZoomControlProps | null;
    toolbar?: DefaultToolbarProps | null;

    classTree?: ClassTreeProps;
    instancesSearch?: Omit<InstancesSearchProps, 'commands'>;
    linkToolbox?: LinkTypesToolboxProps;

    connectionsMenuCommands?: Events<ConnectionsMenuCommands> & EventTrigger<ConnectionsMenuCommands>;
    instancesSearchCommands?: Events<InstancesSearchCommands> & EventTrigger<InstancesSearchCommands>;
}

export function DefaultWorkspace(props: DefaultWorkspaceProps) {
    const {
        leftColumn, rightColumn,
        canvas, connectionsMenu, dropOnCanvas, halo, haloLink, navigator, zoomControl, toolbar,
        classTree, instancesSearch, linkToolbox,
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
                        {navigator === null ? null : <Navigator {...navigator} />}
                        {zoomControl === null ? null : <ZoomControl {...zoomControl} />}
                        {toolbar === null ? null : <DefaultToolbar {...toolbar} />}
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
