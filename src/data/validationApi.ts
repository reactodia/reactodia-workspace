import type { AuthoringState } from '../editor/authoringState';
import type { DataGraphStructure } from '../editor/dataDiagramModel';

import type { ElementModel, LinkModel, ElementIri, PropertyTypeIri } from './model';

export interface ElementError {
    readonly type: 'element';
    readonly target: ElementIri;
    readonly message: string;
    readonly propertyType?: PropertyTypeIri;
}

export interface LinkError {
    readonly type: 'link';
    readonly target: LinkModel;
    readonly message: string;
}

export interface ValidationEvent {
    readonly target: ElementModel;
    readonly outboundLinks: ReadonlyArray<LinkModel>;
    readonly graph: DataGraphStructure;
    readonly state: AuthoringState;
    readonly signal: AbortSignal | undefined;
}

/**
 * @category Core
 */
export interface ValidationApi {
    /**
     * Validate element and its outbound links.
     */
    validate(e: ValidationEvent): Promise<Array<ElementError | LinkError>>;
}
