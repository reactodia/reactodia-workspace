import type { AuthoringState } from '../editor/authoringState';
import type { DataGraphStructure } from '../editor/dataDiagramModel';

import type { ElementModel, ElementIri, LinkKey, LinkModel, PropertyTypeIri } from './model';

export interface ValidationEvent {
    readonly target: ElementModel;
    readonly outboundLinks: ReadonlyArray<LinkModel>;
    readonly graph: DataGraphStructure;
    readonly state: AuthoringState;
    readonly signal: AbortSignal | undefined;
}

export interface ValidationResult {
    readonly items: ReadonlyArray<ValidatedElement | ValidatedLink>;
}

export interface ValidatedElement {
    readonly type: 'element';
    readonly target: ElementIri;
    readonly severity: ValidationSeverity;
    readonly message: string;
    readonly propertyType?: PropertyTypeIri;
}

export interface ValidatedLink {
    readonly type: 'link';
    readonly target: LinkKey;
    readonly severity: ValidationSeverity;
    readonly message: string;
}

export type ValidationSeverity = 'info' | 'warning' | 'error';

/**
 * Provides a strategy to validate changes to the data in the graph authoring mode.
 *
 * **Experimental**: this feature will likely change in the future.
 *
 * @category Core
 */
export interface ValidationProvider {
    /**
     * Validate an element (graph node) and its outbound links (graph edges).
     */
    validate(e: ValidationEvent): Promise<ValidationResult>;
}
