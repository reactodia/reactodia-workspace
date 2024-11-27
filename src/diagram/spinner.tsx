import * as React from 'react';

/**
 * Props for `Spinner` component.
 *
 * @see Spinner
 */
export interface SpinnerProps {
    /**
     * Size (width and height) for the spinner circle.
     */
    size?: number;
    /**
     * Spinner circle center position on the SVG canvas.
     */
    position?: { readonly x: number; readonly y: number };
    /**
     * Status text to display next to the spinner.
     */
    statusText?: string;
    /**
     * Whether to display spinner in the "error" state indicating
     * that some operation failed.
     *
     * @default false
     */
    errorOccurred?: boolean;
}

const CLASS_NAME = 'reactodia-spinner';

/**
 * Utility SVG component that displays loading spinner.
 *
 * @category Components
 */
export function Spinner(props: SpinnerProps) {
    const {position = {x: 0, y: 0}, size = 50, statusText, errorOccurred} = props;

    const textLeftMargin = 5;
    const pathGeometry = 'm3.47,-19.7 a20,20 0 1,1 -6.95,0 m0,0 l-6,5 m6,-5 l-8,-0' +
        (errorOccurred ? 'M-8,-8L8,8M-8,8L8,-8' : '');

    return (
        <g className={CLASS_NAME} data-error={errorOccurred}
            transform={`translate(${position.x},${position.y})`}>
            <g className={`${CLASS_NAME}__arrow`}>
                <path d={pathGeometry} transform={`scale(0.02)scale(${size})`}
                    fill='none' stroke={errorOccurred ? 'red' : 'black'}
                    strokeWidth='3' strokeLinecap='round' />
            </g>
            <text style={{dominantBaseline: 'middle'}} x={size / 2 + textLeftMargin}>{statusText}</text>
        </g>
    );
}

/**
 * Same as `Spinner` component but for non-SVG context.
 *
 * @category Components
 * @see Spinner
 */
export function HtmlSpinner(props: {
    /**
     * SVG canvas width to render spinner on.
     */
    width: number;
    /**
     * SVG canvas height to render spinner on.
     */
    height: number;
    /**
     * Whether to display spinner in the "error" state indicating
     * that some operation failed.
     *
     * @default false
     */
    errorOccurred?: boolean;
}) {
    const {width, height, errorOccurred} = props;
    const size = Math.min(width, height);
    return (
        <svg width={width} height={height}>
            <Spinner size={size}
                position={{x: width / 2, y: height / 2}}
                errorOccurred={errorOccurred}
            />
        </svg>
    );
}
