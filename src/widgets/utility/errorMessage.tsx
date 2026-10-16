import cx from 'clsx';
import * as React from 'react';

const CLASS_NAME = 'reactodia-error';

export function ErrorMessage(props: {
    className?: string;
    error: unknown;
}) {
    const {className, error} = props;
    const errorString = tryFormatError(error);
    return (
        <div className={cx(CLASS_NAME, className)}>
            {errorString ?? 'Unexpected error'}
        </div>
    );
}

function tryFormatError(error: unknown): string | undefined {
    if (error instanceof Error) {
        return error.message || error.name;
    }
    return undefined;
}
