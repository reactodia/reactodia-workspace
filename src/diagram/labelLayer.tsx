import cx from 'clsx';
import * as React from 'react';
import { flushSync } from 'react-dom';

import { EventObserver } from '../coreUtils/events';
import { Debouncer } from '../coreUtils/scheduler';

import { useCanvas } from './canvasApi';
import { Link } from './elements';
import { Vector } from './geometry';
import { type DiagramModel } from './model';
import { type PaperTransform, HtmlPaperLayer } from './paper';
import { RenderingLayer, type MutableRenderingState } from './renderingState';

export function LabelLayer(props: {
    model: DiagramModel;
    renderingState: MutableRenderingState;
    paperTransform: PaperTransform;
    layerRef?: React.RefObject<HTMLDivElement | null>;
}) {
    const {model, renderingState, paperTransform, layerRef} = props;

    const [_update, setUpdate] = React.useState(false);

    React.useEffect(() => {
        const listener = new EventObserver();
        const debouncer = new Debouncer();
        listener.listen(renderingState.events, 'changeLinkLabels', () => {
            debouncer.call(() => setUpdate(previous => !previous));
        });
        listener.listen(renderingState.events, 'syncUpdate', e => {
            if (e.layer === RenderingLayer.LinkLabel) {
                flushSync(() => {
                    debouncer.runSynchronously();
                });
            }
        });
        return () => {
            listener.stopListening();
            debouncer.dispose();
        };
    }, []);

    const labels: React.ReactNode[] = [];
    for (const link of model.links) {
        const visibility = model.getLinkVisibility(link.typeId);
        if (visibility !== 'visible') {
            continue;
        }
        const foundLabels = renderingState.getLinkLabels(link);
        if (foundLabels) {
            for (const content of foundLabels.values()) {
                labels.push(content);
            }
        }
    }

    return (
        <HtmlPaperLayer paperTransform={paperTransform}
            className='reactodia-label-layer'
            layerRef={layerRef}>
            {labels}
        </HtmlPaperLayer>
    );
}

/**
 * Props for {@link LinkLabel} component.
 *
 * @see {@link LinkLabel}
 */
export interface LinkLabelProps {
    /**
     * Owner link to display label over.
     */
    link: Link;
    /**
     * Whether the label should be considered as primary one for the link.
     *
     * Primary label bounds are available via {@link RenderingState.getLinkLabelBounds}.
     */
    primary?: boolean;
    /**
     * Label position in paper coordinates.
     */
    position: Vector;
    /**
     * Vertical row shift for the label
     * (e.g. `-1` for one row above, `1` for one row below).
     *
     * @default 0
     */
    line?: number;
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Additional CSS styles for the component.
     */
    style?: React.CSSProperties;
    /**
     * Label text alignment relative to its position.
     *
     * @default "middle"
     */
    textAnchor?: 'start' | 'middle' | 'end';
    /**
     * Title for the label.
     */
    title?: string;
    /**
     * Content for the label.
     *
     * This content is rendered in the normal HTML context, unlike the link itself.
     */
    children?: React.ReactNode;
}

const LINK_LABEL_CLASS = 'reactodia-link-label';

export function LinkLabel(props: LinkLabelProps) {
    const {link, position: {x, y}, line, className, style, textAnchor, title, children} = props;
    const {canvas} = useCanvas();

    const keyRef = React.useRef<number>();
    if (keyRef.current === undefined) {
        const renderingState = canvas.renderingState as MutableRenderingState;
        keyRef.current = renderingState.generateLinkLabelKey();
    }

    const anchorTransform = (
        textAnchor === 'start' ? 'translate(0,-50%)' :
        textAnchor === 'end' ? 'translate(-100%,-50%)' :
        'translate(-50%,-50%)'
    );
    const fullTransform = `translate(${x}px,${y}px)${anchorTransform}`;

    const labelKey = keyRef.current!;
    React.useLayoutEffect(() => {
        const renderingState = canvas.renderingState as MutableRenderingState;
        const providedStyle = {
            ...style,
            position: 'absolute',
            transform: fullTransform,
            '--reactodia-link-label-line': line,
        } as React.CSSProperties;
        const content = (
            <div key={labelKey}
                data-link-id={link.id}
                className={cx(LINK_LABEL_CLASS, className)}
                style={providedStyle}
                title={title}>
                {children}
            </div>
        );
        renderingState.addLinkLabel(link, labelKey, content);
        return () => renderingState.removeLinkLabel(link, labelKey);
    }, [link, labelKey, fullTransform, className, style, children]);

    return null;
}
