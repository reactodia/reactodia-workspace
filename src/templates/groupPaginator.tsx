import * as React from 'react';
import classnames from 'classnames';

/**
 * Props for {@link GroupPaginator} component.
 *
 * @see {@link GroupPaginator}
 */
export interface GroupPaginatorProps {
    /**
     * Current page index.
     */
    readonly pageIndex: number;
    /**
     * Total page count.
     */
    readonly pageCount: number;
    /**
     * Handler to change the page.
     */
    readonly onChangePage: (page: number) => void;

    /**
     * Current page size.
     */
    readonly pageSize: number;
    /**
     * Selectable page sizes.
     */
    readonly pageSizes: ReadonlyArray<number>;
    /**
     * Handler to change the page size.
     */
    readonly onChangePageSize: (size: number) => void;
}

const CLASS_NAME = 'reactodia-group-paginator';

/**
 * Utility component to display paginator for an element group.
 *
 * @category Components
 */
export function GroupPaginator(props: GroupPaginatorProps) {
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
