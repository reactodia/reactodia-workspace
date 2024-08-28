import * as React from 'react';
import classnames from 'classnames';

export interface PaginatorProps {
    readonly pageIndex: number;
    readonly pageCount: number;
    readonly onChangePage: (page: number) => void;

    readonly pageSize: number;
    readonly pageSizes: ReadonlyArray<number>;
    readonly onChangePageSize: (size: number) => void;
}

const CLASS_NAME = 'reactodia-paginator';

export function Paginator(props: PaginatorProps) {
    const {
        pageIndex, pageCount, onChangePage,
        pageSize, pageSizes, onChangePageSize,
    } = props;
    const lastPage = pageCount - 1;

    return (
        <div className={CLASS_NAME}>
            <button type='button'
                className={classnames('reactodia-btn', `${CLASS_NAME}__previous`)}
                name='Go to the next page'
                disabled={pageIndex <= 0}
                onClick={() => onChangePage(pageIndex - 1)}
            />
            <div className={`${CLASS_NAME}__status`}>{pageIndex + 1} of {pageCount}</div>
            <button type='button'
                className={classnames('reactodia-btn', `${CLASS_NAME}__next`)}
                title='Go to the previous page'
                disabled={pageIndex >= lastPage}
                onClick={() => onChangePage(pageIndex + 1)}
            />
            <select className={`${CLASS_NAME}__page-size`}
                title='Number of items to display per page'
                value={pageSize}
                // Allow <select> to work inside element template
                onPointerDown={e => e.stopPropagation()}
                onChange={e => onChangePageSize(Number(e.currentTarget.value))}>
                {pageSizes.map(size => <option key={size} value={size}>{size}</option>)}
            </select>
        </div>
    );
}
