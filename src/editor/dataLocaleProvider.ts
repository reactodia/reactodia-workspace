import type { Translation } from '../coreUtils/i18n';

import { ElementModel, PropertyTypeIri, isEncodedBlank } from '../data/model';
import * as Rdf from '../data/rdf/rdfModel';

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
     * Property IRI to select labels from for an entity.
     */
    readonly labelProperty?: PropertyTypeIri | undefined;
    /**
     * Property IRI to select image URL from for an entity.
     */
    readonly imageProperty?: PropertyTypeIri | undefined;
}

/**
 * Provides a default graph data formatter implementation.
 */
export class DefaultDataLocaleProvider implements DataLocaleProvider {
    protected readonly model: DataDiagramModel;
    protected readonly translation: Translation;
    private readonly labelProperty: PropertyTypeIri | undefined;
    private readonly imageProperty: PropertyTypeIri | undefined;

    private readonly EMPTY_LABELS: readonly Rdf.Literal[] = [];

    constructor(options: DefaultDataLocaleProviderOptions) {
        const {
            model,
            translation,
            labelProperty = Rdf.Vocabulary.rdfs.label,
            imageProperty = Rdf.Vocabulary.schema.thumbnailUrl,
        } = options;
        this.model = model;
        this.translation = translation;
        this.labelProperty = labelProperty;
        this.imageProperty = imageProperty;
    }

    selectEntityLabel(entity: ElementModel): readonly Rdf.Literal[] {
        if (this.labelProperty !== undefined) {
            if (Object.prototype.hasOwnProperty.call(entity.properties, this.labelProperty)) {
                const values = entity.properties[this.labelProperty];
                return values ? filterInLiterals(values) : this.EMPTY_LABELS;
            }
        }
        return this.EMPTY_LABELS;
    }

    selectEntityImageUrl(entity: ElementModel): string | undefined {
        if (this.imageProperty !== undefined) {
            if (Object.prototype.hasOwnProperty.call(entity.properties, this.imageProperty)) {
                const values = entity.properties[this.imageProperty];
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
