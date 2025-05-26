import type * as Rdf from './rdf/rdfModel';
import type {
    ElementModel, ElementTypeIri, LinkTypeIri, PropertyTypeIri, LinkModel,
} from './model';

/**
 * Provides a strategy to visual graph authoring: which parts of the graph
 * are editable and what is the range of possible values to allow.
 *
 * **Unstable**: this interface will likely change in the future.
 *
 * It is recommended to extend {@link EmptyMetadataProvider} instead of
 * implementing this interface directly to stay compatible with future versions.
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
    ): Promise<MetadataCanModifyRelation>;

    getEntityShape(
        types: ReadonlyArray<ElementTypeIri>,
        options: { readonly signal?: AbortSignal }
    ): Promise<MetadataEntityShape>;

    getRelationShape(
        linkType: LinkTypeIri,
        options: { readonly signal?: AbortSignal }
    ): Promise<MetadataRelationShape>;

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
    readonly canEdit?: boolean;
    readonly canDelete?: boolean;
}

export interface MetadataEntityShape {
    readonly extraProperty?: MetadataPropertyShape;
    readonly properties: ReadonlyMap<PropertyTypeIri, MetadataPropertyShape>;
}

export interface MetadataRelationShape {
    readonly extraProperty?: MetadataPropertyShape;
    readonly properties: ReadonlyMap<PropertyTypeIri, MetadataPropertyShape>;
}

export interface MetadataPropertyShape {
    /**
     * RDF term shape for the property.
     */
    readonly valueShape: MetadataValueShape;
    /**
     * Minimum number of values for the property.
     *
     * @default 0
     */
    readonly minCount?: number;
    /**
     * Maximum number of values for the property (inclusive).
     *
     * @default Infinity
     */
    readonly maxCount?: number;
}

export type MetadataValueShape =
    | { readonly termType: 'NamedNode' }
    | {
        readonly termType: 'Literal';
        readonly datatype?: Rdf.NamedNode;
    };

/**
 * Metadata provider which does not allow to change anything in the graph
 * and returns nothing or empty metadata when requested.
 *
 * @category Core
 */
export class EmptyMetadataProvider implements MetadataProvider {
    private readonly emptyProperties = new Map<PropertyTypeIri, MetadataPropertyShape>();

    getLiteralLanguages(): ReadonlyArray<string> {
        return [];
    }

    async createEntity(
        type: ElementTypeIri,
        options: { readonly signal?: AbortSignal; }
    ): Promise<ElementModel> {
        return {
            id: '',
            types: [],
            properties: {},
        };
    }

    async createRelation(
        source: ElementModel,
        target: ElementModel,
        linkType: LinkTypeIri,
        options: { readonly signal?: AbortSignal; }
    ): Promise<LinkModel> {
        return {
            linkTypeId: linkType,
            sourceId: source.id,
            targetId: target.id,
            properties: {},
        };
    }

    async canConnect(
        source: ElementModel,
        target: ElementModel | undefined,
        linkType: LinkTypeIri | undefined,
        options: { readonly signal?: AbortSignal; }
    ): Promise<MetadataCanConnect[]> {
        return [];
    }

    async canModifyEntity(
        entity: ElementModel,
        options: { readonly signal?: AbortSignal; }
    ): Promise<MetadataCanModifyEntity> {
        return {};
    }

    async canModifyRelation(
        link: LinkModel,
        source: ElementModel,
        target: ElementModel,
        options: { readonly signal?: AbortSignal; }
    ): Promise<MetadataCanModifyRelation> {
        return {};
    }

    async getEntityShape(
        types: ReadonlyArray<ElementTypeIri>,
        options: { readonly signal?: AbortSignal; }
    ): Promise<MetadataEntityShape> {
        return {
            properties: this.emptyProperties,
        };
    }

    async getRelationShape(
        linkType: LinkTypeIri,
        options: { readonly signal?: AbortSignal; }
    ): Promise<MetadataRelationShape> {
        return {
            properties: this.emptyProperties,
        };
    }

    async filterConstructibleTypes(
        types: ReadonlySet<ElementTypeIri>,
        options: { readonly signal?: AbortSignal; }
    ): Promise<ReadonlySet<ElementTypeIri>> {
        return new Set<ElementTypeIri>();
    }
}
