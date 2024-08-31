import * as React from 'react';

import { Accordion } from './accordion';
import { AccordionItem, DockSide } from './accordionItem';

const DEFAULT_HORIZONTAL_COLLAPSED_SIZE = 28;

interface CommonWorkspaceLayoutProps {
    defaultSize?: number;
    defaultCollapsed?: boolean;
    collapsedSize?: number;
    minSize?: number;
    undocked?: boolean;
}

export interface WorkspaceLayoutContainerProps extends CommonWorkspaceLayoutProps {
    animationDuration?: number;
    children: WorkspaceChild | ReadonlyArray<WorkspaceChild>;
}

type WorkspaceChild = React.ReactElement<WorkspaceLayoutContainerProps | WorkspaceLayoutItemProps>;

/**
 * @category Components
 */
export function WorkspaceLayoutRow(props: WorkspaceLayoutContainerProps) {
    return renderContainer(props, 'row');
}

/**
 * @category Components
 */
export function WorkspaceLayoutColumn(props: WorkspaceLayoutContainerProps) {
    return renderContainer(props, 'column');
}

export interface WorkspaceLayoutItemProps extends CommonWorkspaceLayoutProps {
    id: string;
    heading?: React.ReactNode;
    children: React.ReactElement;
}

/**
 * @category Components
 */
export function WorkspaceLayoutItem(props: WorkspaceLayoutItemProps) {
    return props.children;
}

export interface WorkspaceLayoutResizeContext {
    onStartResize?: (direction: 'vertical' | 'horizontal') => void;
    onResize?: (direction: 'vertical' | 'horizontal') => void;
}

export const WorkspaceLayoutResizeContext = React.createContext<WorkspaceLayoutResizeContext | null>(null);

function renderContainer(props: WorkspaceLayoutContainerProps, type: 'row' | 'column') {
    const {animationDuration, children} = props;
    const resizeContext = React.useContext(WorkspaceLayoutResizeContext);
    const childCount = React.Children.count(children);
    const items = React.Children.map(children, (child, index) => {
        let dockSide: DockSide | undefined;
        if (type === 'row' && !child.props.undocked) {
            if (index === 0) {
                dockSide = DockSide.Left;
            } else if (index === childCount - 1) {
                dockSide = DockSide.Right;
            }
        }
        let collapsedSize = child.props.collapsedSize;
        if (collapsedSize === undefined && type === 'row') {
            collapsedSize = DEFAULT_HORIZONTAL_COLLAPSED_SIZE;
        }
        return (
            <AccordionItem
                key={child.type === WorkspaceLayoutItem
                    ? (child.props as WorkspaceLayoutItemProps).id : index
                }
                heading={child.type === WorkspaceLayoutItem
                    ? (child.props as WorkspaceLayoutItemProps).heading : undefined
                }
                dockSide={dockSide}
                defaultSize={child.props.defaultSize}
                defaultCollapsed={child.props.defaultCollapsed}
                collapsedSize={collapsedSize}
                minSize={child.props.minSize}>
                {child}
            </AccordionItem>
        );
    });
    return (
        <Accordion direction={type === 'row' ? 'horizontal' : 'vertical'}
            onStartResize={resizeContext?.onStartResize}
            onResize={resizeContext?.onResize}
            animationDuration={animationDuration}>
            {items}
        </Accordion>
    );
}
