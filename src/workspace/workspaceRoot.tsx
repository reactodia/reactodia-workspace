import * as React from 'react';
import classnames from 'classnames';

/**
 * Props for `WorkspaceRoot` component.
 *
 * @see WorkspaceRoot
 */
export interface WorkspaceRootProps {
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Additional CSS styles for the component.
     */
    style?: React.CSSProperties;
    /**
     * Component children.
     */
    children: React.ReactNode;
}

const CLASS_NAME = 'reactodia-workspace';

/**
 * Component to establish inheritable style defaults for the workspace.
 *
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
