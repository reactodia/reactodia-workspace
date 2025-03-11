import type { Events } from '../coreUtils/events';

import type { ConnectionsMenuCommands } from '../widgets/connectionsMenu';
import type { InstancesSearchCommands } from '../widgets/instancesSearch';
import type { UnifiedSearchCommands } from '../widgets/unifiedSearch';
import type { VisualAuthoringCommands } from '../widgets/visualAuthoring';

/**
 * Represents a workspace extension definition.
 *
 * Currently, an extension is defined as having a common event bus to
 * communicate between different components.
 */
export class WorkspaceExtension<T> {
    private __commandsMarker: Events<T> | undefined;

    private constructor() {}

    /**
     * Defines a new workspace extension.
     *
     * **Experimental**: this feature will likely change in the future.
     */
    static define<T>() {
        return new WorkspaceExtension<T>();
    }
}

/**
 * Event bus to connect {@link ConnectionMenu} to other components.
 */
export const ConnectionsMenuExtension = WorkspaceExtension.define<ConnectionsMenuCommands>();
/**
 * Event bus to connect {@link InstancesSearch} to other components.
 */
export const InstancesSearchExtension = WorkspaceExtension.define<InstancesSearchCommands>();
/**
 * Event bus to connect {@link UnifiedSearch} to other components.
 */
export const UnifiedSearchExtension = WorkspaceExtension.define<UnifiedSearchCommands>();
/**
 * Event bus to connect {@link VisualAuthoring} to other components.
 */
export const VisualAuthoringExtension = WorkspaceExtension.define<VisualAuthoringCommands>();
