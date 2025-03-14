import { HashMap, type ReadonlyHashMap } from '@reactodia/hashmap';

import { mapAbortedToNull } from '../coreUtils/async';

import { ElementIri, LinkKey, LinkModel, hashLink, equalLinks } from '../data/model';
import {
    ValidationProvider, ValidationEvent, ValidationResult, ValidatedElement, ValidatedLink,
    ValidationSeverity,
} from '../data/validationProvider';

import { AuthoringState } from './authoringState';
import { DataGraphStructure } from './dataDiagramModel';
import { iterateEntitiesOf, iterateRelationsOf } from './dataElements';
import { EditorController } from './editorController';

/**
 * Immutable validation state for the data changes from the graph authoring.
 *
 * @category Core
 */
export interface ValidationState {
    /**
     * Validation state for the entities.
     */
    readonly elements: ReadonlyMap<ElementIri, ElementValidation>;
    /**
     * Validation state for the relations.
     */
    readonly links: ReadonlyHashMap<LinkKey, LinkValidation>;
}

/**
 * Validation state for a single entity.
 */
export interface ElementValidation {
    /**
     * Whether the entity is currently being validated.
     */
    readonly loading: boolean;
    /**
     * Validation errors for the entity.
     */
    readonly items: ReadonlyArray<ValidatedElement>;
}

/**
 * Validation state for a single relation.
 */
export interface LinkValidation {
    /**
     * Whether the relation is currently being validated.
     */
    readonly loading: boolean;
    /**
     * Validation errors for the relation.
     */
    readonly items: ReadonlyArray<ValidatedLink>;
}

/**
 * Utility functions to operate on validation state for the graph authoring.
 *
 * @category Core
 */
export namespace ValidationState {
    export const empty: ValidationState = createMutable();
    export const emptyElement: ElementValidation = {loading: false, items: []};
    export const emptyLink: LinkValidation = {loading: false, items: []};

    export function createMutable() {
        return {
            elements: new Map<ElementIri, ElementValidation>(),
            links: new HashMap<LinkKey, LinkValidation>(hashLink, equalLinks),
        };
    }

    export function setElementItems(
        state: ValidationState,
        target: ElementIri,
        items: ReadonlyArray<ValidatedElement>
    ): ValidationState {
        const elements = new Map(state.elements);
        if (items.length > 0) {
            elements.set(target, {loading: false, items});
        } else {
            elements.delete(target);
        }
        return {...state, elements};
    }

    export function setLinkItems(
        state: ValidationState,
        target: LinkKey,
        items: ReadonlyArray<ValidatedLink>
    ): ValidationState {
        const links = state.links.clone();
        if (items.length > 0) {
            links.set(target, {loading: false, items});
        } else {
            links.delete(target);
        }
        return {...state, links};
    }
}

export function changedElementsToValidate(
    previousAuthoring: AuthoringState,
    currentAuthoring: AuthoringState,
    graph: DataGraphStructure
): Set<ElementIri> {
    const links = new HashMap<LinkKey, true>(hashLink, equalLinks);
    previousAuthoring.links.forEach((e, model) => links.set(model, true));
    currentAuthoring.links.forEach((e, model) => links.set(model, true));

    const toValidate = new Set<ElementIri>();
    links.forEach((value, linkModel) => {
        const current = currentAuthoring.links.get(linkModel);
        const previous = previousAuthoring.links.get(linkModel);
        if (current !== previous) {
            toValidate.add(linkModel.sourceId);
        }
    });

    for (const element of graph.elements) {
        for (const entity of iterateEntitiesOf(element)) {
            const current = currentAuthoring.elements.get(entity.id);
            const previous = previousAuthoring.elements.get(entity.id);
            if (current !== previous) {
                toValidate.add(entity.id);

                // when we remove element incoming link are removed as well so we should update their sources
                if ((current || previous)!.type === 'entityDelete') {
                    for (const link of graph.getElementLinks(element)) {
                        for (const relation of iterateRelationsOf(link)) {
                            if (relation.targetId === entity.id && relation.sourceId !== entity.id) {
                                toValidate.add(relation.sourceId);
                            }
                        }
                    }
                }
            }
        }
    }

    return toValidate;
}

export function validateElements(
    targets: ReadonlySet<ElementIri>,
    validationProvider: ValidationProvider,
    graph: DataGraphStructure,
    editor: EditorController,
    signal: AbortSignal | undefined
): void {
    const previousState = editor.validationState;
    const newState = ValidationState.createMutable();

    for (const element of graph.elements) {
        for (const entity of iterateEntitiesOf(element)) {
            if (newState.elements.has(entity.id)) {
                continue;
            }

            const outboundLinks: LinkModel[] = [];
            for (const link of graph.getElementLinks(element)) {
                for (const relation of iterateRelationsOf(link)) {
                    if (relation.sourceId === entity.id) {
                        outboundLinks.push(relation);
                    }
                }
            }

            if (targets.has(entity.id)) {
                const event: ValidationEvent = {
                    target: entity,
                    outboundLinks,
                    state: editor.authoringState,
                    graph,
                    signal,
                };
                const result = mapAbortedToNull(validationProvider.validate(event), signal);

                const loadingElement: ElementValidation = {loading: true, items: []};
                const loadingLink: LinkValidation = {loading: true, items: []};
                newState.elements.set(entity.id, loadingElement);
                outboundLinks.forEach(link => newState.links.set(link, loadingLink));

                processValidationResult(result, loadingElement, loadingLink, event, editor);
            } else {
                // use previous state for element and outbound links
                newState.elements.set(entity.id, previousState.elements.get(entity.id)!);
                for (const link of outboundLinks) {
                    newState.links.set(link, previousState.links.get(link)!);
                }
            }
        }
    }

    editor.setValidationState(newState);
}

async function processValidationResult(
    resultTask: Promise<ValidationResult | null>,
    previousElement: ElementValidation,
    previousLink: LinkValidation,
    e: ValidationEvent,
    editor: EditorController,
) {
    let result: ValidationResult | null;
    try {
        result = await resultTask;
        if (result === null) {
            // validation was cancelled
            return;
        }
    } catch (err) {
        console.error('Failed to validate element', e.target, err);
        const items: ReadonlyArray<ValidatedElement | ValidatedLink> = [{
            type: 'element',
            target: e.target.id,
            severity: 'error',
            message: 'Failed to validate element',
        }];
        result = {items};
    }

    const elementItems: ValidatedElement[] = [];
    const linkItems = new HashMap<LinkKey, ValidatedLink[]>(hashLink, equalLinks);
    e.outboundLinks.forEach(link => linkItems.set(link, []));

    for (const item of result.items) {
        if (item.type === 'element' && item.target === e.target.id) {
            elementItems.push(item);
        } else if (item.type === 'link' && linkItems.has(item.target)) {
            linkItems.get(item.target)!.push(item);
        }
    }

    let state = editor.validationState;
    if (state.elements.get(e.target.id) === previousElement) {
        state = ValidationState.setElementItems(state, e.target.id, elementItems);
    }
    linkItems.forEach((items, link) => {
        if (state.links.get(link) === previousLink) {
            state = ValidationState.setLinkItems(state, link, items);
        }
    });
    editor.setValidationState(state);
}

const SEVERITY_INDEX = new Map<ValidationSeverity, number>([
    ['info', 0],
    ['warning', 1],
    ['error', 2],
]);

export function getMaxSeverity(
    items: ReadonlyArray<{ readonly severity: ValidationSeverity }>
): ValidationSeverity {
    let maxSeverity: ValidationSeverity = 'info';
    let maxSeverityIndex = SEVERITY_INDEX.get(maxSeverity) ?? -1;
    for (const {severity} of items) {
        const index = SEVERITY_INDEX.get(severity) ?? -1;
        if (index > maxSeverityIndex) {
            maxSeverityIndex = index;
            maxSeverity = severity;
        }
    }
    return maxSeverity;
}
