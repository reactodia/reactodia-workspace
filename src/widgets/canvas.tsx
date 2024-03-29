import * as React from 'react';

import { LinkRouter, LinkTemplateResolver, ElementTemplateResolver } from '../diagram/customization';
import { PaperArea, ZoomOptions } from '../diagram/paperArea';
import { RenderingState } from '../diagram/renderingState';

import { useWorkspace } from '../workspace/workspaceContext';

export interface CanvasProps {
    elementTemplateResolver?: ElementTemplateResolver;
    linkTemplateResolver?: LinkTemplateResolver;
    linkRouter?: LinkRouter;
    /**
     * @default false
     */
    showScrollbars?: boolean;
    zoomOptions?: ZoomOptions;
    watermarkSvg?: string;
    watermarkUrl?: string;
    children?: React.ReactNode;
}

const CLASS_NAME = 'reactodia-canvas';

export function Canvas(props: CanvasProps) {
    const {model, view} = useWorkspace();
    const {
        elementTemplateResolver, linkTemplateResolver, linkRouter,
        showScrollbars, zoomOptions, watermarkSvg, watermarkUrl, children,
    } = props;

    const [renderingState] = React.useState(() => new RenderingState({
        model,
        shared: view,
        elementTemplateResolver,
        linkTemplateResolver,
        linkRouter,
    }));

    return (
        <div className={CLASS_NAME}>
            <PaperArea model={model}
                renderingState={renderingState}
                zoomOptions={zoomOptions}
                hideScrollBars={!showScrollbars}
                watermarkSvg={watermarkSvg}
                watermarkUrl={watermarkUrl}>
                {children}
            </PaperArea>
        </div>
    );
}
