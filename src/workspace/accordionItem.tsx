import * as React from 'react';
import cx from 'clsx';

import { DraggableHandle } from '../widgets/utility/draggableHandle';

export enum DockSide {
    Left = 1,
    Right,
}

export interface AccordionItemProps extends ItemProvidedProps {
    id: string;
    heading?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    bodyClassName?: string;
    bodyRef?: (body: HTMLDivElement) => void;
    children?: React.ReactNode;
    defaultSize?: number;
    defaultCollapsed?: boolean;
    collapsedSize?: number;
    minSize?: number;
}

/**
 * Props provided by {@link Accordion}.
 */
export interface ItemProvidedProps {
    collapsed?: boolean;
    size?: number | string;
    direction?: 'vertical' | 'horizontal';
    dockSide?: DockSide;
    onChangeCollapsed?: (collapsed: boolean) => void;
    onBeginDragHandle?: (() => void) | undefined;
    onDragHandle?: (dx: number, dy: number) => void;
    onEndDragHandle?: () => void;
}

const CLASS_NAME = 'reactodia-accordion-item';

interface State {
    resizing?: boolean;
}

export class AccordionItem extends React.Component<AccordionItemProps, State> {
    private _element = React.createRef<HTMLDivElement>();
    private _header = React.createRef<HTMLDivElement>();

    constructor(props: AccordionItemProps) {
        super(props);
        this.state = {
            resizing: false,
        };
    }

    get element(): HTMLDivElement | null { return this._element.current; }
    get header():  HTMLDivElement | null { return this._header.current; }

    private get isVertical() {
        return this.props.direction === 'vertical';
    }

    private renderToggleButton() {
        const {collapsed, dockSide, onChangeCollapsed} = this.props;
        if (!dockSide) {
            return null;
        }
        const side = dockSide === DockSide.Left ? 'left' : 'right';
        return <div className={`${CLASS_NAME}__handle-btn ${CLASS_NAME}__handle-btn-${side}`}
            onClick={() => onChangeCollapsed!(!collapsed)} />;
    }

    render() {
        const {
            heading, className, style, bodyClassName, children, bodyRef,
            collapsed, size, direction, onBeginDragHandle, onDragHandle, onEndDragHandle, dockSide,
        } = this.props;
        const {resizing} = this.state;
        const shouldRenderHandle = onBeginDragHandle && onDragHandle && onEndDragHandle;
        const providedStyle: React.CSSProperties = this.isVertical ? {height: size} : {width: size};

        // unmount child component when the accordion item is collapsed and has dockSide
        const isMounted = !(collapsed && dockSide);
        return (
            <div ref={this._element}
                className={cx(
                    CLASS_NAME,
                    collapsed ? `${CLASS_NAME}--collapsed`: `${CLASS_NAME}--expanded`,
                    `${CLASS_NAME}--${direction}`,
                    resizing ? `${CLASS_NAME}--resizing` : undefined,
                    className
                )}
                style={{...style, ...providedStyle}}>
                <div className={`${CLASS_NAME}__inner`}>
                    {heading ? <div className={`${CLASS_NAME}__header`}
                        ref={this._header}
                        onClick={() => this.props.onChangeCollapsed!(!collapsed)}>{heading}</div> : null}
                    <div className={`${CLASS_NAME}__body`}>
                        {children && isMounted
                            ? children
                            : <div ref={bodyRef} className={bodyClassName} />}
                    </div>
                </div>
                {shouldRenderHandle ? (
                    <DraggableHandle className={`${CLASS_NAME}__handle ${CLASS_NAME}__handle-${direction}`}
                        onBeginDragHandle={e => {
                            this.setState({resizing: true});
                            onBeginDragHandle();
                        }}
                        onDragHandle={(e, x, y) => onDragHandle(x, y)}
                        onEndDragHandle={e => {
                            this.setState({resizing: false});
                            onEndDragHandle();
                        }}/>
                ) : null}
                {this.renderToggleButton()}
            </div>
        );
    }
}
