import * as React from 'react';

import type { ValidationSeverity } from '../data/validationProvider';

const CLASS_NAME = 'reactodia-inline-diagnostic';

/**
 * Displays an inline diagnostic message in a form.
 *
 * **Unstable**: this component will likely change in the future.
 *
 * @category Components
 */
export function InlineDiagnostic(props: {
    /**
     * Diagnostic severity.
     */
    severity: ValidationSeverity;
    /**
     * Diagnostic message to display.
     */
    message: string;
    /**
     * Error object to log together with the message on mount.
     */
    error?: unknown;
}) {
    const {severity, message, error} = props;
    React.useEffect(() => {
        if (error) {
            console.error(`Reactodia: ${message}`, error);
        }
    }, [error]);
    return (
        <div className={CLASS_NAME} data-reactodia-severity={severity}>
            <span className={`${CLASS_NAME}__icon`} />
            <span className={`${CLASS_NAME}__message`}>{message}</span>
        </div>
    );
}
