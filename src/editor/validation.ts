import { mapAbortedToNull } from '../coreUtils/async';
import { HashMap, ReadonlyHashMap } from '../coreUtils/hashMap';

import { ElementIri, LinkKey, LinkModel, hashLink, equalLinks } from '../data/model';
import { ValidationApi, ValidationEvent, ElementError, LinkError } from '../data/validationApi';

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
    readonly errors: ReadonlyArray<ElementError>;
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
    readonly errors: ReadonlyArray<LinkError>;
}

/**
 * Utility functions to operate on validation state for the graph authoring.
 *
 * @category Core
 */
export namespace ValidationState {
    export const empty: ValidationState = createMutable();
    export const emptyElement: ElementValidation = {loading: false, errors: []};
    export const emptyLink: LinkValidation = {loading: false, errors: []};

    export function createMutable() {
        return {
            elements: new Map<ElementIri, ElementValidation>(),
            links: new HashMap<LinkKey, LinkValidation>(hashLink, equalLinks),
        };
    }

    export function setElementErrors(
        state: ValidationState, target: ElementIri, errors: ReadonlyArray<ElementError>
    ): ValidationState {
        const elements = new Map(state.elements);
        if (errors.length > 0) {
            elements.set(target, {loading: false, errors});
        } else {
            elements.delete(target);
        }
        return {...state, elements};
    }

    export function setLinkErrors(
        state: ValidationState, target: LinkModel, errors: ReadonlyArray<LinkError>
    ): ValidationState {
        const links = state.links.clone();
        if (errors.length > 0) {
            links.set(target, {loading: false, errors});
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
                if ((current || previous)!.deleted) {
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
    validationApi: ValidationApi,
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
                const result = mapAbortedToNull(validationApi.validate(event), signal);

                const loadingElement: ElementValidation = {loading: true, errors: []};
                const loadingLink: LinkValidation = {loading: true, errors: []};
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
    result: Promise<Array<ElementError | LinkError> | null>,
    previousElement: ElementValidation,
    previousLink: LinkValidation,
    e: ValidationEvent,
    editor: EditorController,
) {
    let allErrors: Array<ElementError | LinkError> | null;
    try {
        allErrors = await result;
        if (allErrors === null) {
            // validation was cancelled
            return;
        }
    } catch (err) {
        console.error('Failed to validate element', e.target, err);
        allErrors = [{
            type: 'element',
            target: e.target.id,
            message: 'Failed to validate element',
        }];
    }

    const elementErrors: ElementError[] = [];
    const linkErrors = new HashMap<LinkModel, LinkError[]>(hashLink, equalLinks);
    e.outboundLinks.forEach(link => linkErrors.set(link, []));

    for (const error of allErrors) {
        if (error.type === 'element' && error.target === e.target.id) {
            elementErrors.push(error);
        } else if (error.type === 'link' && linkErrors.has(error.target)) {
            linkErrors.get(error.target)!.push(error);
        }
    }

    let state = editor.validationState;
    if (state.elements.get(e.target.id) === previousElement) {
        state = ValidationState.setElementErrors(state, e.target.id, elementErrors);
    }
    linkErrors.forEach((errors, link) => {
        if (state.links.get(link) === previousLink) {
            state = ValidationState.setLinkErrors(state, link, errors);
        }
    });
    editor.setValidationState(state);
}
