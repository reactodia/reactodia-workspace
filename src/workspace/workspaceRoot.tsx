import * as React from 'react';
import classnames from 'classnames';

import { WorkspaceLayoutResizeContext } from './workspaceLayout';

export interface WorkspaceRootProps {
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
}

const CLASS_NAME = 'ontodia-workspace';

export function WorkspaceRoot(props: WorkspaceRootProps) {
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const untilMouseUpClasses = React.useRef<string[]>([]);

    React.useLayoutEffect(() => {
        const onDocumentMouseUp = () => {
            for (const className of untilMouseUpClasses.current) {
                rootRef.current!.classList.remove(className);
            }
            untilMouseUpClasses.current.length = 0;
        };

        document.addEventListener('mouseup', onDocumentMouseUp);
        return () => {
            document.removeEventListener('mouseup', onDocumentMouseUp);
        };
    }, []);

    const untilMouseUp = React.useCallback((params: {
        preventTextSelection?: boolean;
        horizontalResizing?: boolean;
        verticalResizing?: boolean;
    }) => {
        untilMouseUpClasses.current.length = 0;
        if (params.preventTextSelection) {
            untilMouseUpClasses.current.push(`${CLASS_NAME}--unselectable`);
        }
        if (params.horizontalResizing) {
            untilMouseUpClasses.current.push(`${CLASS_NAME}--horizontal-resizing`);
        }
        if (params.verticalResizing) {
            untilMouseUpClasses.current.push(`${CLASS_NAME}--vertical-resizing`);
        }
    
        for (const className of untilMouseUpClasses.current) {
            rootRef.current!.classList.add(className);
        }
    }, []);

    const resizeContext = React.useMemo<WorkspaceLayoutResizeContext>(() => ({
        onStartResize: direction => {
            untilMouseUp({
                preventTextSelection: true,
                horizontalResizing: direction === 'horizontal',
                verticalResizing: direction === 'vertical',
            });
        }
    }), [untilMouseUp]);

    return (
        <div ref={rootRef}
            className={classnames(CLASS_NAME, props.className)}
            style={props.style}>
            <WorkspaceLayoutResizeContext.Provider value={resizeContext}>
                {props.children}
            </WorkspaceLayoutResizeContext.Provider>
        </div>
    );
}
