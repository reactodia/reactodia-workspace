import { DiagramModel } from './model';
import { Rect, SizeProvider, Vector, boundsOf } from './geometry';

export interface ToSVGOptions {
    model: DiagramModel;
    sizeProvider: SizeProvider;
    paper: SVGSVGElement;
    contentBox: Rect;
    getOverlaidElement: (id: string) => HTMLElement;
    preserveDimensions?: boolean;
    convertImagesToDataUris?: boolean;
    blacklistedCssAttributes?: string[];
    elementsToRemoveSelector?: string;
    mockImages?: boolean;
    watermarkSvg?: string;
}

interface Bounds {
    width: number;
    height: number;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
/**
 * Padding (in px) for <foreignObject> elements of exported SVG to
 * mitigate issues with elements body overflow caused by missing styles
 * in exported image.
 */
const FOREIGN_OBJECT_SIZE_PADDING = 2;
const BORDER_PADDING = 100;

export function toSVG(options: ToSVGOptions): Promise<string> {
    return exportSVG(options).then(svg => new XMLSerializer().serializeToString(svg));
}

function exportSVG(options: ToSVGOptions): Promise<SVGElement> {
    const {contentBox: bbox, watermarkSvg} = options;
    const {svgClone, imageBounds} = clonePaperSvg(options, FOREIGN_OBJECT_SIZE_PADDING);

    const paddedWidth = bbox.width + 2 * BORDER_PADDING;
    const paddedHeight = bbox.height + 2 * BORDER_PADDING;

    if (options.preserveDimensions) {
        svgClone.setAttribute('width', paddedWidth.toString());
        svgClone.setAttribute('height', paddedHeight.toString());
    } else {
        svgClone.setAttribute('width', '100%');
        svgClone.setAttribute('height', '100%');
    }

    const viewBox: Rect = {
        x: bbox.x - BORDER_PADDING,
        y: bbox.y - BORDER_PADDING,
        width: paddedWidth,
        height: paddedHeight,
    };
    svgClone.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);

    if (watermarkSvg) {
        addWatermark(svgClone, viewBox, watermarkSvg);
    }

    const images: HTMLImageElement[] = [];
    const nodes = svgClone.querySelectorAll('img');
    foreachNode(nodes, node => images.push(node));

    const convertingImages = Promise.all(images.map(img => {
        const exportKey = img.getAttribute('export-key');
        img.removeAttribute('export-key');
        if (exportKey) {
            const {width, height} = imageBounds[exportKey];
            img.setAttribute('width', width.toString());
            img.setAttribute('height', height.toString());
            if (!options.convertImagesToDataUris) {
                return Promise.resolve();
            }
            return exportAsDataUri(img).then(dataUri => {
                // check for empty svg data URI which happens when mockJointXHR catches an exception
                if (dataUri && dataUri !== 'data:image/svg+xml,') {
                    img.src = dataUri;
                }
            }).catch(err => {
                // tslint:disable-next-line:no-console
                console.warn('Failed to export image: ' + img.src, err);
            });
        } else {
            return Promise.resolve();
        }
    }));

    return convertingImages.then(() => {
        // workaround to include only library-related stylesheets
        const exportedCssText = extractCSSFromDocument(svgClone);

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `<style>${exportedCssText}</style>`;
        svgClone.insertBefore(defs, svgClone.firstChild);

        if (options.elementsToRemoveSelector) {
            foreachNode(svgClone.querySelectorAll(options.elementsToRemoveSelector),
                node => node.remove());
        }

        return svgClone;
    });
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

function extractCSSFromDocument(targetSubtree: Element): string {
    const exportedRules = new Set<CSSStyleRule>();
    for (let i = 0; i < document.styleSheets.length; i++) {
        let rules: CSSRuleList;
        try {
            const cssSheet = document.styleSheets[i] as CSSStyleSheet;
            rules = cssSheet.cssRules || cssSheet.rules;
            if (!rules) { continue; }
        } catch (e) { continue; }

        for (let j = 0; j < rules.length; j++) {
            const rule = rules[j];
            if (rule instanceof CSSStyleRule) {
                const selectorWithoutPseudo = rule.selectorText.replace(/::[a-zA-Z-]+$/, '');
                if (targetSubtree.querySelector(selectorWithoutPseudo)) {
                    exportedRules.add(rule);
                }
            }
        }
    }

    const exportedCssTexts: string[] = [];
    exportedRules.forEach(rule => exportedCssTexts.push(rule.cssText));
    return exportedCssTexts.join('\n');
}

function clonePaperSvg(options: ToSVGOptions, elementSizePadding: number): {
    svgClone: SVGSVGElement;
    imageBounds: { [path: string]: Bounds };
} {
    const {model, sizeProvider, paper, getOverlaidElement} = options;
    const svgClone = paper.cloneNode(true) as SVGSVGElement;
    svgClone.removeAttribute('class');
    svgClone.removeAttribute('style');

    function findViewport() {
        let child = svgClone.firstChild;
        while (child) {
            if (child instanceof SVGGElement) { return child; }
            child = child.nextSibling;
        }
        return undefined;
    }

    const viewport = findViewport()!;
    viewport.removeAttribute('transform');

    const imageBounds: { [path: string]: Bounds } = {};

    for (const element of model.elements) {
        const modelId = element.id;
        const overlaidView = getOverlaidElement(modelId);
        if (!overlaidView) { continue; }

        const elementRoot = document.createElementNS(SVG_NAMESPACE, 'g');
        const overlaidViewContent = overlaidView.firstChild!.cloneNode(true) as HTMLElement;
        elementRoot.setAttribute('class', 'reactodia-exported-element');

        const newRoot = document.createElementNS(SVG_NAMESPACE, 'foreignObject');
        newRoot.appendChild(overlaidViewContent);

        const {x, y, width, height} = boundsOf(element, sizeProvider);
        newRoot.setAttribute('transform', `translate(${x},${y})`);
        newRoot.setAttribute('width', (width + elementSizePadding).toString());
        newRoot.setAttribute('height', (height + elementSizePadding).toString());

        elementRoot.appendChild(newRoot);
        viewport.appendChild(elementRoot);

        const clonedNodes = overlaidViewContent.querySelectorAll('img');

        foreachNode(overlaidView.querySelectorAll('img'), (img, index) => {
            const exportKey = `export-key-${index}`;
            clonedNodes[index].setAttribute('export-key', exportKey);
            imageBounds[exportKey] = {
                width: img.clientWidth,
                height: img.clientHeight,
            };
        });
    }

    return {svgClone, imageBounds};
}

async function exportAsDataUri(original: HTMLImageElement): Promise<string> {
    const url = original.src;
    if (!url || url.startsWith('data:')) {
        return url;
    }

    // match extensions like "http://example.com/images/foo.JPG&w=200"
    const extensionMatch = url.match(/\.([a-zA-Z0-9]+)[^.a-zA-Z0-9]?[^.]*$/);
    const extension = extensionMatch ? extensionMatch[1].toLowerCase() : undefined;

    if (extension === 'svg') {
        try {
            const response = await fetch(url);
            const svgText = await response.text();
            if (svgText.length > 0) {
                return 'data:image/svg+xml,' + encodeURIComponent(svgText);
            }
        } catch (err) {
            /* Failed to fetch image as SVG */
        }
    }

    const image = await loadCrossOriginImage(original.src);
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

function foreachNode<T extends Node>(nodeList: NodeListOf<T>, callback: (node: T, index: number) => void) {
    for (let i = 0; i < nodeList.length; i++) {
        callback(nodeList[i], i);
    }
}

export interface ToDataURLOptions {
    /** 'image/png' | 'image/jpeg' | ... */
    mimeType?: string;
    width?: number;
    height?: number;
    /** Background color, transparent by default. */
    backgroundColor?: string;
    quality?: number;
}

const MAX_CANVAS_LENGTH = 4096;

export async function toDataURL(options: ToSVGOptions & ToDataURLOptions): Promise<string> {
    const {paper, mimeType = 'image/png'} = options;
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
        : fallbackContainerSize(svgBox);

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

export function loadImage(source: string): Promise<HTMLImageElement> {
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

function fallbackContainerSize(itemSize: Bounds): Bounds {
    const maxResolutionScale = Math.min(
        MAX_CANVAS_LENGTH / itemSize.width,
        MAX_CANVAS_LENGTH / itemSize.height,
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
