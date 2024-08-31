import * as React from 'react';

import {
    LinkRouter, LinkTemplateResolver, ElementTemplate,
} from '../diagram/customization';
import { Element } from '../diagram/elements';
import { PaperArea, ZoomOptions } from '../diagram/paperArea';
import { RenderingState } from '../diagram/renderingState';

import { EntityElement } from '../editor/dataElements';

import { useWorkspace } from '../workspace/workspaceContext';

export interface CanvasProps {
    elementTemplateResolver?: TypedElementResolver;
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

export type TypedElementResolver = (types: readonly string[], element: Element) => ElementTemplate | undefined;

const CLASS_NAME = 'reactodia-canvas';

/**
 * @category Components
 */
export function Canvas(props: CanvasProps) {
    const {model, view} = useWorkspace();
    const {
        elementTemplateResolver, linkTemplateResolver, linkRouter,
        showScrollbars, zoomOptions, watermarkSvg, watermarkUrl, children,
    } = props;

    const [renderingState] = React.useState(() => new RenderingState({
        model,
        shared: view,
        elementTemplateResolver: elementTemplateResolver ? (
            element => {
                const data = element instanceof EntityElement ? element.data : undefined;
                return elementTemplateResolver(data?.types ?? [], element);
            }
        ) : undefined,
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
