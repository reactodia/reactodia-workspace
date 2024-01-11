import * as React from 'react';
import classnames from 'classnames';

import { ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri } from '../data/model';

import { useWorkspace } from '../workspace/workspaceContext';

import { ChangeOperationsEvent, FetchOperation, FetchOperationFail } from './dataFetcher';

export interface WithFetchStatusProps<T extends ListenableOperationTypes> {
    type: T;
    target: TypeToTarget[T];
    children: React.ReactElement<{ className?: string }>;
}

type ListenableOperationTypes = Exclude<FetchOperation['type'], 'link'>;

interface TypeToTarget {
    'element': ElementIri;
    'elementType': ElementTypeIri;
    'linkType': LinkTypeIri;
    'propertyType': PropertyTypeIri;
}

enum Status {
    None = 0,
    Loading = 1,
    Error = 2,
}

const CLASS_NAME = 'reactodia-fetch-status';

export function WithFetchStatus<T extends ListenableOperationTypes>(props: WithFetchStatusProps<T>) {
    const {type, target, children} = props;

    const {model} = useWorkspace();

    const [status, setStatus] = React.useState<Status>(Status.None);

    React.useEffect(() => {
        const checkOperations = (fail?: FetchOperationFail) => {
            setStatus(previous => {
                if (previous === Status.Error) {
                    return Status.Error;
                } else if (fail && isOperationMatch(fail.operation, type, target)) {
                    return Status.Error;
                } else {
                    let loading: FetchOperation | undefined;
                    for (const operation of model.operations) {
                        if (isOperationMatch(operation, type, target)) {
                            loading = operation;
                            break;
                        }
                    }
                    return loading ? Status.Loading : Status.None;
                }
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
    type: ListenableOperationTypes,
    target: string
): boolean {
    type AnyTargets = ReadonlySet<string>;
    return (
        operation.type === type &&
        (operation.targets as AnyTargets).has(target)
    );
}
