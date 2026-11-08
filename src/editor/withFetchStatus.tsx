import cx from 'clsx';
import * as React from 'react';

import { useWorkspace } from '../workspace/workspaceContext';

import {
    ChangeOperationsEvent, FetchOperation, FetchOperationFail, FetchOperationTargetType,
    FetchOperationTypeToTarget,
} from './dataFetcher';

/**
 * Props for {@link WithFetchStatus} component.
 *
 * @see {@link WithFetchStatus}
 */
export interface WithFetchStatusProps<T extends FetchOperationTargetType> {
    /**
     * Fetch operation type.
     */
    type: T;
    /**
     * Fetch operation target.
     */
    target: FetchOperationTypeToTarget[T];
    /**
     * Decorated element.
     */
    children: React.ReactElement<{ className?: string }>;
}

const CLASS_NAME = 'reactodia-fetch-status';

/**
 * Decorator component that styles the child element based on the fetching status
 * of the graph operation target.
 *
 * Depending on the fetch status, the child element will be rendered
 * with an additional CSS class:
 *   - none or finished - no additional classes;
 *   - loading - `reactodia-fetch-status--loading`;
 *   - failed - `reactodia-fetch-status--error`.
 *
 * @category Components
 * @see {@link FetchOperation}
 */
export function WithFetchStatus<T extends FetchOperationTargetType>(props: WithFetchStatusProps<T>) {
    const {type, target, children} = props;

    const status = useFetchStatus({type, target});

    if (status === undefined) {
        return children;
    } else {
        return React.cloneElement(children, {
            className: cx(children.props.className, (
                status === 'loading' ? `${CLASS_NAME}--loading` :
                status === 'error' ? `${CLASS_NAME}--error` :
                undefined
            )),
        });
    }
}

export function useFetchStatus<T extends FetchOperationTargetType>(params: {
    /**
     * Fetch operation type.
     */
    type: T;
    /**
     * Fetch operation target.
     */
    target: FetchOperationTypeToTarget[T] | undefined;
}): 'loading' | 'error' | undefined {
    const {type, target} = params;
    const {model} = useWorkspace();

    const [status, setStatus] = React.useState<'loading' | 'error' | undefined>(
        // Initialize with error status if needed to avoid layout jumps
        target !== undefined && model.getOperationFailReason(type, target)
            ? 'error' : undefined
    );

    React.useEffect(() => {
        const checkOperations = (fail?: FetchOperationFail) => {
            setStatus(() => {
                if (target) {
                    if (fail && isOperationMatch(fail.operation, type, target)) {
                        return 'error';
                    }

                    for (const operation of model.operations) {
                        if (isOperationMatch(operation, type, target)) {
                            return 'loading';
                        }
                    }

                    if (model.getOperationFailReason(type, target)) {
                        return 'error';
                    }
                }
                return undefined;
            });
        };

        checkOperations();

        const listener = (e: ChangeOperationsEvent) => {
            checkOperations(e.fail);
        };
        model.events.on('changeOperations', listener);

        return () => model.events.off('changeOperations', listener);
    }, [type, target]);

    return status;
}

function isOperationMatch(
    operation: FetchOperation,
    type: FetchOperationTargetType,
    target: string
): boolean {
    type AnyTargets = ReadonlySet<string>;
    return (
        operation.type === type &&
        (operation.targets as AnyTargets).has(target)
    );
}
