import cx from 'clsx';
import * as React from 'react';
import { expect, describe, it } from 'vitest';
import { render } from 'vitest-browser-react';

import type { ColorSchemeApi } from '../../src/coreUtils/colorScheme';
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
        await render(
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
            colorSchemeApi: DUMMY_COLOR_SCHEME_API,
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
        await render (
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
            colorSchemeApi: DUMMY_COLOR_SCHEME_API,
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

    it('exports paper with removed by CSS selectors parts', async () => {
        const svgLayerRef = React.createRef<SVGSVGElement>();
        const htmlLayerRef = React.createRef<HTMLDivElement>();
        const lastLayerRef = React.createRef<SVGSVGElement>();
        const paperTransform: PaperTransform = {
            width: 400,
            height: 400,
            originX: 0,
            originY: 0,
            paddingX: 0,
            paddingY: 0,
            scale: 1,
        };
        await render(
            <div>
                <SvgPaperLayer layerRef={svgLayerRef}
                    paperTransform={paperTransform}>
                    <rect fill='white'
                        x={0}
                        y={0}
                        width={paperTransform.width}
                        height={paperTransform.height}
                    />
                    <rect fill='orange'
                        x={0}
                        y={0}
                        width={36}
                        height={36}
                    />
                    <rect fill='red'
                        x={40}
                        y={0}
                        width={36}
                        height={36}
                    />
                    <rect className='to-remove-from-exported-svg'
                        fill='purple'
                        x={80}
                        y={0}
                        width={36}
                        height={36}
                    />
                </SvgPaperLayer>
                <HtmlPaperLayer layerRef={htmlLayerRef}
                    paperTransform={paperTransform}>
                    <div
                        style={{
                            position: 'absolute',
                            backgroundColor: 'lightblue',
                            width: 36,
                            height: 36,
                            transform: 'translate(0px,40px)',
                        }}
                    />
                    <div className='to-remove-from-exported-svg'
                        style={{
                            position: 'absolute',
                            backgroundColor: 'lightgreen',
                            width: 36,
                            height: 36,
                            transform: 'translate(40px,40px)',
                        }}
                    />
                </HtmlPaperLayer>
                {/* The second SVG layer on top of the HTML layer */}
                <SvgPaperLayer layerRef={lastLayerRef}
                    paperTransform={paperTransform}>
                    <line stroke='cyan'
                        x1={0}
                        y1={0}
                        x2={paperTransform.width}
                        y2={paperTransform.height}
                    />
                </SvgPaperLayer>
                {/* Layer is not exported due to not being explicitly included */}
                <HtmlPaperLayer paperTransform={paperTransform}>
                    <div
                        style={{
                            position: 'absolute',
                            backgroundColor: 'yellow',
                            width: 36,
                            height: 36,
                            transform: 'translate(0px,80px)',
                        }}
                    />
                </HtmlPaperLayer>
                {/* Layer is not exported due to not being explicitly included */}
                <SvgPaperLayer paperTransform={paperTransform}>
                    <line stroke='yellow'
                        x1={paperTransform.width}
                        y1={0}
                        x2={0}
                        y2={paperTransform.height}
                    />
                </SvgPaperLayer>
            </div>
        );

        expect(svgLayerRef.current).toBeTruthy();
        expect(htmlLayerRef.current).toBeTruthy();

        const exportedSvgString = await toSVG({
            colorSchemeApi: DUMMY_COLOR_SCHEME_API,
            styleRoot: svgLayerRef.current!,
            contentBox: {x: 0, y: 0, width: paperTransform.width, height: paperTransform.height},
            layers: [
                svgLayerRef.current!,
                htmlLayerRef.current!,
                lastLayerRef.current!,
            ],
            preserveDimensions: true,
            removeByCssSelectors: [
                'rect[fill="red"]',
                '.to-remove-from-exported-svg',
            ]
        });

        await expect(exportedSvgString).toMatchFileSnapshot('toSvg.expected.withoutRemoved.svg');
    });
});

const DUMMY_COLOR_SCHEME_API: ColorSchemeApi = {
    actInColorScheme: (_scheme, action) => action(),
};
