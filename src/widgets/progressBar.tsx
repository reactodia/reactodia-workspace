import * as React from 'react';

export interface ProgressBarProps {
    state: ProgressState;
    title: string;
    /**
     * @default 100
     */
    percent?: number;
    /**
     * @default 20
     */
    height?: number;
}

export type ProgressState = 'none' | 'loading' | 'error' | 'completed';

const CLASS_NAME = 'reactodia-progress-bar';

/**
 * @category Components
 */
export function ProgressBar(props: ProgressBarProps) {
    const {state, title, percent = 100, height = 20} = props;
    const className = `${CLASS_NAME} ${CLASS_NAME}--${state}`;
    const showBar = state === 'loading' || state === 'error';
    return (
        <div className={className} style={{height: showBar ? height : 0}}>
            <div className={`${CLASS_NAME}__bar`}
                style={{width: `${percent}%`}}
                title={title}
                role='progressbar'
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}>
            </div>
        </div>
    );
}
