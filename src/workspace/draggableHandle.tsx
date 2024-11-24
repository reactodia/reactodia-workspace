import * as React from 'react';

/**
 * Props for `DraggableHandle` component.
 *
 * @see DraggableHandle
 */
export interface DraggableHandleProps extends React.HTMLAttributes<HTMLDivElement> {
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

/**
 * Utility component for a draggable handle.
 *
 * @category Components
 */
export class DraggableHandle extends React.Component<DraggableHandleProps> {
    private holdState: {
        readonly origin: {
            pageX: number;
            pageY: number;
        };
        readonly target: HTMLDivElement;
        readonly pointerId: number;
    } | undefined;

    /** @hidden */
    render() {
        const {onBeginDragHandle, onDragHandle, onEndDragHandle, ...props} = this.props;
        return (
            <div {...props} onPointerDown={this.onPointerDown}>
                {this.props.children}
            </div>
        );
    }

    /** @hidden */
    componentWillUnmount() {
        this.removeListeners();
    }

    private onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (this.holdState || e.target !== e.currentTarget) {
            return;
        }

        if (e.button) {
            /* Allow drag only using left mouse button or other main pointer type */
            return;
        }

        const {pageX, pageY, currentTarget, pointerId} = e;
        e.preventDefault();
        this.holdState = {
            origin: {pageX, pageY},
            target: currentTarget,
            pointerId,
        };
        currentTarget.addEventListener('pointermove', this.onPointerMove);
        currentTarget.addEventListener('pointerup', this.onPointerUp);
        currentTarget.addEventListener('pointercancel', this.onPointerUp);
        currentTarget.setPointerCapture(pointerId);

        const {onBeginDragHandle} = this.props;
        onBeginDragHandle(e);
    };

    private onPointerMove = (e: PointerEvent) => {
        if (!this.holdState) {
            return;
        }
        e.preventDefault();
        const {origin} = this.holdState;
        const {axis, onDragHandle} = this.props;
        onDragHandle(
            e,
            axis === 'y' ? 0 : e.pageX - origin.pageX,
            axis === 'x' ? 0 : e.pageY - origin.pageY
        );
    };

    private onPointerUp = (e: PointerEvent) => {
        this.removeListeners();
        const {onEndDragHandle} = this.props;
        onEndDragHandle?.(e);
    };

    private removeListeners() {
        if (this.holdState) {
            const {target, pointerId} = this.holdState;
            this.holdState = undefined;
            target.releasePointerCapture(pointerId);
            target.removeEventListener('pointermove', this.onPointerMove);
            target.removeEventListener('pointerup', this.onPointerUp);
            target.removeEventListener('pointercancel', this.onPointerUp);
        }
    }
}
