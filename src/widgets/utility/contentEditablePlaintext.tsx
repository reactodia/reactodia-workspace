import * as React from 'react';

export function ContentEditablePlaintext(props: {
    className?: string;
    style?: React.CSSProperties;
    text: string;
    setText: (value: string) => void;
    isEditing: boolean;
    setEditing: (value: boolean) => void;
}) {
    const {className, style, text, setText, isEditing, setEditing} = props;
    const editorRef = React.useRef<HTMLDivElement>(null);

    React.useLayoutEffect(() => {
        const editor = editorRef.current;
        if (isEditing && editor) {
            editor.focus();
            window.getSelection()?.selectAllChildren(editor);
        }
    }, [isEditing]);

    React.useLayoutEffect(() => {
        const editor = editorRef.current;
        if (editor) {
            editor.innerText = text || '\n';
        }
    }, [text]);

    return (
        <p ref={editorRef}
            className={className}
            style={style}
            contentEditable={isEditing ? 'plaintext-only' : undefined}
            onPointerDown={e => {
                if (isEditing) {
                    e.stopPropagation();
                }
            }}
            onKeyDown={e => {
                if (isEditing) {
                    e.stopPropagation();
                }
            }}
            onKeyUp={e => {
                if (isEditing) {
                    e.stopPropagation();
                    if (e.key === 'Escape') {
                        document.getSelection()?.removeAllRanges();
                        editorRef.current?.blur();
                    }
                }
            }}
            onBlur={e => {
                const changedText = (editorRef.current?.innerText ?? '').trim();
                setEditing(false);
                setText(changedText);
            }}>
        </p>
    );
}
