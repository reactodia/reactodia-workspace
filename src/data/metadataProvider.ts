import { ElementModel, ElementTypeIri, LinkTypeIri, PropertyTypeIri, LinkModel } from './model';

/**
 * Provides a strategy to visual graph authoring: which parts of the graph
 * are editable and what is the range of possible values to allow.
 *
 * **Experimental**: this feature will likely change in the future.
 *
 * @category Core
 */
export interface MetadataProvider {
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

    getEntityTypeShape(
        type: ElementTypeIri,
        options: { readonly signal?: AbortSignal }
    ): Promise<MetadataEntityTypeShape>;

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

export interface MetadataEntityTypeShape {
    readonly properties: PropertyTypeIri[];
}
