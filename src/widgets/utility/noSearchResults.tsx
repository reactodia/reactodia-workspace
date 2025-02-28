import cx from 'clsx';
import * as React from 'react';

import { useTranslation } from '../../coreUtils/i18n';

const CLASS_NAME = 'reactodia-no-search-results';

export function NoSearchResults(props: {
    className?: string;
    hasQuery: boolean;
    /**
     * @default 1
     */
    minSearchTermLength?: number;
    message?: string;
}) {
    const {className, hasQuery, minSearchTermLength: termLength = 1, message} = props;
    const t = useTranslation();
    const effectiveMessage = message ?? (
        hasQuery ? t.text('search_defaults.no_results') :
        termLength <= 1 ? t.text('search_defaults.empty_input_term', {termLength}) :
        t.text('search_defaults.input_term_too_short', {termLength})
    );
    return (
        <div className={cx(CLASS_NAME, className)}>
            {effectiveMessage}
        </div>
    );
}
