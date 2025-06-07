import type { Translation } from '../coreUtils/i18n';

import { ElementModel, PropertyTypeIri, isEncodedBlank } from '../data/model';
import * as Rdf from '../data/rdf/rdfModel';
import { rdfs, schema } from '../data/rdf/vocabulary';

import type { DataDiagramModel } from './dataDiagramModel';

/**
 * Provides the methods to format the graph data according to the current language.
 *
 * @see {@link DefaultDataLocaleFormatter}
 */
export interface DataLocaleProvider {
    /**
     * Selects a preferred set of localized labels for an entity.
     */
    selectEntityLabel(entity: ElementModel): readonly Rdf.Literal[];
    /**
     * Selects a preferred image URL for an entity.
     */
    selectEntityImageUrl(entity: ElementModel): string | undefined;
    /**
     * Formats an IRI (unique identifier) for a graph content item.
     */
    formatIri(iri: string): string;
    /**
     * Formats a graph entity label.
     *
     * @param entity entity to format label for
     * @param language target language code
     */
    formatEntityLabel(entity: ElementModel, language: string): string;
    /**
     * Formats a graph entity types into a list.
     *
     * @param entity entity to format type list for
     * @param language target language code
     */
    formatEntityTypeList(entity: ElementModel, language: string): string;
}

/**
 * Options for {@link DefaultDataLocaleProvider}.
 */
export interface DefaultDataLocaleProviderOptions {
    /**
     * Provided {@link DataDiagramModel} with the diagram content.
     */
    readonly model: DataDiagramModel;
    /**
     * Provided {@link Translation} for i18n strings and language-based selection.
     */
    readonly translation: Translation;
    /**
     * Property IRIs to select labels from for an entity.
     *
     * The values of a first property in the sequence with a non-empty value set are selected.
     *
     * @default ["http://www.w3.org/2000/01/rdf-schema#label"]
     */
    readonly labelProperties?: readonly PropertyTypeIri[];
    /**
     * Property IRIs to select image URL from for an entity.
     *
     * The first found value of a property in the sequence is selected as an entity image.
     *
     * @default ["http://schema.org/thumbnailUrl"]
     */
    readonly imageProperties?: readonly PropertyTypeIri[];
}

/**
 * Provides a default graph data locale provider implementation.
 *
 * The default provider uses {@link rdfs.label} and {@link schema.thumbnailUrl}
 * properties to get labels and image URLs unless overridden with options.
 */
export class DefaultDataLocaleProvider implements DataLocaleProvider {
    protected readonly model: DataDiagramModel;
    protected readonly translation: Translation;
    private readonly labelProperties: readonly PropertyTypeIri[];
    private readonly imageProperties: readonly PropertyTypeIri[];

    private readonly EMPTY_LABELS: readonly Rdf.Literal[] = [];

    constructor(options: DefaultDataLocaleProviderOptions) {
        const {
            model,
            translation,
            labelProperties = [rdfs.label],
            imageProperties = [schema.thumbnailUrl],
        } = options;
        this.model = model;
        this.translation = translation;
        this.labelProperties = labelProperties;
        this.imageProperties = imageProperties;
    }

    selectEntityLabel(entity: ElementModel): readonly Rdf.Literal[] {
        for (const property of this.labelProperties) {
            if (Object.prototype.hasOwnProperty.call(entity.properties, property)) {
                const values = entity.properties[property];
                const literals = values ? filterInLiterals(values) : this.EMPTY_LABELS;
                if (literals.length > 0) {
                    return literals;
                }
            }
        }
        return this.EMPTY_LABELS;
    }

    selectEntityImageUrl(entity: ElementModel): string | undefined {
        for (const property of this.imageProperties) {
            if (Object.prototype.hasOwnProperty.call(entity.properties, property)) {
                const values = entity.properties[property];
                if (values && values.length > 0) {
                    return values[0].value;
                }
            }
        }
        return undefined;
    }

    /**
     * Formats an IRI (unique identifier) for a graph content item.
     *
     * **By default**:
     *   - usual IRIs are enclosed in `<IRI>`;
     *   - anonymous element IRIs displayed as `(blank node)`.
     */
    formatIri(iri: string): string {
        if (isEncodedBlank(iri)) {
            return this.translation.text('default_data_locale.iri_blank', {
                value: iri,
            });
        }
        return this.translation.text('default_data_locale.iri', {
            value: iri,
        });
    }

    /**
     * Formats a graph entity label.
     *
     * **By default**: uses {@link selectEntityLabel} to get entity labels and
     * {@link Translation.formatLabel} to select one based on the {@link DiagramModel.language}.
     *
     * @param entity entity to format label for
     * @param language target language code
     */
    formatEntityLabel(entity: ElementModel, language: string): string {
        const labels = this.selectEntityLabel(entity);
        return this.translation.formatLabel(labels, entity.id, language);
    }

    /**
     * Formats a graph entity types into a list.
     *
     * **By default**: returns a sorted comma-separated list of formatted type labels.
     *
     * @param entity entity to format label for
     * @param language target language code
     */
    formatEntityTypeList(entity: ElementModel, language: string): string {
        const labelList = entity.types.map(iri => {
            const labels = this.model.getElementType(iri)?.data?.label;
            return this.translation.formatLabel(labels, iri, language);
        });
        labelList.sort();
        return labelList.join(', ');
    }
}

function filterInLiterals(terms: ReadonlyArray<Rdf.NamedNode | Rdf.Literal>): readonly Rdf.Literal[] {
    for (const term of terms) {
        if (term.termType !== 'Literal') {
            return terms.filter((t): t is Rdf.Literal => t.termType === 'Literal');
        }
    }
    return terms as readonly Rdf.Literal[];
}
