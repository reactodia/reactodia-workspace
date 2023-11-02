import * as React from 'react';

export interface DraggableHandleProps extends React.HTMLAttributes<HTMLDivElement> {
    onBeginDragHandle: (e: React.MouseEvent<HTMLDivElement>) => void;
    onDragHandle: (e: MouseEvent, dx: number, dy: number) => void;
    onEndDragHandle?: (e: MouseEvent) => void;
}

export class DraggableHandle extends React.Component<DraggableHandleProps, {}> {
    private holdOriginPage: {
        x: number;
        y: number;
    } | undefined;

    render() {
        // remove custom handlers from `div` props
        // tslint:disable-next-line:no-unused-variable
        const {onBeginDragHandle, onDragHandle, onEndDragHandle, ...props} = this.props;
        return <div {...props} onMouseDown={this.onHandleMouseDown}>
            {this.props.children}
        </div>;
    }

    componentWillUnmount() {
        this.removeListeners();
    }

    private onHandleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget) { return; }
        if (this.holdOriginPage) { return; }

        const LEFT_BUTTON = 0;
        if (e.button !== LEFT_BUTTON) { return; }

        this.holdOriginPage = {
            x: e.pageX,
            y: e.pageY,
        };
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
        this.props.onBeginDragHandle(e);
    }

    private onMouseMove = (e: MouseEvent) => {
        if (!this.holdOriginPage) { return; }
        e.preventDefault();
        this.props.onDragHandle(
            e,
            e.pageX - this.holdOriginPage.x,
            e.pageY - this.holdOriginPage.y
        );
    }

    private onMouseUp = (e: MouseEvent) => {
        this.removeListeners();
        if (this.props.onEndDragHandle) {
            this.props.onEndDragHandle(e);
        }
    }

    private removeListeners() {
        if (this.holdOriginPage) {
            this.holdOriginPage = undefined;
            document.removeEventListener('mousemove', this.onMouseMove);
            document.removeEventListener('mouseup', this.onMouseUp);
        }
    }
}
