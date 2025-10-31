import cx from 'clsx';
import * as React from 'react';

import type { DockDirection } from './viewportDock';

/**
 * Props for {@link DraggableHandle} component.
 *
 * @see {@link DraggableHandle}
 */
export interface DraggableHandleProps extends React.HTMLAttributes<HTMLDivElement> {
    /**
     * Placement styling for the handle for a side or a corner.
     *
     * If not specified, the handle will be rendered without any built-in styling.
     */
    dock?: DockDirection;
    /**
     * Drag axis to receive difference in drag position:
     *  - `x`: receive only `dx` non-zero value in handler;
     *  - `y`: receive only `dy` non-zero value in handler;
     *  - `all`: receive both `dx` and `dy` non-zero values in handler.
     *
     * @default "all"
     */
    axis?: 'x' | 'y' | 'all';
    /**
     * Handler for the start of dragging the handle.
     */
    onBeginDragHandle: (e: React.MouseEvent<HTMLDivElement>) => void;
    /**
     * Handler for each drag movement for the duration of a dragging the handle.
     */
    onDragHandle: (e: MouseEvent, dx: number, dy: number) => void;
    /**
     * Handler for the end of dragging the handle.
     */
    onEndDragHandle?: (e: MouseEvent) => void;
}

const CLASS_NAME = 'reactodia-draggable-handle';
const DOCK_CLASS: Record<DockDirection, string> = {
    'nw': `${CLASS_NAME}--dock-nw`,
    'n':  `${CLASS_NAME}--dock-n`,
    'ne': `${CLASS_NAME}--dock-ne`,
    'e':  `${CLASS_NAME}--dock-e`,
    'se': `${CLASS_NAME}--dock-se`,
    's':  `${CLASS_NAME}--dock-s`,
    'sw': `${CLASS_NAME}--dock-sw`,
    'w':  `${CLASS_NAME}--dock-w`,
};

interface HoldState {
    readonly origin: {
        pageX: number;
        pageY: number;
    };
    readonly target: HTMLDivElement;
    readonly pointerId: number;
    readonly onPointerMove: (e: PointerEvent) => void;
    readonly onPointerUp: (e: PointerEvent) => void;
}

/**
 * Utility component for a draggable handle.
 *
 * @category Components
 */
export function DraggableHandle(props: DraggableHandleProps) {
    const {
        dock, axis = 'all', onBeginDragHandle, onDragHandle, onEndDragHandle, children,
        ...otherProps
    } = props;

    const holdState = React.useRef<HoldState>(undefined);
    const latestOnBegin = useLatest(onBeginDragHandle);
    const latestOnDrag = useLatest(onDragHandle);
    const latestOnEnd = useLatest(onEndDragHandle);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (holdState.current) {
            return;
        }

        if (e.button) {
            /* Allow drag only using left mouse button or other main pointer type */
            return;
        }

        const {pageX, pageY, currentTarget, pointerId} = e;
        e.preventDefault();
        const state: HoldState = {
            origin: {pageX, pageY},
            target: currentTarget,
            pointerId,
            onPointerMove: e => {
                e.preventDefault();
                const {origin} = state;
                latestOnDrag.current(
                    e,
                    axis === 'y' ? 0 : e.pageX - origin.pageX,
                    axis === 'x' ? 0 : e.pageY - origin.pageY
                );
            },
            onPointerUp: e => {
                holdState.current = undefined;
                const {target} = state;
                target.releasePointerCapture(pointerId);
                target.removeEventListener('pointermove', state.onPointerMove);
                target.removeEventListener('pointerup', state.onPointerUp);
                target.removeEventListener('pointercancel', state.onPointerUp);
                latestOnEnd.current?.(e);
            },
        };
        currentTarget.addEventListener('pointermove', state.onPointerMove);
        currentTarget.addEventListener('pointerup', state.onPointerUp);
        currentTarget.addEventListener('pointercancel', state.onPointerUp);
        currentTarget.setPointerCapture(pointerId);

        latestOnBegin.current(e);
    };

    return (
        <div {...otherProps}
            className={cx(
                CLASS_NAME,
                dock ? DOCK_CLASS[dock] : undefined,
                otherProps.className
            )}
            onPointerDown={onPointerDown}>
            {children}
        </div>
    );
}

function useLatest<T>(value: T): { readonly current: T } {
    const ref = React.useRef<T>(value);
    ref.current = value;
    return ref;
}
