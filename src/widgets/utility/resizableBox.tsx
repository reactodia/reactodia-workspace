import * as React from 'react';
import cx from 'clsx';

import { Rect, Vector } from '../../diagram/geometry';

import { DraggableHandle } from './draggableHandle';

const CLASS_NAME = 'reactodia-resizable-box';

export function ResizableBox(props: {
    className?: string;
    mapCoordsFromPage: (x: number, y: number) => Vector;
    startResize: () => ResizableBoxOperation;
    minWidth?: number;
    minHeight?: number;
}) {
    const {
        className, mapCoordsFromPage, startResize, minWidth = 0, minHeight = 0,
    } = props;
    const [operation, setOperation] = React.useState<ResizableBoxOperation>();
    
    const onBeginDragHandle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setOperation(startResize());
    };

    const onEndDragHandle = () => {
        operation?.end();
        setOperation(undefined);
    };

    const resize = (dx: number, dy: number, dw: number, dh: number) => {
        if (!operation) {
            return;
        }
        const {initialBounds} = operation;
        const origin = mapCoordsFromPage(0, 0);
        const {x: mappedDx, y: mappedDy} = Vector.subtract(mapCoordsFromPage(dx, dy), origin);
        const {x: mappedDw, y: mappedDh} = Vector.subtract(mapCoordsFromPage(dw, dh), origin);
        const nextBounds: Rect = {
            x: Math.min(initialBounds.x + mappedDx, initialBounds.x + initialBounds.width - minWidth),
            y: Math.min(initialBounds.y + mappedDy, initialBounds.y + initialBounds.height - minHeight),
            width: Math.max(initialBounds.width + mappedDw, minWidth),
            height: Math.max(initialBounds.height + mappedDh, minHeight),
        };
        operation.onResize(nextBounds);
    };

    React.useEffect(() => {
        return () => operation?.end();
    }, []);

    const handleCorner = (
        <svg className={`${CLASS_NAME}__corner`} viewBox='-2 -2 14 14'>
            <circle cx={5} cy={5} r={5} />
        </svg>
    );

    const handleVertical = (
        <svg className={`${CLASS_NAME}__vertical`} viewBox='-2 -2 34 14'>
            <rect x={0} y={0} rx={2} ry={2} width={30} height={10} />
        </svg>
    );

    const handleHorizontal = (
        <svg className={`${CLASS_NAME}__horizontal`} viewBox='-2 -2 14 34'>
            <rect x={0} y={0} rx={2} ry={2} width={10} height={30} />
        </svg>
    );

    const HANDLE_CLASS = `${CLASS_NAME}__handle`;
    return (
        <div className={cx(CLASS_NAME, className)}>
            <DraggableHandle
                className={HANDLE_CLASS}
                dock='n'
                onBeginDragHandle={onBeginDragHandle}
                onEndDragHandle={onEndDragHandle}
                onDragHandle={(e, dx, dy) => resize(0, dy, 0, -dy)}>
                {handleVertical}
            </DraggableHandle>
            <DraggableHandle
                className={HANDLE_CLASS}
                dock='s'
                onBeginDragHandle={onBeginDragHandle}
                onEndDragHandle={onEndDragHandle}
                onDragHandle={(e, dx, dy) => resize(0, 0, 0, dy)}>
                {handleVertical}
            </DraggableHandle>
            <DraggableHandle
                className={HANDLE_CLASS}
                dock='w'
                onBeginDragHandle={onBeginDragHandle}
                onEndDragHandle={onEndDragHandle}
                onDragHandle={(e, dx, dy) => resize(dx, 0, -dx, 0)}>
                {handleHorizontal}
            </DraggableHandle>
            <DraggableHandle
                className={HANDLE_CLASS}
                dock='e'
                onBeginDragHandle={onBeginDragHandle}
                onEndDragHandle={onEndDragHandle}
                onDragHandle={(e, dx, dy) => resize(0, 0, dx, 0)}>
                {handleHorizontal}
            </DraggableHandle>
            <DraggableHandle
                className={HANDLE_CLASS}
                dock='nw'
                onBeginDragHandle={onBeginDragHandle}
                onEndDragHandle={onEndDragHandle}
                onDragHandle={(e, dx, dy) => resize(dx, dy, -dx, -dy)}>
                {handleCorner}
            </DraggableHandle>
            <DraggableHandle
                className={HANDLE_CLASS}
                dock='ne'
                onBeginDragHandle={onBeginDragHandle}
                onEndDragHandle={onEndDragHandle}
                onDragHandle={(e, dx, dy) => resize(0, dy, dx, -dy)}>
                {handleCorner}
            </DraggableHandle>
            <DraggableHandle
                className={HANDLE_CLASS}
                dock='sw'
                onBeginDragHandle={onBeginDragHandle}
                onEndDragHandle={onEndDragHandle}
                onDragHandle={(e, dx, dy) => resize(dx, 0, -dx, dy)}>
                {handleCorner}
            </DraggableHandle>
            <DraggableHandle
                className={HANDLE_CLASS}
                dock='se'
                onBeginDragHandle={onBeginDragHandle}
                onEndDragHandle={onEndDragHandle}
                onDragHandle={(e, dx, dy) => resize(0, 0, dx, dy)}>
                {handleCorner}
            </DraggableHandle>
        </div>
    );
}

export interface ResizableBoxOperation {
    readonly initialBounds: Rect;
    onResize(bounds: Rect): void;
    end(): void;
}
