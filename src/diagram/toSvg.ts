import type { ColorSchemeApi } from '../coreUtils/colorScheme';

import { Rect, Size, Vector } from './geometry';

export interface ToSVGOptions {
    colorSchemeApi: ColorSchemeApi;
    styleRoot: HTMLElement | SVGElement;
    layers: ReadonlyArray<SVGSVGElement | HTMLElement>;
    contentBox: Rect;
    /** @default false */
    preserveDimensions?: boolean;
    /** @default false */
    convertImagesToDataUris?: boolean;
    /** @default [] */
    removeByCssSelectors?: ReadonlyArray<string>;
    watermarkSvg?: string;
    /** @default false */
    addXmlHeader?: boolean;
}

interface Bounds {
    width: number;
    height: number;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XML_ENCODING_HEADER = '<?xml version="1.0" encoding="UTF-8"?>';

/**
 * @category Core
 */
export function toSVG(options: ToSVGOptions): Promise<string> {
    return exportSVG(options)
        .then(svg => {
            const svgText = new XMLSerializer().serializeToString(svg);
            return options.addXmlHeader
                ? (XML_ENCODING_HEADER + svgText) : svgText;
        });
}

async function exportSVG(options: ToSVGOptions): Promise<SVGElement> {
    const {
        colorSchemeApi,
        contentBox: viewBox,
        watermarkSvg,
        preserveDimensions,
        convertImagesToDataUris,
        removeByCssSelectors = [],
    } = options;

    let cssPropertyValues!: ReturnType<typeof captureCustomCssPropertyValues>;
    let clonedPaperSvg!: ReturnType<typeof composeExportedSvg>;
    colorSchemeApi.actInColorScheme('light', () => {
        cssPropertyValues = captureCustomCssPropertyValues(options.styleRoot);
        clonedPaperSvg = composeExportedSvg(options.layers, viewBox);
    });

    const {composedSvg, imageBounds} = clonedPaperSvg;
    for (const selector of removeByCssSelectors) {
        for (const node of composedSvg.querySelectorAll(selector)) {
            node.remove();
        }
    }

    // Workaround to include only library-related stylesheets
    const appliedCssRules = collectAppliedCssFromDocument(composedSvg);

    const imageUrls = new Map<string, string | null>();
    if (convertImagesToDataUris) {
        collectImageUrlsFromElements(composedSvg, imageUrls);
        collectImageUrlsFromCssRules(appliedCssRules, imageUrls);
        collectImageUrlsFromInlineStyles(composedSvg, imageUrls);
    }

    if (preserveDimensions) {
        composedSvg.setAttribute('width', String(viewBox.width));
        composedSvg.setAttribute('height', String(viewBox.height));
    } else {
        composedSvg.setAttribute('width', '100%');
        composedSvg.setAttribute('height', '100%');
    }

    composedSvg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);

    if (watermarkSvg) {
        addWatermark(composedSvg, viewBox, watermarkSvg);
    }

    await fetchImages(imageUrls);

    for (const img of composedSvg.querySelectorAll('img')) {
        const exportKey = img.getAttribute('export-key');
        img.removeAttribute('export-key');
        if (exportKey) {
            const {width, height} = imageBounds[exportKey];
            img.setAttribute('width', width.toString());
            img.setAttribute('height', height.toString());
            const exportedUrl = imageUrls.get(img.src);
            if (exportedUrl) {
                img.src = exportedUrl;
            }
        }
    }
    embedImageUrlsToInlineStyles(composedSvg, imageUrls);

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = (
        `<style>${serializeCssPropertyValues(cssPropertyValues)}</style>\n` +
        `<style>${exportCssRules(appliedCssRules, imageUrls)}</style>`
    );
    composedSvg.insertBefore(defs, composedSvg.firstChild);

    return composedSvg;
}

function addWatermark(svg: SVGElement, viewBox: Rect, watermarkSvg: string) {
    const WATERMARK_CLASS = 'reactodia-exported-watermark';
    const WATERMARK_MAX_WIDTH = 120;
    const WATERMARK_PADDING = 20;

    const image = document.createElementNS(SVG_NAMESPACE, 'image');
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', watermarkSvg);
    image.setAttribute('class', WATERMARK_CLASS);

    const width = Math.min(viewBox.width * 0.2, WATERMARK_MAX_WIDTH);
    const x = viewBox.x + viewBox.width - width - WATERMARK_PADDING;
    const y = viewBox.y + WATERMARK_PADDING;

    image.setAttribute('x', x.toString());
    image.setAttribute('y', y.toString());
    image.setAttribute('width', width.toString());
    image.setAttribute('opacity', '0.3');

    svg.insertBefore(image, svg.firstChild);
}

function collectAppliedCssFromDocument(targetSubtree: Element): CSSStyleRule[] {
    const visitedRules = new Set<CSSRule>();
    const appliedRules: CSSStyleRule[] = [];
    const visitRule = (rule: CSSRule): void => {
        if (visitedRules.has(rule)) {
            return;
        }
        visitedRules.add(rule);
        if (rule instanceof CSSStyleRule) {
            const selectorWithoutPseudo = rule.selectorText.replace(/::[a-zA-Z-]+$/, '');
            if (targetSubtree.querySelector(selectorWithoutPseudo)) {
                appliedRules.push(rule);
            }
        } else if (rule instanceof CSSLayerBlockRule) {
            for (const subRule of rule.cssRules) {
                visitRule(subRule);
            }
        }
    };

    for (let i = 0; i < document.styleSheets.length; i++) {
        let rules: CSSRuleList;
        try {
            const cssSheet = document.styleSheets[i];
            rules = cssSheet.cssRules || cssSheet.rules;
            if (!rules) {
                continue;
            }
        } catch (e) {
            continue;
        }

        for (const rule of rules) {
            visitRule(rule);
        }
    }

    return appliedRules;
}

function collectImageUrlsFromElements(
    target: Element,
    imageUrls: Map<string, string | null>
) {
    for (const img of target.querySelectorAll('img')) {
        if (img.src && !imageUrls.has(img.src)) {
            imageUrls.set(img.src, null);
        }
    }
}

function collectImageUrlsFromCssRules(
    rules: readonly CSSStyleRule[],
    imageUrls: Map<string, string | null>
): void {
    for (const rule of rules) {
        const maskUrl = parseCssImageUrl(rule.style.getPropertyValue('mask-image'));
        if (maskUrl && !imageUrls.has(maskUrl)) {
            imageUrls.set(maskUrl, null);
        }

        const backgroundUrl = parseCssImageUrl(rule.style.getPropertyValue('background-image'));
        if (backgroundUrl && !imageUrls.has(backgroundUrl)) {
            imageUrls.set(backgroundUrl, null);
        }
    }
}

function collectImageUrlsFromInlineStyles(
    target: Element,
    imageUrls: Map<string, string | null>
): void {
    const visited = new Set<Element>();
    const visit = (element: Element): void => {
        if (visited.has(element)) {
            return;
        }
        visited.add(element);
        if (element instanceof HTMLElement) {
            const maskUrl = parseCssImageUrl(element.style.maskImage);
            if (maskUrl && !imageUrls.has(maskUrl)) {
                imageUrls.set(maskUrl, null);
            }

            const backgroundUrl = parseCssImageUrl(element.style.backgroundImage);
            if (backgroundUrl && !imageUrls.has(backgroundUrl)) {
                imageUrls.set(backgroundUrl, null);
            }
        }
        for (const child of element.children) {
            visit(child);
        }
    };
    visit(target);
}

function embedImageUrlsToInlineStyles(
    target: Element,
    imageUrls: Map<string, string | null>
): void {
    const visited = new Set<Element>();
    const visit = (element: Element): void => {
        if (visited.has(element)) {
            return;
        }
        visited.add(element);
        if (element instanceof HTMLElement) {
            const maskUrl = parseCssImageUrl(element.style.maskImage);
            const exportedMaskUrl = maskUrl ? imageUrls.get(maskUrl) : undefined;
            if (exportedMaskUrl) {
                element.style.maskImage = serializeCssImageUrl(exportedMaskUrl);
            }

            const backgroundUrl = parseCssImageUrl(element.style.backgroundImage);
            const exportedBackgroundUrl = backgroundUrl ? imageUrls.get(backgroundUrl) : undefined;
            if (exportedBackgroundUrl) {
                element.style.backgroundImage = serializeCssImageUrl(exportedBackgroundUrl);
            }
        }
        for (const child of element.children) {
            visit(child);
        }
    };
    visit(target);
}

async function fetchImages(imageUrls: Map<string, string | null>): Promise<void> {
    await Promise.all(Array.from(imageUrls.keys(), async sourceUrl => {
        if (sourceUrl.startsWith('data:')) {
            return;
        }
        try {
            const dataUri = await exportImageAsDataUri(sourceUrl);
            if (dataUri && dataUri !== 'data:image/svg+xml,') {
                imageUrls.set(sourceUrl, dataUri);
            }
        } catch (err) {
            console.warn('Reactodia: Failed to export image: ' + sourceUrl, err);
        }
    }));
}

function exportCssRules(
    rules: readonly CSSStyleRule[],
    imageUrls: ReadonlyMap<string, string | null>
): string {
    const cssTexts = rules.map(rule => rule.cssText);

    const styleElement = document.createElement('style');
    document.body.appendChild(styleElement);
    const sheet = styleElement.sheet;

    try {
        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];

            const maskUrl = parseCssImageUrl(rule.style.getPropertyValue('mask-image'));
            const exportedMaskUrl = maskUrl ? imageUrls.get(maskUrl) : undefined;

            const backgroundUrl = parseCssImageUrl(rule.style.getPropertyValue('background-image'));
            const exportedBackgroundUrl = backgroundUrl ? imageUrls.get(backgroundUrl) : undefined;

            if (sheet && (exportedMaskUrl || exportedBackgroundUrl)) {
                sheet.insertRule(rule.cssText);
                const ruleCopy = sheet.cssRules[0];
                if (ruleCopy instanceof CSSStyleRule) {
                    if (exportedMaskUrl) {
                        ruleCopy.style.setProperty('mask-image', serializeCssImageUrl(exportedMaskUrl));
                    }
                    if (exportedBackgroundUrl) {
                        ruleCopy.style.setProperty('background-image', serializeCssImageUrl(exportedBackgroundUrl));
                    }
                    cssTexts[i] = ruleCopy.cssText;
                }
                sheet.deleteRule(0);
            } 
        }
    } finally {
        document.body.removeChild(styleElement);
    }
    return cssTexts.join('\n');
}

function parseCssImageUrl(imageValue: string | undefined): string | undefined {
    if (imageValue) {
        const trimmedValue = imageValue.trim();

        let match = /^url\(\s*'(.*)'\s*\)$/i.exec(trimmedValue);
        if (match) {
            return match[1];
        }

        match = /^url\(\s*"(.*)"\s*\)$/i.exec(trimmedValue);
        if (match) {
            return match[1];
        }
    }
    return undefined;
}

function serializeCssImageUrl(dataUri: string): string {
    return `url("${dataUri}")`;
}

function composeExportedSvg(layers: ToSVGOptions['layers'], viewBox: Rect): {
    composedSvg: SVGSVGElement;
    imageBounds: { [path: string]: Bounds };
} {
    const composedSvg = document.createElementNS(SVG_NAMESPACE, 'svg');
    const composedViewport = document.createElementNS(SVG_NAMESPACE, 'g');
    composedViewport.setAttribute('class', 'reactodia-exported-canvas');
    composedSvg.appendChild(composedViewport);

    const imageBounds = Object.create(null) as { [path: string]: Bounds };

    for (const layer of layers) {
        if (layer instanceof SVGSVGElement) {
            const layerClone = layer.cloneNode(true) as SVGSVGElement;
            const layerViewport = findSvgLayerViewport(layerClone)!;
            layerViewport.removeAttribute('transform');

            composedViewport.appendChild(layerViewport);
        } else if (layer instanceof HTMLElement) {
            const layerClone = layer.cloneNode(true) as HTMLElement;
            layerClone.classList.add('reactodia-exported-layer');
            layerClone.setAttribute('style', `transform: translate(${-viewBox.x}px,${-viewBox.y}px)`);

            const layerForeignObject = document.createElementNS(SVG_NAMESPACE, 'foreignObject');
            layerForeignObject.appendChild(layerClone);
            layerForeignObject.setAttribute('transform', `translate(${viewBox.x},${viewBox.y})`);
            layerForeignObject.setAttribute('width', String(viewBox.width));
            layerForeignObject.setAttribute('height', String(viewBox.height));

            const layerRoot = document.createElementNS(SVG_NAMESPACE, 'g');
            layerRoot.appendChild(layerForeignObject);
            composedViewport.appendChild(layerRoot);

            const clonedNodes = layerClone.querySelectorAll('img');
            let nextImageIndex = 0;

            for (const img of layer.querySelectorAll('img')) {
                const index = nextImageIndex;
                nextImageIndex++;
                const exportKey = `export-key-${index}`;
                clonedNodes[index].setAttribute('export-key', exportKey);
                imageBounds[exportKey] = {
                    width: img.clientWidth,
                    height: img.clientHeight,
                };
            }
        }
    }

    return {composedSvg, imageBounds};
}

function findSvgLayerViewport(layer: SVGSVGElement): SVGGElement | undefined {
    let child = layer.firstChild;
    while (child) {
        if (child instanceof SVGGElement) { return child; }
        child = child.nextSibling;
    }
    return undefined;
}

async function exportImageAsDataUri(url: string): Promise<string> {
    if (!url || url.startsWith('data:')) {
        return url;
    }

    // match extensions like "http://example.com/images/foo.JPG&w=200"
    const extensionMatch = url.match(/\.([a-zA-Z0-9]+)[^.a-zA-Z0-9]?[^.]*$/);
    const extension = extensionMatch ? extensionMatch[1].toLowerCase() : undefined;

    if (extension === 'svg') {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const svgText = await response.text();
                if (svgText.length > 0) {
                    return 'data:image/svg+xml,' + encodeURIComponent(svgText.replace(/\r\n/g, '\n'));
                }
            }
        } catch (err) {
            /* Failed to fetch image as SVG */
        }
    }

    const image = await loadCrossOriginImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;

    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    try {
        const mimeType = 'image/' + (extension === 'jpg' ? 'jpeg' : 'png');
        const dataUri = canvas.toDataURL(mimeType);
        return dataUri;
    } catch (e) {
        throw new Error(`Failed to convert image to data URI: ${url}`, {cause: e});
    }
}

function loadCrossOriginImage(src: string): Promise<HTMLImageElement> {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = ev => reject(ev);
    });
    image.src = src;
    return promise;
}

function captureCustomCssPropertyValues(element: Element): Map<string, string> {
    const styles = getComputedStyle(element);
    const propertyValues = new Map<string, string>();
    for (const property of styles) {
        if (property.startsWith('--')) {
            const value = styles.getPropertyValue(property);
            propertyValues.set(property, value);
        }
    }
    return propertyValues;
}

function serializeCssPropertyValues(propertyValues: ReadonlyMap<string, string>) {
    const parts: string[] = [':root {\n'];
    for (const [property, value] of propertyValues) {
        parts.push('  ', property, ': ', value, ';\n');
    }
    parts.push('}\n');
    return parts.join('');
}

/**
 * Options for exporting the canvas as raster image Base64-encoded into data URL.
 *
 * @see {@link toDataURL}
 */
export interface ToDataURLOptions {
    /**
     * [MIME type](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types)
     * for the exported raster image.
     *
     * Example: `image/png`, `image/jpeg`, ...
     *
     * @default "image/png"
     */
    mimeType?: string;
    /**
     * Target width of the exported image.
     *
     * If only `width` is specified, the height is set based on the diagram aspect ratio,
     * otherwise the diagram is fit into desired bounds with margins on sides.
     *
     * If neither `width` or `height` is set, the image size is computed automatically
     * based on `maxFallbackSize` with 2x maximum resolution for the content.
     */
    width?: number;
    /**
     * Target height of the exported image.
     *
     * If only `height` is specified, the height is set based on the diagram aspect ratio,
     * otherwise the diagram is fit into desired bounds with margins on sides.
     *
     * If neither `width` or `height` is set, the image size is computed automatically
     * based on `maxFallbackSize` with 2x maximum resolution for the content.
     */
    height?: number;
    /**
     * Background color for the exported image.
     *
     * If not specified, the background is transparent by default.
     */
    backgroundColor?: string;
    /**
     * Exported image quality value from 0.0 to 1.0
     * (applicable only for lossy image types).
     *
     * @default 1.0
     */
    quality?: number;
    /**
     * Maximum exported image size when neither `width` nor `height` is specified.
     *
     * @default {width: 4096, height: 4096}
     */
    maxFallbackSize?: Size;
}

const DEFAULT_MAX_FALLBACK_SIZE: Size = {width: 4096, height: 4096};

/**
 * @category Core
 */
export async function toDataURL(options: ToSVGOptions & ToDataURLOptions): Promise<string> {
    const {
        mimeType = 'image/png',
        maxFallbackSize = DEFAULT_MAX_FALLBACK_SIZE,
    } = options;
    const svgOptions = {
        ...options,
        convertImagesToDataUris: true,
        mockImages: false,
        preserveDimensions: true,
    };
    const svg = await exportSVG(svgOptions);
    const svgBox: Bounds = {
        width: Number(svg.getAttribute('width')),
        height: Number(svg.getAttribute('height')),
    };

    const containerSize = (typeof options.width === 'number' || typeof options.height === 'number')
        ? {width: options.width, height: options.height}
        : fallbackContainerSize(svgBox, maxFallbackSize);

    const {innerSize, outerSize, offset} = computeAutofit(svgBox, containerSize);
    svg.setAttribute('width', innerSize.width.toString());
    svg.setAttribute('height', innerSize.height.toString());
    const svgString = new XMLSerializer().serializeToString(svg);

    const {canvas, context} = createCanvas(
        outerSize.width,
        outerSize.height,
        options.backgroundColor,
    );

    const image = await loadImage('data:image/svg+xml,' + encodeURIComponent(svgString));
    context.drawImage(image, offset.x, offset.y, innerSize.width, innerSize.height);
    return canvas.toDataURL(mimeType, options.quality);

    function createCanvas(canvasWidth: number, canvasHeight: number, backgroundColor?: string) {
        const cnv = document.createElement('canvas');
        cnv.width = canvasWidth;
        cnv.height = canvasHeight;
        const cnt = cnv.getContext('2d')!;
        if (backgroundColor) {
            cnt.fillStyle = backgroundColor;
            cnt.fillRect(0, 0, canvasWidth, canvasHeight);
        }
        return {canvas: cnv, context: cnt};
    }
}

function loadImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = function () {
            resolve(image);
        };
        image.onerror = function (ev) {
            reject(ev);
        };
        image.src = source;
    });
}

function computeAutofit(itemSize: Bounds, containerSize: Partial<Bounds>) {
    const fit = fitRectKeepingAspectRatio(
        itemSize.width,
        itemSize.height,
        containerSize.width,
        containerSize.height,
    );
    const innerSize: Bounds = {
        width: Math.floor(fit.width),
        height: Math.floor(fit.height),
    };
    const outerSize: Bounds = {
        width: typeof containerSize.width === 'number' ? containerSize.width : innerSize.width,
        height: typeof containerSize.height === 'number' ? containerSize.height : innerSize.height,
    };
    const offset: Vector = {
        x: Math.round((outerSize.width - innerSize.width) / 2),
        y: Math.round((outerSize.height - innerSize.height) / 2),
    };
    return {innerSize, outerSize, offset};
}

function fallbackContainerSize(itemSize: Bounds, maxCanvasSize: Size): Bounds {
    const maxResolutionScale = Math.min(
        maxCanvasSize.width / itemSize.width,
        maxCanvasSize.height / itemSize.height,
    );
    const resolutionScale = Math.min(2.0, maxResolutionScale);
    const width = Math.floor(itemSize.width * resolutionScale);
    const height = Math.floor(itemSize.height * resolutionScale);
    return {width, height};
}

export function fitRectKeepingAspectRatio(
    sourceWidth: number,
    sourceHeight: number,
    targetWidth: number | undefined,
    targetHeight: number | undefined,
): { width: number; height: number } {
    if (!(typeof targetWidth === 'number' || typeof targetHeight === 'number')) {
        return {width: sourceWidth, height: sourceHeight};
    }
    const sourceAspectRatio = sourceWidth / sourceHeight;
    targetWidth = typeof targetWidth === 'number' ? targetWidth : targetHeight! * sourceAspectRatio;
    targetHeight = typeof targetHeight === 'number' ? targetHeight : targetWidth / sourceAspectRatio;
    if (targetHeight * sourceAspectRatio <= targetWidth) {
        return {width: targetHeight * sourceAspectRatio, height: targetHeight};
    } else {
        return {width: targetWidth, height: targetWidth / sourceAspectRatio};
    }
}

/**
 * Creates and returns a blob from a data URL (either base64 encoded or not).
 *
 * @param {string} dataURL The data URL to convert.
 * @return {Blob} A blob representing the array buffer data.
 */
export function dataURLToBlob(dataURL: string): Blob {
    const BASE64_MARKER = ';base64,';
    if (dataURL.indexOf(BASE64_MARKER) === -1) {
        const parts = dataURL.split(',');
        const contentType = parts[0].split(':')[1];
        const raw = decodeURIComponent(parts[1]);

        return new Blob([raw], {type: contentType});
    } else {
        const parts = dataURL.split(BASE64_MARKER);
        const contentType = parts[0].split(':')[1];
        const raw = window.atob(parts[1]);
        const rawLength = raw.length;

        const uInt8Array = new Uint8Array(rawLength);

        for (let i = 0; i < rawLength; ++i) {
            uInt8Array[i] = raw.charCodeAt(i);
        }

        return new Blob([uInt8Array], {type: contentType});
    }
}
