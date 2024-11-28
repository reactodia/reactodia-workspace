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
 * Provides a strategy to validate changes to the data in the graph authoring mode.
 *
 * @category Core
 */
export interface ValidationApi {
    /**
     * Validate an element (graph node) and its outbound links (graph edges).
     */
    validate(e: ValidationEvent): Promise<Array<ElementError | LinkError>>;
}
