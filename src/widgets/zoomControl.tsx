import classnames from 'classnames';

import { PaperWidgetProps } from '../diagram/paperArea';

export interface ZoomControlProps extends PaperWidgetProps {}

type ProvidedProps =
    Omit<ZoomControlProps, keyof PaperWidgetProps> &
    Required<PaperWidgetProps>;

const CLASS_NAME = 'ontodia-zoom-control';

export function ZoomControl(props: ZoomControlProps) {
    const {paperArea} = props as ProvidedProps;
    return (
        <div className={CLASS_NAME}>
            <button type='button'
                className={classnames(
                    `${CLASS_NAME}__zoom-in-button`,
                    'ontodia-btn ontodia-btn-default'
                )}
                title='Zoom In'
                onClick={() => paperArea.zoomIn()}>
            </button>
            <button type='button'
                className={classnames(
                    `${CLASS_NAME}__zoom-out-button`,
                    'ontodia-btn ontodia-btn-default'
                )}
                title='Zoom Out'
                onClick={() => paperArea.zoomOut()}>
            </button>
            <button type='button'
                className={classnames(
                    `${CLASS_NAME}__zoom-fit-button`,
                    'ontodia-btn ontodia-btn-default'
                )}
                title='Fit to Screen'
                onClick={() => paperArea.zoomToFit()}>
            </button>
        </div>
    );
}
