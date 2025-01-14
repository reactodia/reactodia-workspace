import * as React from 'react';

/**
 * Props for {@link ProgressBar} component.
 *
 * @see {@link ProgressBar}
 */
export interface ProgressBarProps {
    /**
     * Progress bar state.
     *
     * The progress bar is collapsed in `none` or `completed` states.
     */
    state: ProgressState;
    /**
     * Title for the progress bar.
     */
    title: string;
    /**
     * Current progress value percent in range from 0 to 100.
     *
     * @default 100
     */
    percent?: number;
    /**
     * Progress bar height in px.
     *
     * @default 20
     */
    height?: number;
}

/**
 * Progress bar state:
 *   - `none` - no operation has started yet;
 *   - `loading` - an operation is in progress;
 *   - `error` - an operation has failed;
 *   - `completed` an operation successfully completed.
 */
export type ProgressState = 'none' | 'loading' | 'error' | 'completed';

const CLASS_NAME = 'reactodia-progress-bar';

/**
 * Utility component to display a horizontal progress bar.
 *
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
