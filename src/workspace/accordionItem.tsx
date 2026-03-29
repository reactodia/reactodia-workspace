import * as React from 'react';
import cx from 'clsx';

import { DraggableHandle } from '../widgets/utility/draggableHandle';

export enum DockSide {
    Left = 1,
    Right,
}

export interface AccordionItemProps extends ItemProvidedProps {
    id: string;
    ariaLabel?: string;
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
    titleDockExpand?: string;
    titleDockCollapse?: string;
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
    private static readonly ARROW_SHIFT_STEP = 50;

    private _element = React.createRef<HTMLDivElement>();
    private _header = React.createRef<HTMLButtonElement>();

    constructor(props: AccordionItemProps) {
        super(props);
        this.state = {
            resizing: false,
        };
    }

    get element(): HTMLDivElement | null { return this._element.current; }
    get header():  HTMLButtonElement | null { return this._header.current; }

    private get isVertical() {
        return this.props.direction === 'vertical';
    }

    render() {
        const {
            ariaLabel, heading, className, style, bodyClassName, children, bodyRef,
            collapsed, size, direction, dockSide,
            onBeginDragHandle, onDragHandle, onEndDragHandle,
        } = this.props;
        const {resizing} = this.state;
        const shouldRenderHandle = onBeginDragHandle && onDragHandle && onEndDragHandle;
        const providedStyle: React.CSSProperties = this.isVertical ? {height: size} : {width: size};

        // unmount child component when the accordion item is collapsed and has dockSide
        const isMounted = !(collapsed && dockSide);
        return (
            <section ref={this._element}
                className={cx(
                    CLASS_NAME,
                    collapsed ? `${CLASS_NAME}--collapsed`: `${CLASS_NAME}--expanded`,
                    `${CLASS_NAME}--${direction}`,
                    resizing ? `${CLASS_NAME}--resizing` : undefined,
                    className
                )}
                style={{...style, ...providedStyle}}
                aria-label={ariaLabel ?? (typeof heading === 'string' ? heading : undefined)}>
                <div className={`${CLASS_NAME}__inner`}>
                    {heading ? (
                        <button className={`${CLASS_NAME}__header`}
                            ref={this._header}
                            onClick={() => this.props.onChangeCollapsed!(!collapsed)}>
                            {heading}
                        </button>
                    ) : null}
                    <div className={`${CLASS_NAME}__body`}>
                        {children && isMounted
                            ? children
                            : <div ref={bodyRef} className={bodyClassName} />}
                    </div>
                </div>
                {shouldRenderHandle ? (
                    <DraggableHandle role="separator"
                        className={cx(`${CLASS_NAME}__handle`, `${CLASS_NAME}__handle-${direction}`)}
                        tabIndex={0}
                        aria-valuenow={typeof size === 'string' && size.endsWith('%') ? parseFloat(size) : 0}
                        onBeginDragHandle={e => {
                            this.setState({resizing: true});
                            onBeginDragHandle();
                        }}
                        onDragHandle={(e, x, y) => onDragHandle(x, y)}
                        onEndDragHandle={e => {
                            this.setState({resizing: false});
                            onEndDragHandle();
                        }}
                        onKeyDown={e => {
                            const step = AccordionItem.ARROW_SHIFT_STEP;
                            let shift = 0;

                            if (this.isVertical) {
                                if (e.key === 'ArrowUp') {
                                    shift -= step;
                                } else if (e.key === 'ArrowDown') {
                                    shift += step;
                                }
                            } else {
                                if (e.key === 'ArrowLeft') {
                                    shift -= step;
                                } else if (e.key === 'ArrowRight') {
                                    shift += step;
                                }
                            }
                            
                            if (shift !== 0) {
                                e.preventDefault();
                                onBeginDragHandle();
                                onDragHandle(shift, shift);
                                onEndDragHandle();
                            }
                        }}
                    />
                ) : null}
                {this.renderToggleButton()}
            </section>
        );
    }

    private renderToggleButton() {
        const {
            collapsed, dockSide, titleDockExpand, titleDockCollapse, onChangeCollapsed,
        } = this.props;
        if (!dockSide) {
            return null;
        }
        const side = dockSide === DockSide.Left ? 'left' : 'right';
        const label = collapsed ? titleDockExpand : titleDockCollapse;
        return (
            <button
                className={cx(`${CLASS_NAME}__handle-btn`, `${CLASS_NAME}__handle-btn-${side}`)}
                onClick={() => onChangeCollapsed!(!collapsed)}
                aria-label={label}
                title={label}
            />
        );
    }
}
