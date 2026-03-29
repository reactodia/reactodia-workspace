import * as React from 'react';

import { TranslationContext } from '../coreUtils/i18n';

import { Accordion } from './accordion';
import { AccordionItem, DockSide } from './accordionItem';

const DEFAULT_HORIZONTAL_COLLAPSED_SIZE = 28;

interface CommonWorkspaceLayoutProps {
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Additional CSS styles for the component.
     */
    style?: React.CSSProperties;
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
 * Props for {@link WorkspaceLayoutRow} and {@link WorkspaceLayoutColumn} components.
 *
 * @see {@link WorkspaceLayoutRow}
 * @see {@link WorkspaceLayoutColumn}
 */
export interface WorkspaceLayoutContainerProps extends CommonWorkspaceLayoutProps {
    /**
     * Unique layout container ID withing the layout component tree.
     */
    id?: string;
    /**
     * Expand/collapse animation duration for the child layout items.
     *
     * **Default** is set by `--reactodia-accordion-transition-duration` CSS property.
     */
    animationDuration?: number;
    /**
     * Child layout components.
     */
    children: WorkspaceChild | ReadonlyArray<WorkspaceChild>;
}

type WorkspaceChild =
    React.ReactElement<WorkspaceLayoutContainerProps | WorkspaceLayoutItemProps> | null;

/**
 * Layout component to display a row of resizable sub-components.
 *
 * This component accepts only layout rows, columns or items as children.
 *
 * @category Components
 * @see {@link WorkspaceLayoutColumn}
 * @see {@link WorkspaceLayoutItem}
 */
export function WorkspaceLayoutRow(props: WorkspaceLayoutContainerProps) {
    return <WorkspaceContainer {...props} type='row' />;
}

/**
 * Layout component to display a column of resizable sub-components.
 *
 * This component accepts only layout rows, columns or items as children.
 *
 * @category Components
 * @see {@link WorkspaceLayoutRow}
 * @see {@link WorkspaceLayoutItem}
 */
export function WorkspaceLayoutColumn(props: WorkspaceLayoutContainerProps) {
    return <WorkspaceContainer {...props} type='column' />;
}

/**
 * Props for {@link WorkspaceLayoutItem} component.
 *
 * @see {@link WorkspaceLayoutItem}
 */
export interface WorkspaceLayoutItemProps extends CommonWorkspaceLayoutProps {
    /**
     * Unique layout component ID withing the layout component tree.
     */
    id: string;
    /**
     * ARIA-label to mark `<section>` layout item with.
     *
     * **Default** is `heading` value if it is a string otherwise `undefined`.
     */
    'aria-label'?: string;
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
 * @see {@link WorkspaceLayoutRow}
 * @see {@link WorkspaceLayoutColumn}
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

function WorkspaceContainer(props: WorkspaceLayoutContainerProps & { type: 'row' | 'column' }) {
    const {type, className, style, animationDuration, children} = props;
    const resizeContext = React.useContext(WorkspaceLayoutResizeContext);
    const t = React.useContext(TranslationContext);
    const childCount = React.Children.count(children);
    const items = React.Children.map(children, (child, index) => {
        if (child === null) {
            return child;
        }
        const childId = child.props.id ?? `${type}-child-${index}`;
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
                id={childId}
                key={childId}
                className={
                    child.type === WorkspaceLayoutItem ? child.props.className : undefined
                }
                style={
                    child.type === WorkspaceLayoutItem ? child.props.style : undefined
                }
                ariaLabel={
                    child.type === WorkspaceLayoutItem
                        ? (child.props as WorkspaceLayoutItemProps)['aria-label']
                        : undefined
                }
                heading={
                    child.type === WorkspaceLayoutItem
                        ? (child.props as WorkspaceLayoutItemProps).heading
                        : undefined
                }
                dockSide={dockSide}
                titleDockExpand={t?.textOptional('workspace_layout.toggle_expand.title')}
                titleDockCollapse={t?.textOptional('workspace_layout.toggle_collapse.title')}
                defaultSize={child.props.defaultSize}
                defaultCollapsed={child.props.defaultCollapsed}
                collapsedSize={collapsedSize}
                minSize={child.props.minSize}>
                {child}
            </AccordionItem>
        );
    });
    return (
        <Accordion className={className}
            style={style}
            direction={type === 'row' ? 'horizontal' : 'vertical'}
            onStartResize={resizeContext?.onStartResize}
            onResize={resizeContext?.onResize ?? (() => undefined)}
            animationDuration={animationDuration}>
            {items}
        </Accordion>
    );
}
