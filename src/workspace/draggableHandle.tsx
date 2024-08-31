import * as React from 'react';

export interface DraggableHandleProps extends React.HTMLAttributes<HTMLDivElement> {
    onBeginDragHandle: (e: React.MouseEvent<HTMLDivElement>) => void;
    onDragHandle: (e: MouseEvent, dx: number, dy: number) => void;
    onEndDragHandle?: (e: MouseEvent) => void;
}

/**
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
        const {onDragHandle} = this.props;
        onDragHandle(
            e,
            e.pageX - origin.pageX,
            e.pageY - origin.pageY
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
