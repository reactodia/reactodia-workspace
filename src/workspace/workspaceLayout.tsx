import * as React from 'react';

import { Accordion } from './accordion';
import { AccordionItem, DockSide } from './accordionItem';

const DEFAULT_HORIZONTAL_COLLAPSED_SIZE = 28;

interface CommonWorkspaceLayoutProps {
    /**
     * Default size for the layout component.
     *
     * The size is `width` if the component is inside layout row
     * and `height` if it is inside column.
     *
     * **Default** is computed automatically by dividing the space
     * evenly between child components.
     */
    defaultSize?: number;
    /**
     * Whether the layout component is collapsed by default.
     *
     * @default false
     */
    defaultCollapsed?: boolean;
    /**
     * Size to use when the layout component is collapsed.
     *
     * The size is `width` if the component is inside layout row
     * and `height` if it is inside column.
     *
     * **Default** is `28` for a layout row, otherwise it is computed
     * automatically.
     */
    collapsedSize?: number;
    /**
     * Minimum size for the layout component.
     *
     * If the layout component is resized below this size
     * it would be considered collapsed.
     *
     * The size is `width` if the component is inside layout row
     * and `height` if it is inside column.
     */
    minSize?: number;
    /**
     * Disables the docking for the layout component.
     *
     * A layout component with docking displays controls to expand/collapse it
     * if the component is the first or the last one within a column.
     *
     * @default false
     */
    undocked?: boolean;
}

/**
 * Props for `WorkspaceLayoutRow` and `WorkspaceLayoutColumn` components.
 *
 * @see WorkspaceLayoutRow
 * @see WorkspaceLayoutColumn
 */
export interface WorkspaceLayoutContainerProps extends CommonWorkspaceLayoutProps {
    /**
     * Expand/collapse animation duration for the child layout items.
     */
    animationDuration?: number;
    /**
     * Child layout components.
     */
    children: WorkspaceChild | ReadonlyArray<WorkspaceChild>;
}

type WorkspaceChild = React.ReactElement<WorkspaceLayoutContainerProps | WorkspaceLayoutItemProps>;

/**
 * Layout component to display a row of resizable sub-components.
 *
 * This component accepts only layout rows, columns or items as children.
 *
 * @category Components
 * @see WorkspaceLayoutColumn
 * @see WorkspaceLayoutItem
 */
export function WorkspaceLayoutRow(props: WorkspaceLayoutContainerProps) {
    return renderContainer(props, 'row');
}

/**
 * Layout component to display a column of resizable sub-components.
 *
 * This component accepts only layout rows, columns or items as children.
 *
 * @category Components
 * @see WorkspaceLayoutRow
 * @see WorkspaceLayoutItem
 */
export function WorkspaceLayoutColumn(props: WorkspaceLayoutContainerProps) {
    return renderContainer(props, 'column');
}

/**
 * Props for `WorkspaceLayoutItem` component.
 *
 * @see WorkspaceLayoutItem
 */
export interface WorkspaceLayoutItemProps extends CommonWorkspaceLayoutProps {
    /**
     * Unique layout component ID withing the layout component tree.
     */
    id: string;
    /**
     * Heading content for the layout item.
     */
    heading?: React.ReactNode;
    /**
     * Layout item children.
     *
     * When the layout item is collapsed, the children will not render.
     */
    children: React.ReactElement;
}

/**
 * Layout component to display an item withing a layout row or columns.
 *
 * The item may be collapsed, in that case the children will not be rendered.
 *
 * @category Components
 * @see WorkspaceLayoutRow
 * @see WorkspaceLayoutColumn
 */
export function WorkspaceLayoutItem(props: WorkspaceLayoutItemProps) {
    return props.children;
}

/**
 * Context with handlers for layout component events.
 */
export interface WorkspaceLayoutResizeContext {
    /**
     * Handler for starting layout component resize.
     */
    onStartResize?: (direction: 'vertical' | 'horizontal') => void;
    /**
     * Handler for each size change while resizing a layout component.
     */
    onResize?: (direction: 'vertical' | 'horizontal') => void;
}

/**
 * React context with handlers for layout component events.
 */
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
