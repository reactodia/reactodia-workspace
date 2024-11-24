import * as React from 'react';
import classnames from 'classnames';

const CLASS_NAME = 'reactodia-no-search-results';

export function NoSearchResults(props: {
    className?: string;
    hasQuery: boolean;
    /**
     * @default 1
     */
    minSearchTermLength?: number;
    /**
     * @default false
     */
    requireSubmit?: boolean;
    message?: string;
}) {
    const {className, hasQuery, minSearchTermLength = 1, requireSubmit, message} = props;
    const effectiveMessage = message ?? (
        hasQuery ? 'No results found.' : (
            minSearchTermLength <= 1 ? (
                requireSubmit
                    ? 'Submit a term to search.'
                    : 'Type a term to search.'
            ) : (
                requireSubmit
                    ? `Submit at least ${minSearchTermLength} characters to\u00A0search.`
                    : `Type at least ${minSearchTermLength} characters to\u00A0search`
            )
        )
    );
    return (
        <div className={classnames(CLASS_NAME, className)}>
            {effectiveMessage}
        </div>
    );
}
