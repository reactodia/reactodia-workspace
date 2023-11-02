import { PropTypes } from '../viewUtils/react';

import type { DiagramView } from './view';
import type { PaperArea } from './paperArea';

export interface PaperAreaContextWrapper {
    ontodiaPaperArea: PaperAreaContext;
}

export interface PaperAreaContext {
    paperArea: PaperArea;
    view: DiagramView;
}

export const PaperAreaContextTypes: { [K in keyof PaperAreaContextWrapper]: any } = {
    ontodiaPaperArea: PropTypes.anything,
};
