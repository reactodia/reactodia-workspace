import * as React from 'react';
import classnames from 'classnames';

import { useWorkspace } from '../workspace/workspaceContext';

import {
    ChangeOperationsEvent, FetchOperation, FetchOperationFail, FetchOperationTargetType,
    FetchOperationTypeToTarget,
} from './dataFetcher';

export interface WithFetchStatusProps<T extends FetchOperationTargetType> {
    type: T;
    target: FetchOperationTypeToTarget[T];
    children: React.ReactElement<{ className?: string }>;
}

enum Status {
    None = 0,
    Loading = 1,
    Error = 2,
}

const CLASS_NAME = 'reactodia-fetch-status';

export function WithFetchStatus<T extends FetchOperationTargetType>(props: WithFetchStatusProps<T>) {
    const {type, target, children} = props;

    const {model} = useWorkspace();

    const [status, setStatus] = React.useState<Status>(
        // Initialize with error status if needed to avoid layout jumps
        model.getOperationFailReason(type, target) ? Status.Error : Status.None
    );

    React.useEffect(() => {
        const checkOperations = (fail?: FetchOperationFail) => {
            setStatus(() => {
                if (fail && isOperationMatch(fail.operation, type, target)) {
                    return Status.Error;
                }

                for (const operation of model.operations) {
                    if (isOperationMatch(operation, type, target)) {
                        return Status.Loading;
                    }
                }

                if (model.getOperationFailReason(type, target)) {
                    return Status.Error;
                }

                return Status.None;
            });
        };

        checkOperations();

        const listener = (e: ChangeOperationsEvent) => {
            checkOperations(e.fail);
        };
        model.events.on('changeOperations', listener);

        return () => model.events.off('changeOperations', listener);
    }, [type, target]);

    if (status === Status.None) {
        return children;
    } else {
        return React.cloneElement(children, {
            className: classnames(children.props.className, (
                status === Status.Loading ? `${CLASS_NAME}--loading` :
                status === Status.Error ? `${CLASS_NAME}--error` :
                undefined
            )),
        });
    }
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
