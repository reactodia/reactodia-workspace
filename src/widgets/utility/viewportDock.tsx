import cx from 'clsx';
import * as React from 'react';

/**
 * Compass-like direction for the dock side:
 *  - `nw`: north-west (top-left)
 *  - `n`: north (top)
 *  - `ne`: north-east (top-right)
 *  - `e`: east (right)
 *  - `se`: south-east (bottom-right)
 *  - `s`: south (bottom)
 *  - `sw`: south-west (bottom-left)
 *  - `w`: west (left)
 */
export type DockDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const VIEWPORT_WIDGET_CLASS = 'reactodia-viewport-dock';
const DOCK_CONTAINER_CLASS: Partial<Record<DockDirection, string>> = {
    'n': `${VIEWPORT_WIDGET_CLASS}--row-n`,
    's': `${VIEWPORT_WIDGET_CLASS}--row-s`,
    'w': `${VIEWPORT_WIDGET_CLASS}--column-w`,
    'e': `${VIEWPORT_WIDGET_CLASS}--column-e`,
};
const DOCK_DIRECTION_CLASS: Record<DockDirection, string> = {
    'nw': `${VIEWPORT_WIDGET_CLASS}--dock-nw`,
    'n':  `${VIEWPORT_WIDGET_CLASS}--dock-n`,
    'ne': `${VIEWPORT_WIDGET_CLASS}--dock-ne`,
    'e':  `${VIEWPORT_WIDGET_CLASS}--dock-e`,
    'se': `${VIEWPORT_WIDGET_CLASS}--dock-se`,
    's':  `${VIEWPORT_WIDGET_CLASS}--dock-s`,
    'sw': `${VIEWPORT_WIDGET_CLASS}--dock-sw`,
    'w':  `${VIEWPORT_WIDGET_CLASS}--dock-w`,
};
const DOCK_ALIGN_X: Record<DockDirection, DockAlignment> = {
    'nw': 'start',
    'n':  'center',
    'ne': 'end',
    'e':  'end',
    'se': 'end',
    's':  'center',
    'sw': 'start',
    'w':  'start',
};
const DOCK_ALIGN_Y: Record<DockDirection, DockAlignment> = {
    'nw': 'start',
    'n':  'start',
    'ne': 'start',
    'e':  'center',
    'se': 'end',
    's':  'end',
    'sw': 'end',
    'w':  'center',
};

/**
 * Props for {@link ViewportDock} component.
 *
 * @see {@link ViewportDock}
 */
export interface ViewportDockProps {
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Dock direction on the canvas viewport.
     */
    dock: DockDirection;
    /**
     * Horizontal offset from the dock direction.
     */
    dockOffsetX?: number;
    /**
     * Vertical offset from the dock direction.
     */
    dockOffsetY?: number;
    /**
     * Docked at the canvas viewport element.
     */
    children: React.ReactElement<{ className?: string }>;
}

/**
 * Utility component to dock a canvas widget content to a viewport location.
 *
 * @category Components
 */
export function ViewportDock(props: ViewportDockProps) {
    const {dock, dockOffsetX = 0, dockOffsetY = 0, children} = props;
    const style = {
        '--reactodia-viewport-dock-offset-x': `${dockOffsetX}px`,
        '--reactodia-viewport-dock-offset-y': `${dockOffsetY}px`,
        '--reactodia-viewport-dock-align-x': DOCK_ALIGN_X[dock],
        '--reactodia-viewport-dock-align-y': DOCK_ALIGN_Y[dock],
    } as React.CSSProperties;
    return (
        <div
            className={cx(
                VIEWPORT_WIDGET_CLASS,
                DOCK_CONTAINER_CLASS[dock] ?? `${VIEWPORT_WIDGET_CLASS}--corner`
            )}
            style={style}>
            {React.cloneElement(children, {
                className: cx(
                    children.props.className,
                    DOCK_DIRECTION_CLASS[dock]
                ),
            })}
        </div>
    );
}

export type DockAlignment = 'start' | 'center' | 'end';

export function getParentDockAlignment(
    target: Element
): [x: DockAlignment | undefined, y: DockAlignment | undefined] {
    const style = getComputedStyle(target);
    return [
        style.getPropertyValue('--reactodia-viewport-dock-align-x') as DockAlignment | undefined,
        style.getPropertyValue('--reactodia-viewport-dock-align-y') as DockAlignment | undefined,
    ];
}

export function getParentDockMargin(
    target: Element
): number | undefined {
    const style = getComputedStyle(target);
    const rawValue = style.getPropertyValue('--reactodia-viewport-dock-margin');
    if (rawValue) {
        const value = parseFloat(rawValue);
        if (Number.isFinite(value)) {
            return value;
        }
    }
    return undefined;
}
