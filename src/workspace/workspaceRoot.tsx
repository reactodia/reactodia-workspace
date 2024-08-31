import * as React from 'react';
import classnames from 'classnames';

export interface WorkspaceRootProps {
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
}

const CLASS_NAME = 'reactodia-workspace';

/**
 * @category Components
 */
export function WorkspaceRoot(props: WorkspaceRootProps) {
    return (
        <div className={classnames(CLASS_NAME, props.className)}
            style={props.style}>
            {props.children}
        </div>
    );
}
