import * as React from 'react';

import { AccordionItem, AccordionItemProps } from './accordionItem';

export interface AccordionProps {
    onStartResize?: (direction: 'vertical' | 'horizontal') => void;
    onResize?: (direction: 'vertical' | 'horizontal') => void;
    /** AccordionItem[] */
    children?: React.ReactElement<AccordionItemProps> | ReadonlyArray<React.ReactElement<AccordionItemProps>>;
    direction?: 'vertical' | 'horizontal';
    animationDuration?: number;
}

interface DefaultItemProps {
    defaultSize?: number;
    defaultCollapsed?: boolean;
    collapsedSize?: number;
    minSize?: number;
}

interface State {
    /**
     * Items' sizes in pixels.
     *
     * Unset until first resize or toggle initiated by user.
     */
    readonly sizes: number[];
    /**
     * Items' sizes in percent.
     */
    readonly percents: string[];
    /**
     * Per-item collapsed state: true if corresponding item is collapsed;
     * otherwise false.
     */
    readonly collapsed: boolean[];
    readonly resizing: boolean;
}

const CLASS_NAME = 'ontodia-accordion';

type DefaultPropKeys = 'direction' | 'animationDuration';
type ProvidedProps =
    Omit<AccordionProps, DefaultPropKeys> &
    Required<Pick<AccordionProps, DefaultPropKeys>>;

export class Accordion extends React.Component<AccordionProps, State> {
    static defaultProps: Required<Pick<AccordionProps, DefaultPropKeys>> = {
        direction: 'vertical',
        animationDuration: 300,
    };

    private element: HTMLDivElement | undefined | null;

    private items: AccordionItem[] = [];
    private dragOrigin: {
        sizes: ReadonlyArray<number>;
        collapsed: ReadonlyArray<boolean>;
        totalSize: number;
    } | undefined;

    private defaultProps!: ReadonlyMap<number, DefaultItemProps>;

    private isScrollable = false;

    constructor(props: AccordionProps) {
        super(props);
        const childCount = React.Children.count(this.props.children);
        this.state = {
            sizes: [],
            collapsed: [],
            resizing: false,
            percents: React.Children.map(this.props.children, () => `${100 / childCount}%`) as string[],
        };
    }

    componentDidMount() {
        this.updateSizes();
    }

    componentDidUpdate(prevProps: AccordionProps, prevState: State) {
        const {direction, children, onResize, animationDuration} = this.props as ProvidedProps;
        if (React.Children.count(children) !== React.Children.count(prevProps.children)) {
            this.updateSizes();
        }
        const {sizes, resizing} = this.state;
        if (sizes !== prevState.sizes && onResize) {
            if (resizing) {
                onResize(direction);
            } else {
                // triggers the callback after finishing CSS animation
                setTimeout(() => onResize(direction), animationDuration);
            }
        }
    }

    private get isVertical() {
        return this.props.direction === 'vertical';
    }

    private clientSize(element: HTMLElement) {
        const {clientWidth, clientHeight} = element;
        return this.isVertical ? clientHeight : clientWidth;
    }

    private offsetSize(element: HTMLElement) {
        const {offsetWidth, offsetHeight} = element;
        return this.isVertical ? offsetHeight : offsetWidth;
    }

    private updateSizes = () => {
        const {children} = this.props;
        const defaultProps = new Map<number, DefaultItemProps>();
        React.Children.forEach(children, (child, index) => {
            if (typeof child !== 'object') { return; }
            const {defaultSize, defaultCollapsed, collapsedSize, minSize} = child.props;
            // enables the scrollbar in the accordion if at least one item has min size
            if (minSize !== undefined) {
                this.isScrollable = true;
            }
            defaultProps.set(index, {defaultSize, defaultCollapsed, collapsedSize, minSize});
        });
        this.defaultProps = defaultProps;
        this.setState(({collapsed}) => {
            const totalSize = this.clientSize(this.element!.parentElement!);
            let leftSize = totalSize;
            let leftChildCount = React.Children.count(children);
            const newCollapsed: Array<boolean> = [];
            this.defaultProps.forEach(({defaultSize, defaultCollapsed = false}, index) => {
                // preserves items collapsed by user
                let itemCollapsed = collapsed[index] === undefined
                    ? defaultCollapsed
                    : collapsed[index];
                // if no expanded items, expands the last one
                const isLastItem = index === this.defaultProps.size - 1;
                const noExpandedItems = newCollapsed.findIndex(c => !c) < 0;
                if (isLastItem && noExpandedItems) {
                    itemCollapsed = false;
                }
                const size = itemCollapsed ? this.sizeWhenCollapsed(index) : defaultSize;
                if (size) {
                    leftSize = leftSize - size;
                    leftChildCount = leftChildCount - 1;
                }
                newCollapsed.push(itemCollapsed);
            });
            const newSizes: Array<number> = [];
            const newPercents: Array<string> = [];
            this.defaultProps.forEach(({defaultSize, minSize}, index) => {
                let size = leftSize / leftChildCount;
                const collapsedSize = this.sizeWhenCollapsed(index);
                if (newCollapsed[index]) {
                    size = collapsedSize;
                } else if (defaultSize !== undefined) {
                    size = defaultSize;
                } else if (minSize !== undefined && size < minSize) {
                    size = collapsedSize + minSize;
                }
                if (size < collapsedSize) {
                    size = collapsedSize;
                    newCollapsed[index] = true;
                }
                const percent = `${100 * size / totalSize}%`;
                newSizes.push(size);
                newPercents.push(percent);
            });
            return {
                sizes: newSizes,
                percents: newPercents,
                collapsed: newCollapsed,
            };
        });
    }

    render() {
        const {direction} = this.props;
        const {resizing} = this.state;
        const resizingClassName = resizing ? `${CLASS_NAME}--resizing` : '';
        const scrollableClassName = this.isScrollable ? `${CLASS_NAME}--scrollable` : '';
        return (
            <div className={`${CLASS_NAME} ${CLASS_NAME}--${direction} ${resizingClassName} ${scrollableClassName}`}
                ref={this.onElementMount}>
                {this.renderItems()}
            </div>
        );
    }

    private onElementMount = (element: HTMLDivElement | null) => {
        this.element = element;
    };

    private renderItems() {
        const {sizes, percents, collapsed} = this.state;
        const {children, direction} = this.props;

        return React.Children.map(children, (child, index) => {
            if (typeof child !== 'object') {
                throw new Error('Accordion should have only AccordionItem elements as children');
            }
            const lastChild = index === React.Children.count(children) - 1;
            const size = collapsed[index] ? sizes[index] : percents[index];

            const additionalProps: AccordionItemProps & React.ClassAttributes<AccordionItem> = {
                ref: element => {
                    if (element) {
                        this.items[index] = element;
                    }
                },
                collapsed: collapsed[index],
                size,
                direction,
                onChangeCollapsed: itemCollapsed => this.onItemChangeCollapsed({itemIndex: index, itemCollapsed}),
                onBeginDragHandle: lastChild ? undefined : () => this.onBeginDragHandle(index),
                onDragHandle: lastChild ? undefined : (dx, dy) => this.onDragHandle(index, dx, dy),
                onEndDragHandle: this.onEndDragHandle,
            };
            return React.cloneElement(child, additionalProps);
        });
    }

    private onBeginDragHandle = (itemIndex: number) => {
        this.dragOrigin = {
            totalSize: this.clientSize(this.element!),
            sizes: this.computeEffectiveItemSizes(),
            collapsed: [...this.state.collapsed],
        };
        this.setState({resizing: true}, () => {
            const {direction, onStartResize} = this.props as ProvidedProps;
            if (onStartResize) {
                onStartResize(direction);
            }
        });
    }

    private onEndDragHandle = () => {
        this.setState({resizing: false});
    }

    private computeEffectiveItemSizes(): number[] {
        const sizes: Array<number> = [];
        this.items.forEach((item, index) => {
            if (!item) { return; }
            if (this.state.collapsed[index]) {
                const collapsedSize = this.sizeWhenCollapsed(index);
                sizes.push(collapsedSize);
            } else {
                sizes.push(this.offsetSize(item.element!));
            }
        });
        return sizes;
    }

    private sizeWhenCollapsed = (index: number) => {
        const item = this.items[index];
        const {collapsedSize} = this.defaultProps.get(index)!;
        if (collapsedSize !== undefined) {
            return collapsedSize;
        }
        const headerSize = item.header ? this.clientSize(item.header) : 0;
        return headerSize + (this.offsetSize(item.element!) - this.clientSize(item.element!));
    }

    private onDragHandle = (itemIndex: number, dx: number, dy: number) => {
        const sizes = [...this.dragOrigin!.sizes];
        const collapsed = [...this.dragOrigin!.collapsed];
        const originTotalSize = this.dragOrigin!.totalSize;

        new SizeDistributor(
            sizes, collapsed, originTotalSize, this.sizeWhenCollapsed,
        ).distribute(itemIndex + 1, this.isVertical ? dy : dx);

        const percents = sizes.map(size => `${100 * size / originTotalSize}%`);

        this.setState({sizes, percents, collapsed});
    }

    private onItemChangeCollapsed({itemIndex, itemCollapsed}: {
        itemIndex: number;
        itemCollapsed: boolean;
    }) {
        const totalSize = this.clientSize(this.element!);
        const sizes = this.computeEffectiveItemSizes();

        if (sizes.length === 1) { return; }

        const collapsed = [...this.state.collapsed];

        const effectiveSize = sizes[itemIndex];

        const collapsedSize = this.sizeWhenCollapsed(itemIndex);
        const distributor = new SizeDistributor(
            sizes, collapsed, totalSize, this.sizeWhenCollapsed);

        if (itemCollapsed) {
            const splitShift = Math.max(effectiveSize - collapsedSize, 0);
            sizes[itemIndex] = collapsedSize;
            if (itemIndex === sizes.length - 1) {
                distributor.expand(splitShift, itemIndex - 1);
            } else {
                distributor.expand(splitShift, itemIndex + 1);
            }
        } else {
            const {defaultSize, minSize} = this.defaultProps.get(itemIndex)!;
            const shift = (defaultSize || (totalSize / sizes.length)) - collapsedSize;
            let freeSize = 0;
            if (itemIndex === sizes.length - 1) {
                freeSize = distributor.collapseForward({shift, from: itemIndex - 1, to: itemIndex});
            } else {
                freeSize = distributor.collapseForward({shift, from: itemIndex + 1, to: sizes.length});
            }
            freeSize = Math.max(freeSize, distributor.leftoverSize());
            if (freeSize < shift) {
                freeSize += distributor.collapseForward({shift: shift - freeSize, from: 0, to: itemIndex});
            }
            if (minSize !== undefined && freeSize < minSize) {
                freeSize = minSize;
            }
            sizes[itemIndex] = Math.round(collapsedSize + freeSize);
        }

        collapsed[itemIndex] = itemCollapsed;

        const percents = sizes.map(size => `${100 * size / totalSize}%`);

        this.setState({sizes, percents, collapsed});
    }
}

class SizeDistributor {
    constructor(
        readonly sizes: number[],
        readonly collapsed: boolean[],
        readonly totalSize: number,
        readonly sizeWhenCollapsed: (index: number) => number,
    ) {}

    distribute(splitIndex: number, splitShift: number) {
        if (splitShift > 0) {
            let freeSize = this.collapseForward({shift: splitShift, from: splitIndex, to: this.sizes.length});
            freeSize = Math.max(freeSize, this.leftoverSize());
            this.expand(freeSize, splitIndex - 1);
        } else {
            let freeSize = this.collapseBackward({shift: -splitShift, from: 0, to: splitIndex});
            freeSize = Math.max(freeSize, this.leftoverSize());
            this.expand(freeSize, splitIndex);
        }
    }

    collapseForward({shift, from, to}: {
        shift: number;
        from: number;
        to: number;
    }) {
        if (shift <= 0) { return 0; }
        let shiftLeft = shift;
        for (let i = from; i < to; i++) {
            shiftLeft = this.collapse(shiftLeft, i);
        }
        return shift - shiftLeft;
    }

    collapseBackward({shift, from, to}: {
        shift: number;
        from: number;
        to: number;
    }) {
        if (shift <= 0) { return 0; }
        let shiftLeft = shift;
        for (let i = to - 1; i >= from; i--) {
            shiftLeft = this.collapse(shiftLeft, i);
        }
        return shift - shiftLeft;
    }

    private collapse(shift: number, index: number) {
        if (this.collapsed[index]) {
            return shift;
        }
        const size = this.sizes[index];
        const collapsedSize = this.sizeWhenCollapsed(index);
        const newSize = Math.round(Math.max(size - shift, collapsedSize));
        this.sizes[index] = newSize;
        this.collapsed[index] = newSize <= collapsedSize;
        return shift - (size - newSize);
    }

    expand(shift: number, index: number) {
        if (shift <= 0) { return 0; }
        const oldSize = this.sizes[index];
        const newSize = Math.round(oldSize + shift);
        this.sizes[index] = newSize;
        this.collapsed[index] = newSize <= this.sizeWhenCollapsed(index);
        return newSize - oldSize;
    }

    leftoverSize() {
        const sizeSum = this.sizes.reduce((sum, size) => sum + size, 0);
        return Math.max(this.totalSize - sizeSum, 0);
    }
}
