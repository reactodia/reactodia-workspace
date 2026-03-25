import * as React from 'react';

export function DropZone(props: {
    className?: string;
    allowDrop?: (item: DataTransferItem) => void;
    onSelect: (files: File[]) => void;
    children?: React.ReactNode;
}) {
    const {className, allowDrop, onSelect, children} = props;
    const [dragState, setDragState] = React.useState<'accept' | 'reject' | undefined>();
    return (
        <div className={className}
            data-reactodia-drop-zone
            data-reactodia-drag-state={dragState}
            onDragOver={e => {
                const items = Array.from(e.dataTransfer.items).filter(item => item.kind === 'file');
                if (items.length > 0) {
                    e.preventDefault();
                    const accept = items.some(item => !allowDrop || allowDrop(item));
                    e.dataTransfer.dropEffect = accept ? 'copy' : 'none';
                    setDragState(accept ? 'accept' : 'reject');
                }
            }}
            onDragLeave={() => setDragState(undefined)}
            onDragEnd={() => setDragState(undefined)}
            onDrop={e => {
                e.preventDefault();
                const files = Array.from(e.dataTransfer.items)
                    .filter(item => !allowDrop || allowDrop(item))
                    .map(item => item.getAsFile())
                    .filter(file => file !== null);
                if (files.length > 0) {
                    onSelect(files);
                }
                setDragState(undefined);
            }}>
            {children}
        </div>
    );
}

function isDropZone(node: Node): boolean {
    let current: Node | null = node;
    while (current) {
        if (current instanceof HTMLElement && current.hasAttribute('data-reactodia-drop-zone')) {
            return true;
        }
        current = current.parentNode;
    }
    return false;
}

export function useDisallowDropOutsideZone(
    topLevel: Pick<HTMLElement, 'addEventListener' | 'removeEventListener'>
): void {
    React.useEffect(() => {
        const handler = (e: DragEvent) => {
            if (e.dataTransfer) {
                const items = Array.from(e.dataTransfer.items).filter(item => item.kind === 'file');
                if (items.length > 0) {
                    e.preventDefault();
                    if (!(e.target instanceof Node && isDropZone(e.target))) {
                        e.dataTransfer.dropEffect = 'none';
                    }
                }
            }
        };
        topLevel.addEventListener('dragover', handler);
        return () => topLevel.removeEventListener('dragover', handler);
    }, [topLevel]);
}
