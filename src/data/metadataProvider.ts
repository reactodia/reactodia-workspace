import type { TemplateState } from '../data/schema';

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
 * It is recommended to extend {@link BaseMetadataProvider} instead of
 * implementing this interface directly to stay compatible with future versions.
 *
 * @category Core
 */
export interface MetadataProvider {
    getLiteralLanguages(): ReadonlyArray<string>;

    createEntity(
        type: ElementTypeIri,
        options: { readonly signal?: AbortSignal }
    ): Promise<MetadataCreatedEntity>;

    createRelation(
        source: ElementModel,
        target: ElementModel,
        linkType: LinkTypeIri,
        options: { readonly signal?: AbortSignal }
    ): Promise<MetadataCreatedRelation>;

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

export interface MetadataCreatedEntity {
    readonly data: ElementModel;
    readonly elementState?: TemplateState;
}

export interface MetadataCreatedRelation {
    readonly data: LinkModel;
    readonly linkState?: TemplateState;
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
 * Metadata provider to use as a stable base to implement {@link MetadataProvider}
 * interface.
 *
 * @category Core
 */
export class BaseMetadataProvider implements MetadataProvider {
    private readonly methods: Partial<MetadataProvider>;
    private readonly emptyProperties = new Map<PropertyTypeIri, MetadataPropertyShape>();

    constructor(methods: Partial<MetadataProvider> = {}) {
        this.methods = methods;
    }

    getLiteralLanguages(): ReadonlyArray<string> {
        if (this.methods.getLiteralLanguages) {
            return this.methods.getLiteralLanguages();
        }
        return [];
    }

    async createEntity(
        type: ElementTypeIri,
        options: { readonly signal?: AbortSignal; }
    ): Promise<MetadataCreatedEntity> {
        if (this.methods.createEntity) {
            return this.methods.createEntity(type, options);
        }
        return {
            data: {
                id: '',
                types: [],
                properties: {},
            },
        };
    }

    async createRelation(
        source: ElementModel,
        target: ElementModel,
        linkType: LinkTypeIri,
        options: { readonly signal?: AbortSignal; }
    ): Promise<MetadataCreatedRelation> {
        if (this.methods.createRelation) {
            return this.methods.createRelation(source, target, linkType, options);
        }
        return {
            data: {
                linkTypeId: linkType,
                sourceId: source.id,
                targetId: target.id,
                properties: {},
            },
        };
    }

    async canConnect(
        source: ElementModel,
        target: ElementModel | undefined,
        linkType: LinkTypeIri | undefined,
        options: { readonly signal?: AbortSignal; }
    ): Promise<MetadataCanConnect[]> {
        if (this.methods.canConnect) {
            return this.methods.canConnect(source, target, linkType, options);
        }
        return [];
    }

    async canModifyEntity(
        entity: ElementModel,
        options: { readonly signal?: AbortSignal; }
    ): Promise<MetadataCanModifyEntity> {
        if (this.methods.canModifyEntity) {
            return this.methods.canModifyEntity(entity, options);
        }
        return {};
    }

    async canModifyRelation(
        link: LinkModel,
        source: ElementModel,
        target: ElementModel,
        options: { readonly signal?: AbortSignal; }
    ): Promise<MetadataCanModifyRelation> {
        if (this.methods.canModifyRelation) {
            return this.methods.canModifyRelation(link, source, target, options);
        }
        return {};
    }

    async getEntityShape(
        types: ReadonlyArray<ElementTypeIri>,
        options: { readonly signal?: AbortSignal; }
    ): Promise<MetadataEntityShape> {
        if (this.methods.getEntityShape) {
            return this.methods.getEntityShape(types, options);
        }
        return {
            properties: this.emptyProperties,
        };
    }

    async getRelationShape(
        linkType: LinkTypeIri,
        options: { readonly signal?: AbortSignal; }
    ): Promise<MetadataRelationShape> {
        if (this.methods.getRelationShape) {
            return this.methods.getRelationShape(linkType, options);
        }
        return {
            properties: this.emptyProperties,
        };
    }

    async filterConstructibleTypes(
        types: ReadonlySet<ElementTypeIri>,
        options: { readonly signal?: AbortSignal; }
    ): Promise<ReadonlySet<ElementTypeIri>> {
        if (this.methods.filterConstructibleTypes) {
            return this.methods.filterConstructibleTypes(types, options);
        }
        return new Set<ElementTypeIri>();
    }
}
