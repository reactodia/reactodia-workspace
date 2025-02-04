import * as React from 'react';
import classnames from 'classnames';

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
        termLength <= 1 ? t.format('search_defaults.empty_input_term', {termLength}) :
        t.format('search_defaults.input_term_too_short', {termLength})
    );
    return (
        <div className={classnames(CLASS_NAME, className)}>
            {effectiveMessage}
        </div>
    );
}
