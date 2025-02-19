import type * as Rdf from './rdf/rdfModel';
import type {
    ElementModel, ElementTypeIri, LinkTypeIri, PropertyTypeIri, LinkModel,
} from './model';

/**
 * Provides a strategy to visual graph authoring: which parts of the graph
 * are editable and what is the range of possible values to allow.
 *
 * **Experimental**: this feature will likely change in the future.
 *
 * @category Core
 */
export interface MetadataProvider {
    getLiteralLanguages(): ReadonlyArray<string>;

    createEntity(
        type: ElementTypeIri,
        options: { readonly signal?: AbortSignal }
    ): Promise<ElementModel>;

    createRelation(
        source: ElementModel,
        target: ElementModel,
        linkType: LinkTypeIri,
        options: { readonly signal?: AbortSignal }
    ): Promise<LinkModel>;

    canConnect(
        source: ElementModel,
        target: ElementModel | undefined,
        linkType: LinkTypeIri | undefined,
        options: { readonly signal?: AbortSignal }
    ): Promise<MetadataCanConnect[]>;

    canModifyEntity(
        entity: ElementModel,
        options: { readonly signal?: AbortSignal }
    ): Promise<MetadataCanModifyEntity>;

    canModifyRelation(
        link: LinkModel,
        source: ElementModel,
        target: ElementModel,
        options: { readonly signal?: AbortSignal }
    ): Promise<MetadataCanModifyEntity>;

    getEntityShape(
        types: ReadonlyArray<ElementTypeIri>,
        options: { readonly signal?: AbortSignal }
    ): Promise<MetadataEntityShape>;

    filterConstructibleTypes(
        types: ReadonlySet<ElementTypeIri>,
        options: { readonly signal?: AbortSignal }
    ): Promise<ReadonlySet<ElementTypeIri>>;
}

export interface MetadataCanConnect {
    readonly targetTypes: ReadonlySet<ElementTypeIri>;
    readonly inLinks: ReadonlyArray<LinkTypeIri>;
    readonly outLinks: ReadonlyArray<LinkTypeIri>;
}

export interface MetadataCanModifyEntity {
    readonly canChangeIri?: boolean;
    readonly canEdit?: boolean;
    readonly canDelete?: boolean;
}

export interface MetadataCanModifyRelation {
    readonly canChangeType?: boolean;
    readonly canDelete?: boolean;
}

export interface MetadataEntityShape {
    readonly properties: ReadonlyMap<PropertyTypeIri, MetadataPropertyShape>;
}

export interface MetadataPropertyShape {
    readonly valueShape: MetadataValueShape;
}

export type MetadataValueShape =
    | { readonly termType: 'NamedNode' }
    | {
        readonly termType: 'Literal';
        readonly datatype?: Rdf.NamedNode;
    };
