import cx from 'clsx';
import * as React from 'react';
import { expect, describe, it } from 'vitest';
import { render } from 'vitest-browser-react';

import { HtmlPaperLayer, SvgPaperLayer, type PaperTransform } from '../../src/diagram/paper';
import { toSVG } from '../../src/diagram/toSvg';

import IconResource from './toSvg.resource.svg';
import IconInline from './toSvg.inline.svg';
import styles from './toSvg.module.css';

describe('toSvg()', () => {
    it('exports an empty paper', async () => {
        const svgLayerRef = React.createRef<SVGSVGElement>();
        const htmlLayerRef = React.createRef<HTMLDivElement>();
        const paperTransform: PaperTransform = {
            width: 400,
            height: 400,
            originX: 0,
            originY: 0,
            paddingX: 0,
            paddingY: 0,
            scale: 1,
        };
        render(
            <div>
                <SvgPaperLayer layerRef={svgLayerRef}
                    paperTransform={paperTransform}>
                    {/* empty */}
                </SvgPaperLayer>
                <HtmlPaperLayer layerRef={htmlLayerRef}
                    paperTransform={paperTransform}>
                    {/* empty */}
                </HtmlPaperLayer>
            </div>
        );

        expect(svgLayerRef.current).toBeTruthy();
        expect(htmlLayerRef.current).toBeTruthy();

        const exportedSvgString = await toSVG({
            colorSchemeApi: {
                actInColorScheme: (_scheme, action) => action(),
            },
            styleRoot: svgLayerRef.current!,
            contentBox: {x: 0, y: 0, width: paperTransform.width, height: paperTransform.height},
            layers: [
                svgLayerRef.current!,
                htmlLayerRef.current!,
            ],
            preserveDimensions: true,
            convertImagesToDataUris: true,
        });

        await expect(exportedSvgString).toMatchFileSnapshot('toSvg.expected.empty.svg');
    });

    it('exports paper with images via <img>, stylesheets and inline styles', async () => {
        expect(IconInline).to.match(/^data:/);
        expect(IconResource).to.match(/^\//);

        const svgLayerRef = React.createRef<SVGSVGElement>();
        const htmlLayerRef = React.createRef<HTMLDivElement>();
        const paperTransform: PaperTransform = {
            width: 400,
            height: 400,
            originX: 0,
            originY: 0,
            paddingX: 0,
            paddingY: 0,
            scale: 1,
        };
        const commonIconStyle: React.CSSProperties = {
            height: '36px',
            width: '36px',
            position: 'absolute',
        };
        const iconVariants = [
            styles.inlineMask,
            styles.resourceMask,
            styles.inlineBackground,
            styles.resourceBackground,
        ];
        render (
            <div>
                <SvgPaperLayer layerRef={svgLayerRef}
                    paperTransform={paperTransform}>
                    {/* empty */}
                </SvgPaperLayer>
                <HtmlPaperLayer layerRef={htmlLayerRef}
                    paperTransform={paperTransform}>
                    <div
                        style={{
                            background: 'white',
                            position: 'absolute',
                            width: paperTransform.width,
                            height: paperTransform.height,
                        }}
                    />
                    {/* Images referenced from inline styles */}
                    <div
                        style={{
                            ...commonIconStyle,
                            mask: `url("${IconInline}") 0px 0px / contain no-repeat`,
                            backgroundColor: 'lightblue',
                            transform: 'translate(0px,0px)',
                        }}
                    />
                    <div
                        style={{
                            ...commonIconStyle,
                            mask: `url("${IconResource}") 0px 0px / contain no-repeat`,
                            backgroundColor: 'blue',
                            transform: 'translate(40px,0px)',
                        }}
                    />
                    <div
                        style={{
                            ...commonIconStyle,
                            background: `url("${IconInline}") 0px 0px / contain no-repeat`,
                            transform: 'translate(80px,0px)',
                        }}
                    />
                    <div
                        style={{
                            ...commonIconStyle,
                            background: `url("${IconResource}") 0px 0px / contain no-repeat`,
                            transform: 'translate(120px,0px)',
                        }}
                    />
                    {/* Images referenced from CSS stylesheets */}
                    {iconVariants.map((className, i) => (
                        <div key={`css-${i}`}
                            className={cx(styles.icon, className)}
                            style={{transform: `translate(${i * 40}px,40px)`}}
                        />
                    ))}
                    {/* Images references directly from <img src="..."> */}
                    <img src={IconInline}
                        style={{
                            ...commonIconStyle,
                            transform: 'translate(0px,80px)',
                        }}
                    />
                    <img src={IconResource}
                        style={{
                            ...commonIconStyle,
                            transform: 'translate(40px,80px)',
                        }}
                    />
                </HtmlPaperLayer>
            </div>
        );

        expect(svgLayerRef.current).toBeTruthy();
        expect(htmlLayerRef.current).toBeTruthy();

        const exportedSvgString = await toSVG({
            colorSchemeApi: {
                actInColorScheme: (_scheme, action) => action(),
            },
            styleRoot: svgLayerRef.current!,
            contentBox: {x: 0, y: 0, width: paperTransform.width, height: paperTransform.height},
            layers: [
                svgLayerRef.current!,
                htmlLayerRef.current!,
            ],
            preserveDimensions: true,
            convertImagesToDataUris: true,
        });

        await expect(exportedSvgString).toMatchFileSnapshot('toSvg.expected.withImages.svg');
    });
});
