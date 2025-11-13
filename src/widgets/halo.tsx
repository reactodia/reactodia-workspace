import * as React from 'react';
import cx from 'clsx';

import { AnyListener, EventObserver } from '../coreUtils/events';
import { useObservedProperty } from '../coreUtils/hooks';
import { TranslatedText } from '../coreUtils/i18n';

import { setTemplateProperty, TemplateProperties } from '../data/schema';

import { CanvasApi, useCanvas } from '../diagram/canvasApi';
import { RestoreGeometry } from '../diagram/commands';
import { Element, ElementEvents } from '../diagram/elements';
import { Rect, boundsOf } from '../diagram/geometry';
import { Command } from '../diagram/history';
import type { DiagramModel } from '../diagram/model';
import { CanvasPlaceAt } from '../diagram/placeLayer';

import { ResizableBox, type ResizableBoxOperation } from './utility/resizableBox';
import {
    SelectionActionRemove, SelectionActionExpand, SelectionActionAnchor,
    SelectionActionConnections, SelectionActionAddToFilter, SelectionActionGroup,
    SelectionActionEstablishLink, SelectionActionAnnotate,
} from './selectionAction';

/**
 * Props for {@link Halo} component.
 *
 * @see {@link Halo}
 */
export interface HaloProps {
    /**
     * Margin between the element and surrounding actions.
     *
     * **Default** is set by `--reactodia-selection-single-box-margin` CSS property.
     */
    margin?: number;
    /**
     * {@link SelectionAction} items representing available actions on the selected element.
     *
     * **Default**:
     * ```jsx
     * <>
     *   <SelectionActionGroup dock='nw' dockColumn={1} />
     *   <SelectionActionRemove dock='ne' />
     *   <SelectionActionExpand dock='s' />
     *   <SelectionActionAnchor dock='w' />
     *   <SelectionActionConnections dock='e' />
     *   <SelectionActionAddToFilter dock='se' />
     *   <SelectionActionAnnotate dock='se' dockColumn={1} />
     *   <SelectionActionEstablishLink dock='sw' />
     * </>
     * ```
     */
    children?: React.ReactNode;
}

/**
 * Canvas widget component to display actions for the single selected diagram element.
 *
 * @category Components
 */
export function Halo(props: HaloProps) {
    const {model, canvas} = useCanvas();

    const singleTarget = useObservedProperty(
        model.events,
        'changeSelection',
        () => {
            const target = model.selection.length === 1 ? model.selection[0] : undefined;
            return target instanceof Element ? target : undefined;
        }
    );

    if (singleTarget) {
        return (
            <CanvasPlaceAt layer='overElements'>
                <HaloInner {...props}
                    target={singleTarget}
                    canvas={canvas}
                    model={model}
                />
            </CanvasPlaceAt>
        );
    }
    return null;
}

interface HaloInnerProps extends HaloProps {
    readonly target: Element;
    readonly canvas: CanvasApi;
    readonly model: DiagramModel;
}

const CLASS_NAME = 'reactodia-halo';

class HaloInner extends React.Component<HaloInnerProps> {
    private readonly listener = new EventObserver();
    private targetListener = new EventObserver();

    constructor(props: HaloInnerProps) {
        super(props);
        this.state = {};
    }

    componentDidMount() {
        const {canvas, target} = this.props;
        this.listener.listen(canvas.events, 'changeTransform', () => this.forceUpdate());
        this.listenToElement(target);
    }

    componentDidUpdate(prevProps: HaloInnerProps) {
        if (prevProps.target !== this.props.target) {
            this.listenToElement(this.props.target);
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.listenToElement(undefined);
    }

    listenToElement(element: Element | undefined) {
        const {canvas} = this.props;
        this.targetListener.stopListening();
        if (element) {
            this.targetListener.listenAny(element.events, this.onElementEvent);
            this.targetListener.listen(canvas.renderingState.events, 'changeElementSize', e => {
                if (e.source === element) {
                    this.forceUpdate();
                }
            });
        }
    }

    private onElementEvent: AnyListener<ElementEvents> = data => {
        if (data.changePosition) {
            this.forceUpdate();
        }
    };

    render() {
        const {
            target,
            canvas,
            model,
            margin,
            children,
        } = this.props;

        const template = canvas.renderingState.getElementTemplate(target);
        const resizable = Boolean(template.supports?.[TemplateProperties.ElementSize]);

        const bbox = boundsOf(target, canvas.renderingState);
        const {x: x0, y: y0} = canvas.metrics.paperToScrollablePaneCoords(bbox.x, bbox.y);
        const {x: x1, y: y1} = canvas.metrics.paperToScrollablePaneCoords(
            bbox.x + bbox.width,
            bbox.y + bbox.height,
        );
        const style = {
            '--reactodia-selection-single-box-margin': margin,
            '--reactodia-halo-left': `${x0}px`,
            '--reactodia-halo-top': `${y0}px`,
            '--reactodia-halo-width': `${x1 - x0}px`,
            '--reactodia-halo-height': `${y1 - y0}px`,
        } as React.CSSProperties;

        return (
            <div className={cx(CLASS_NAME, resizable ? `${CLASS_NAME}--resizable` : undefined)}
                style={style}>
                {resizable && (
                    <ResizableBox
                        className={`${CLASS_NAME}__resizer`}
                        mapCoordsFromPage={(x, y) => canvas.metrics.pageToPaperCoords(x, y)}
                        startResize={() => {
                            model.history.registerToUndo(Command.compound(
                                TranslatedText.text('commands.transform_elements.title'),
                                [RestoreGeometry.capturePartial([target], [])]
                            ));
                            return new ElementResizeOperation(target, bbox);
                        }}
                        minWidth={40}
                        minHeight={40}
                    />
                )}
                {children ?? <>
                    <SelectionActionGroup dock='nw' dockColumn={1} />
                    <SelectionActionRemove dock='ne' />
                    <SelectionActionExpand dock='s' />
                    <SelectionActionAnchor dock='w' />
                    <SelectionActionConnections dock='e' />
                    <SelectionActionAddToFilter dock='se' />
                    <SelectionActionAnnotate dock='se' dockColumn={1} />
                    <SelectionActionEstablishLink dock='sw' />
                </>}
            </div>
        );
    }
}

class ElementResizeOperation implements ResizableBoxOperation {
    constructor(
        private readonly target: Element,
        readonly initialBounds: Rect
    ) {}

    onResize({x, y, width, height}: Rect): void {
        this.target.setPosition({x, y});
        this.target.setElementState(setTemplateProperty(
            this.target.elementState,
            TemplateProperties.ElementSize,
            {width, height},
        ));
    }

    end(): void {
        /* nothing */
    }
}
