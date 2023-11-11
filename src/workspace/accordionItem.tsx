import * as React from 'react';

import { DraggableHandle } from './draggableHandle';

export enum DockSide {
    Left = 1,
    Right,
}

export interface AccordionItemProps extends ParentProvidedProps {
    heading?: React.ReactNode;
    bodyClassName?: string;
    bodyRef?: (body: HTMLDivElement) => void;
    children?: React.ReactNode;
    defaultSize?: number;
    defaultCollapsed?: boolean;
    collapsedSize?: number;
    minSize?: number;
}

/**
 * Props provided by `Accordion`.
 */
interface ParentProvidedProps {
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

type DefaultPropKeys = 'direction';
type ProvidedProps =
    Omit<AccordionItemProps, DefaultPropKeys & keyof ParentProvidedProps> &
    Required<Pick<AccordionItemProps, DefaultPropKeys>>;

export class AccordionItem extends React.Component<AccordionItemProps, State> {
    static defaultProps: Partial<AccordionItemProps> = {
        direction: 'vertical',
    };

    private _element: HTMLDivElement | undefined | null;
    private _header: HTMLDivElement | undefined | null;

    constructor(props: AccordionItemProps) {
        super(props);
        this.state = {
            resizing: false,
        };
    }

    get element() { return this._element; }
    get header() { return this._header; }

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
            heading, bodyClassName, children, bodyRef,
            collapsed, size, direction, onBeginDragHandle, onDragHandle, onEndDragHandle, dockSide,
        } = this.props as ProvidedProps;
        const {resizing} = this.state;
        const shouldRenderHandle = onBeginDragHandle && onDragHandle && onEndDragHandle;
        const style: React.CSSProperties = this.isVertical ? {height: size} : {width: size};

        // unmount child component when the accordion item is collapsed and has dockSide
        const isMounted = !(collapsed && dockSide);
        return (
            <div
                className={
                    `${CLASS_NAME} ${CLASS_NAME}--${collapsed ? 'collapsed' : 'expanded'} ${CLASS_NAME}--${direction}
                    ${resizing ? `${CLASS_NAME}--resizing` : ''}`
                }
                ref={element => this._element = element}
                style={style}>
                <div className={`${CLASS_NAME}__inner`}>
                    {heading ? <div className={`${CLASS_NAME}__header`}
                        ref={header => this._header = header}
                        onClick={() => this.props.onChangeCollapsed!(!collapsed)}>{heading}</div> : null}
                    <div className={`${CLASS_NAME}__body`}>
                        {children && isMounted
                            ? children
                            : <div ref={bodyRef} className={`${bodyClassName || ''}`} />}
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
