import * as React from 'react';
import classnames from 'classnames';

export interface PaginatorProps {
    readonly pageIndex: number;
    readonly pageCount: number;
    readonly onChangePage: (page: number) => void;
}

const CLASS_NAME = 'reactodia-paginator';

export function Paginator(props: PaginatorProps) {
    const {pageIndex, pageCount, onChangePage} = props;
    const lastPage = pageCount - 1;

    return (
        <div className={CLASS_NAME}>
            <button type='button'
                className={classnames('reactodia-btn', `${CLASS_NAME}__previous`)}
                disabled={pageIndex <= 0}
                onClick={() => onChangePage(pageIndex - 1)}
            />
            <div className={`${CLASS_NAME}__status`}>{pageIndex + 1} of {pageCount}</div>
            <button type='button'
                className={classnames('reactodia-btn', `${CLASS_NAME}__next`)}
                disabled={pageIndex >= lastPage}
                onClick={() => onChangePage(pageIndex + 1)}
            />
        </div>
    );
}
