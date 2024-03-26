import * as React from 'react';

export interface SpinnerProps {
    size?: number;
    position?: { x: number; y: number };
    maxWidth?: number;
    statusText?: string;
    errorOccurred?: boolean;
}

const CLASS_NAME = 'reactodia-spinner';

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

export function HtmlSpinner(props: { width: number; height: number }) {
    const {width, height} = props;
    const size = Math.min(width, height);
    return (
        <svg width={width} height={height}>
            <Spinner size={size} position={{x: width / 2, y: height / 2}} />
        </svg>
    );
}
