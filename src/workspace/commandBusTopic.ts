import type { Events } from '../coreUtils/events';

import type { ConnectionsMenuCommands } from '../widgets/connectionsMenu';
import type { InstancesSearchCommands } from '../widgets/instancesSearch';
import type { UnifiedSearchCommands } from '../widgets/unifiedSearch';
import type { VisualAuthoringCommands } from '../widgets/visualAuthoring';

/**
 * Represents a definition for an event bus to communicate
 * between related components with the same topic.
 */
export class CommandBusTopic<T> {
    private __commandsMarker: Events<T> | undefined;

    private constructor() {}

    /**
     * Defines a new command event topic.
     */
    static define<T>() {
        return new CommandBusTopic<T>();
    }
}

/**
 * Event bus to connect {@link ConnectionMenu} to other components.
 */
export const ConnectionsMenuTopic = CommandBusTopic.define<ConnectionsMenuCommands>();
/**
 * Event bus to connect {@link InstancesSearch} to other components.
 */
export const InstancesSearchTopic = CommandBusTopic.define<InstancesSearchCommands>();
/**
 * Event bus to connect {@link UnifiedSearch} to other components.
 */
export const UnifiedSearchTopic = CommandBusTopic.define<UnifiedSearchCommands>();
/**
 * Event bus to connect {@link VisualAuthoring} to other components.
 */
export const VisualAuthoringTopic = CommandBusTopic.define<VisualAuthoringCommands>();
