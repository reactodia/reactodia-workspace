import { AbortScope } from '../coreUtils/async';
import { AnyEvent, EventSource, Events } from '../coreUtils/events';

import {
    ElementIri, ElementModel, ElementTypeIri, LinkModel, LinkTypeModel,
    LinkTypeIri, PropertyTypeIri, equalLinks,
} from '../data/model';
import { EmptyDataProvider } from '../data/decorated/emptyDataProvider';
import { DataProvider } from '../data/provider';
import * as Rdf from '../data/rdf/rdfModel';

import { setLinkState } from '../diagram/commands';
import { LabelLanguageSelector, FormattedProperty } from '../diagram/customization';
import { Link, LinkTypeVisibility } from '../diagram/elements';
import { Rect, getContentFittingBox } from '../diagram/geometry';
import { Command } from '../diagram/history';
import {
    DiagramLocaleFormatter, DiagramModel, DiagramModelEvents, DiagramModelOptions,
    GraphStructure, LocaleFormatter,
} from '../diagram/model';

import {
    EntityElement, EntityGroup, EntityGroupItem,
    RelationLink, RelationGroup, RelationGroupItem,
    ElementType, ElementTypeEvents,
    PropertyType, PropertyTypeEvents,
    LinkType, LinkTypeEvents,
    iterateEntitiesOf, setEntityGroupItems, setRelationGroupItems, setRelationLinkData,
} from './dataElements';
import {
    DataFetcher, ChangeOperationsEvent, FetchOperation, FetchOperationTargetType,
    FetchOperationTypeToTarget,
} from './dataFetcher';
import {
    SerializedDiagram, SerializedLinkOptions, emptyDiagram,
    serializeDiagram, deserializeDiagram, markLayoutOnly,
} from './serializedDiagram';
import { DataGraph } from './dataGraph';

/**
 * Event data for {@link DataDiagramModel} events.
 *
 * @see {@link DataDiagramModel}
 */
export interface DataDiagramModelEvents extends DiagramModelEvents {
    /**
     * Triggered on any event from an element type in the graph.
     */
    elementTypeEvent: AnyEvent<ElementTypeEvents>;
    /**
     * Triggered on any event from a link type in the graph.
     */
    linkTypeEvent: AnyEvent<LinkTypeEvents>;
    /**
     * Triggered on any event from a property type in the graph.
     */
    propertyTypeEvent: AnyEvent<PropertyTypeEvents>;

    /**
     * Triggered on start of the diagram "create new" or "import" operations.
     *
     * @see {@link DataDiagramModel.createNewDiagram}
     * @see {@link DataDiagramModel.importLayout}
     */
    loadingStart: { readonly source: DataDiagramModel };
    /**
     * Triggered on successful completion of diagram loading operation.
     */
    loadingSuccess: { readonly source: DataDiagramModel };
    /**
     * Triggered on failed completion of diagram loading operation.
     */
    loadingError: {
        readonly source: DataDiagramModel;
        readonly error: unknown;
    };

    /**
     * Triggered on {@link DataDiagramModel.operations} property change.
     */
    changeOperations: ChangeOperationsEvent;
    /**
     * Triggered when a link would be created on the diagram from a data provider.
     *
     * It is possible to discard the link and avoid creating it by calling  `cancel()`
     * method on the event object.
     *
     * This event is triggered only when a link is created from a data provider and
     * won't be triggered on explicit call for the model to create links.
     */
    createLoadedLink: {
        readonly source: DataDiagramModel;
        readonly model: LinkModel;
        cancel(): void;
    };
}

/**
 * Provides entity graph content: elements and connected links,
 * as well as element, link and property types.
 *
 * @category Core
 */
export interface DataGraphStructure extends GraphStructure {
    /**
     * Gets an element type by its {@link ElementType.id} in the graph if exists.
     *
     * Element types are added to the graph as requested by
     * {@link DataDiagramModel.createElementType} so the data (e.g. labels) can be
     * fetched from a data provider.
     *
     * @see {@link DataDiagramModel.createElementType}
     */
    getElementType(elementTypeIri: ElementTypeIri): ElementType | undefined;
    /**
     * Gets an link type by its {@link LinkType.id} in the graph if exists.
     *
     * Link types are added to the graph as requested by {@link DataDiagramModel.createLinkType}
     * so the data (e.g. labels) can be fetched from a data provider.
     *
     * @see {@link DataDiagramModel.createLinkType}
     */
    getLinkType(linkTypeIri: LinkTypeIri): LinkType | undefined;
    /**
     * Gets an property type by its {@link PropertyType.id} in the graph if exists.
     *
     * Property types are added to the graph as requested by
     * {@link DataDiagramModel.createPropertyType} so the data (e.g. labels) can be
     * fetched from a data provider.
     *
     * @see {@link DataDiagramModel.createPropertyType}
     */
    getPropertyType(propertyTypeIri: PropertyTypeIri): PropertyType | undefined;
}

/** @hidden */
export interface DataDiagramModelOptions extends DiagramModelOptions {}

/**
 * Asynchronously fetches and stores the entity diagram content:
 * graph elements and links, as well as element, link and property types;
 * maintains selection and the current language to display the data.
 *
 * Additionally, the diagram model provides the means to undo/redo commands
 * via {@link DataDiagramModel.history history} and format the content using
 * {@link DataDiagramModel.locale locale}.
 *
 * @category Core
 */
export class DataDiagramModel extends DiagramModel implements DataGraphStructure {
    declare readonly events: Events<DataDiagramModelEvents>;
    declare readonly locale: DataGraphLocaleFormatter;

    private dataGraph = new DataGraph();
    private loadingScope: AbortScope | undefined;
    private _dataProvider: DataProvider;
    private fetcher: DataFetcher;

    /** @hidden */
    constructor(options: DataDiagramModelOptions) {
        super(options);
        this._dataProvider = new EmptyDataProvider();
        this.fetcher = new DataFetcher(this.graph, this.dataGraph, this._dataProvider);
        this.subscribeGraph();
    }

    protected override createLocale(selectLabelLanguage: LabelLanguageSelector): this['locale'] {
        return new ExtendedLocaleFormatter(this, selectLabelLanguage);
    }

    private get extendedSource(): EventSource<DataDiagramModelEvents> {
        return this.source as EventSource<any>;
    }    

    /**
     * Returns the data provider that is associated with the current diagram
     * via creating new or importing an existing layout.
     *
     * This provider is used to fetch entity graph data on-demand.
     *
     * By default, it is set to {@link EmptyDataProvider} instance without any graph data.
     *
     * @see {@link createNewDiagram}
     * @see {@link importLayout}
     */
    get dataProvider(): DataProvider {
        return this._dataProvider;
    }

    protected getTermFactory(): Rdf.DataFactory {
        return this._dataProvider.factory;
    }

    /**
     * Returns an immutable snapshot of current fetch operations.
     */
    get operations(): ReadonlyArray<FetchOperation> {
        return this.fetcher.operations;
    }

    /**
     * Returns a reason (thrown error) why latest fetch operation for specific target
     * failed, if any; otherwise returns `undefined`.
     */
    getOperationFailReason<T extends FetchOperationTargetType>(
        type: T,
        target: FetchOperationTypeToTarget[T]
    ): unknown {
        return this.fetcher.getFailReason(type, target);
    }

    protected override resetGraph(): void {
        this.dataGraph = new DataGraph();
        super.resetGraph();
        this.loadingScope?.abort();
        this.fetcher.dispose();
    }

    protected override subscribeGraph() {
        this.graphListener.listen(this.dataGraph.events, 'elementTypeEvent', e => {
            this.extendedSource.trigger('elementTypeEvent', e);
        });
        this.graphListener.listen(this.dataGraph.events, 'linkTypeEvent', e => {
            this.extendedSource.trigger('linkTypeEvent', e);
        });
        this.graphListener.listen(this.dataGraph.events, 'propertyTypeEvent', e => {
            this.extendedSource.trigger('propertyTypeEvent', e);
        });

        super.subscribeGraph();
    }

    private setDataProvider(dataProvider: DataProvider) {
        this._dataProvider = dataProvider;
        this.fetcher = new DataFetcher(this.graph, this.dataGraph, dataProvider);
        this.graphListener.listen(this.fetcher.events, 'changeOperations', e => {
            this.extendedSource.trigger('changeOperations', e);
        });
    }

    /**
     * Clears up the diagram and associates a new data provider for it.
     *
     * This method discards all current diagram state (elements, links and other data)
     * and resets the command history.
     *
     * @see {@link importLayout}
     */
    async createNewDiagram(params: {
        /**
         * Data provider to associate with the diagram.
         *
         * This provider will be used to fetch entity graph data on-demand
         * for the diagram.
         */
        dataProvider: DataProvider;
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<void> {
        const {dataProvider, signal} = params;
        return this.importLayout({dataProvider, signal});
    }

    /**
     * Restores diagram content from previously exported state and associates
     * a new data provider for the diagram.
     *
     * This method discards all current diagram state (elements, links and other data)
     * and resets the command history.
     *
     * @see {@link createNewDiagram}
     * @see {@link exportLayout}
     */
    async importLayout(params: {
        /**
         * Data provider to associate with the diagram.
         *
         * This provider will be used to fetch entity graph data on-demand
         * for the diagram.
         */
        dataProvider: DataProvider;
        /**
         * Diagram state to restore (elements and their positions,
         * links with visibility settings, etc).
         *
         * If specified, current diagram content will be replaced by one
         * from the state, otherwise the diagram will be cleared up only.
         */
        diagram?: SerializedDiagram;
        /**
         * Pre-cached data for the elements which should be used instead of
         * being requested from the data provider on import.
         */
        preloadedElements?: ReadonlyMap<ElementIri, ElementModel>;
        /**
         * Whether links for the between imported elements should be requested
         * from the data provider on import.
         *
         * @default false
         */
        validateLinks?: boolean;
        /**
         * Whether to fetch known link types on import and automatically hide
         * all unused link types.
         *
         * @default false
         */
        hideUnusedLinkTypes?: boolean;
        /**
         * Cancellation signal.
         */
        signal?: AbortSignal;
    }): Promise<void> {
        const {
            dataProvider,
            diagram = emptyDiagram(),
            preloadedElements,
            validateLinks = false,
            hideUnusedLinkTypes = false,
            signal: parentSignal,
        } = params;
        this.resetGraph();
        this.setDataProvider(dataProvider);

        this.loadingScope = new AbortScope(parentSignal);
        this.extendedSource.trigger('loadingStart', {source: this});
        const signal = this.loadingScope.signal;

        try {
            signal.throwIfAborted();

            this.setLinkSettings(diagram.linkTypeOptions ?? []);

            this.createGraphElements({
                diagram,
                preloadedElements,
                markLinksAsLayoutOnly: validateLinks,
            });

            if (hideUnusedLinkTypes) {
                const linkTypes = await this.dataProvider.knownLinkTypes({signal});
                signal.throwIfAborted();
                const knownLinkTypes = this.initLinkTypes(linkTypes);
                this.hideUnusedLinkTypes(knownLinkTypes);
            }

            this.subscribeGraph();

            const elementIrisToRequestData: ElementIri[] = [];
            for (const element of this.graph.getElements()) {
                for (const entity of iterateEntitiesOf(element)) {
                    if (!(preloadedElements && preloadedElements.has(entity.id))) {
                        elementIrisToRequestData.push(entity.id);
                    }
                }
            }

            const requestingModels = this.requestElementData(elementIrisToRequestData);
            const requestingLinks = params.validateLinks
                ? this.requestLinks() : Promise.resolve();

            await Promise.all([requestingModels, requestingLinks]);

            this.history.reset();
            this.extendedSource.trigger('loadingSuccess', {source: this});
        } catch (error) {
            this.extendedSource.trigger('loadingError', {source: this, error});
            throw new Error('Reactodia: failed to import a layout', {cause: error});
        } finally {
            this.loadingScope?.abort();
            this.loadingScope = undefined;
        }
    }

    /**
     * Discards all diagram content and resets associated data provider to en empty one.
     */
    discardLayout(): void {
        this.resetGraph();
        this.setDataProvider(new EmptyDataProvider());
        this.extendedSource.trigger('loadingStart', {source: this});
        this.subscribeGraph();
        this.history.reset();
        this.extendedSource.trigger('loadingSuccess', {source: this});
    }

    /**
     * Exports current diagram state to a serializable object.
     *
     * The exported state includes element and link geometry, template state,
     * references to described entities and relations (via IRIs).
     * Additionally, link type visibility settings are exported as well.
     *
     * @see {@link importLayout}
     */
    exportLayout(): SerializedDiagram {
        const knownLinkTypes = new Set(this.graph.getLinks().map(link => link.typeId));
        const linkTypeVisibility = new Map<LinkTypeIri, LinkTypeVisibility>();
        for (const linkTypeIri of knownLinkTypes) {
            linkTypeVisibility.set(linkTypeIri, this.getLinkVisibility(linkTypeIri));
        }
        return serializeDiagram({
            elements: this.graph.getElements(),
            links: this.graph.getLinks(),
            linkTypeVisibility,
        });
    }

    private initLinkTypes(linkTypes: LinkTypeModel[]): LinkType[] {
        const types: LinkType[] = [];
        for (const data of linkTypes) {
            const linkType = new LinkType({id: data.id, data});
            this.dataGraph.addLinkType(linkType);
            types.push(linkType);
        }
        return types;
    }

    private setLinkSettings(settings: ReadonlyArray<SerializedLinkOptions>) {
        for (const setting of settings) {
            const {visible = true, showLabel = true} = setting;
            const linkTypeId = setting.property as LinkTypeIri;
            const visibility: LinkTypeVisibility = (
                visible && showLabel ? 'visible' :
                visible && !showLabel ? 'withoutLabel' :
                'hidden'
            );
            this.setLinkVisibility(linkTypeId, visibility);
        }
    }

    private createGraphElements(params: {
        diagram: SerializedDiagram;
        preloadedElements?: ReadonlyMap<ElementIri, ElementModel>;
        markLinksAsLayoutOnly: boolean;
    }): void {
        const {diagram, preloadedElements, markLinksAsLayoutOnly} = params;

        const {
            elements,
            links,
            linkTypeVisibility,
        } = deserializeDiagram(diagram, {preloadedElements, markLinksAsLayoutOnly});

        const batch = this.history.startBatch({
            titleKey: 'data_diagram_model.import_layout.command'
        });

        for (const [linkTypeIri, visibility] of linkTypeVisibility) {
            this.setLinkVisibility(linkTypeIri, visibility);
        }

        const usedLinkTypes = new Set<LinkTypeIri>();
        for (const link of links) {
            const linkType = this.createLinkType(link.typeId);
            usedLinkTypes.add(linkType.id);
        }

        for (const element of elements) {
            this.addElement(element);
        }
        for (const link of links) {
            this.addLink(link);
        }

        batch.store();
    }

    private hideUnusedLinkTypes(knownLinkTypes: ReadonlyArray<LinkType>): void {
        const usedTypes = new Set<LinkTypeIri>();
        for (const link of this.graph.getLinks()) {
            usedTypes.add(link.typeId);
        }

        for (const linkType of knownLinkTypes) {
            if (!usedTypes.has(linkType.id)) {
                this.setLinkVisibility(linkType.id, 'hidden');
            }
        }
    }

    /**
     * Requests to fetch the data for the specified elements from a data provider.
     */
    requestElementData(elementIris: ReadonlyArray<ElementIri>): Promise<void> {
        return this.fetcher.fetchElementData(elementIris);
    }

    /**
     * Requests to fetch links between all elements on the diagram from a data provider.
     */
    requestLinks(options: RequestLinksOptions = {}): Promise<void> {
        const {addedElements, linkTypes} = options;

        const primaryIris: ElementIri[] = [];
        for (const element of this.graph.getElements()) {
            for (const entity of iterateEntitiesOf(element)) {
                primaryIris.push(entity.id);
            }
        }

        const secondaryIris = addedElements ?? primaryIris;
        if (primaryIris.length === 0 || secondaryIris.length === 0) {
            return Promise.resolve();
        }

        return this.fetcher
            .fetchLinks(primaryIris, secondaryIris, linkTypes)
            .then(links => this.onLinkInfoLoaded(links));
    }

    /**
     * @deprecated Use {@link DataDiagramModel.requestLinks} instead.
     */
    requestLinksOfType(linkTypeIds?: ReadonlyArray<LinkTypeIri>): Promise<void> {
        return this.requestLinks({linkTypes: linkTypeIds});
    }

    /**
     * Creates or gets an existing entity element on the diagram.
     *
     * If element is specified as an IRI only, then the placeholder data will
     * be used.
     *
     * If multiple entity elements with the same IRI is on the diagram,
     * the first one in the order will be returned.
     *
     * The operation puts a command to the {@link DiagramModel.history command history}.
     */
    createElement(elementIriOrModel: ElementIri | ElementModel): EntityElement {
        const elementIri = typeof elementIriOrModel === 'string'
            ? elementIriOrModel : (elementIriOrModel as ElementModel).id;

        const elements = this.elements.filter((el): el is EntityElement =>
            el instanceof EntityElement && el.iri === elementIri
        );
        if (elements.length > 0) {
            // usually there should be only one element
            return elements[0];
        }

        let data = typeof elementIriOrModel === 'string'
            ? EntityElement.placeholderData(elementIri)
            : elementIriOrModel as ElementModel;
        data = {...data, id: data.id};
        const element = new EntityElement({data});
        this.addElement(element);
        return element;
    }

    override addLink(link: Link): void {
        // TODO: postpone creating link type until first render
        // the same way as with element types
        this.createLinkType(link.typeId);
        super.addLink(link);
    }

    private onLinkInfoLoaded(links: LinkModel[]) {
        let allowToCreate: boolean;
        const cancel = () => { allowToCreate = false; };

        const batch = this.history.startBatch();
        for (const linkModel of links) {
            // TODO: postpone creating link type until first render
            // the same way as with element types
            this.createLinkType(linkModel.linkTypeId);
            allowToCreate = true;
            this.extendedSource.trigger('createLoadedLink', {source: this, model: linkModel, cancel});
            if (allowToCreate) {
                this.createLinks(linkModel);
            }
        }
        batch.discard();
    }

    /**
     * Creates or gets an existing links for the specified link model.
     *
     * Multiple links may exists for the same link model because in some cases
     * there could be multiple source or target elements with the same IRI.
     *
     * Each existing link for the same link model will be updated with the specified data,
     * link state property `urn:reactodia:layoutOnly` ({@link TemplateProperties.LayoutOnly})
     * will be discarded if set.
     *
     * The operation puts a command to the {@link DiagramModel.history command history}.
     */
    createLinks(data: LinkModel): Array<RelationLink | RelationGroup> {
        const {translation: t} = this;
        const sources = this.graph.getElements().filter((el): el is EntityElement | EntityGroup =>
            el instanceof EntityElement && el.iri === data.sourceId ||
            el instanceof EntityGroup && el.itemIris.has(data.sourceId)
        );
        const targets = this.graph.getElements().filter((el): el is EntityElement | EntityGroup =>
            el instanceof EntityElement && el.iri === data.targetId ||
            el instanceof EntityGroup && el.itemIris.has(data.targetId)
        );
        const batch = this.history.startBatch({
            titleKey: 'data_diagram_model.create_links.command',
        });
        const links: Array<RelationLink | RelationGroup> = [];
        for (const source of sources) {
            for (const target of targets) {
                const link = this.createRelation(source, target, data);
                links.push(link);
            }
        }
        batch.store();
        return links;
    }

    private createRelation(
        source: EntityElement | EntityGroup,
        target: EntityElement | EntityGroup,
        data: LinkModel
    ): RelationLink | RelationGroup {
        const existingLinks = Array.from(this.graph.iterateLinks(source.id, target.id, data.linkTypeId));
        for (const link of existingLinks) {
            if (link instanceof RelationLink && equalLinks(link.data, data)) {
                this.history.execute(setLinkState(link, markLayoutOnly(link.linkState, false)));
                this.history.execute(setRelationLinkData(link, data));
                return link;
            } else if (link instanceof RelationGroup && link.itemKeys.has(data)) {
                const items = link.items.map((item): RelationGroupItem => equalLinks(item.data, data)
                    ? {...item, data, linkState: markLayoutOnly(item.linkState, false)}
                    : item
                );
                this.history.execute(setRelationGroupItems(link, items));
                return link;
            }
        }

        for (const link of existingLinks) {
            if (link.typeId === link.typeId) {
                if (link instanceof RelationLink) {
                    const items: RelationGroupItem[] = [
                        {data: link.data, linkState: link.linkState},
                        {data},
                    ];
                    const group = new RelationGroup({
                        sourceId: source.id,
                        targetId: target.id,
                        typeId: data.linkTypeId,
                        items,
                    });
                    this.removeLink(link.id);
                    this.addLink(group);
                    return group;
                } if (link instanceof RelationGroup) {
                    const items: RelationGroupItem[] = [...link.items, {data}];
                    this.history.execute(setRelationGroupItems(link, items));
                    return link;
                }
            }
        }

        const link = new RelationLink({
            sourceId: source.id,
            targetId: target.id,
            data,
        });
        this.addLink(link);
        return link;
    }

    getElementType(elementTypeIri: ElementTypeIri): ElementType | undefined {
        return this.dataGraph.getElementType(elementTypeIri);
    }

    /**
     * Creates or gets an existing element type in the graph.
     *
     * If element type does not exists in the graph yet, it will be created
     * and the data for it will be requested for it from the data provider.
     */
    createElementType(elementTypeIri: ElementTypeIri): ElementType {
        const existing = this.dataGraph.getElementType(elementTypeIri);
        if (existing) {
            return existing;
        }
        const elementType = new ElementType({id: elementTypeIri});
        this.dataGraph.addElementType(elementType);
        this.fetcher.fetchElementType(elementType);
        return elementType;
    }

    getLinkType(linkTypeIri: LinkTypeIri): LinkType | undefined {
        return this.dataGraph.getLinkType(linkTypeIri);
    }

    /**
     * Creates or gets an existing link type in the graph.
     *
     * If link type does not exists in the graph yet, it will be created
     * and the data for it will be requested for it from the data provider.
     */
    createLinkType(linkTypeIri: LinkTypeIri): LinkType {
        const existing = this.dataGraph.getLinkType(linkTypeIri);
        if (existing) {
            return existing;
        }
        const linkType = new LinkType({id: linkTypeIri});
        this.dataGraph.addLinkType(linkType);
        this.fetcher.fetchLinkType(linkType);
        return linkType;
    }

    getPropertyType(propertyTypeIri: PropertyTypeIri): PropertyType | undefined {
        return this.dataGraph.getPropertyType(propertyTypeIri);
    }

    /**
     * Creates or gets an existing property type in the graph.
     *
     * If property type does not exists in the graph yet, it will be created
     * and the data for it will be requested for it from the data provider.
     */
    createPropertyType(propertyIri: PropertyTypeIri): PropertyType {
        const existing = this.dataGraph.getPropertyType(propertyIri);
        if (existing) {
            return existing;
        }
        const property = new PropertyType({id: propertyIri});
        this.dataGraph.addPropertyType(property);
        this.fetcher.fetchPropertyType(property);
        return property;
    }

    /**
     * Groups multiple entity elements into an entity group element.
     *
     * Specified entity elements are removed from the diagram and
     * a single entity group element with these entities is created
     * at the center of the bounding box between them.
     *
     * Relation links from/to specified elements are re-grouped to
     * form relation group links the same way.
     *
     * The operation puts a command to the {@link DiagramModel.history command history}.
     *
     * @see {@link ungroupAll}
     * @see {@link ungroupSome}
     */
    group(entities: ReadonlyArray<EntityElement>): EntityGroup {
        const batch = this.history.startBatch({
            titleKey: 'data_diagram_model.group_entities.command',
        });

        const entityIds = new Set<ElementIri>();
        for (const entity of entities) {
            entityIds.add(entity.data.id);
        }

        const items: EntityGroupItem[] = [];
        const links = new Set<Link>();

        for (const entity of entities) {
            items.push({
                data: entity.data,
                elementState: entity.elementState,
            });

            for (const link of this.getElementLinks(entity)) {
                links.add(link);
            }
        }

        for (const link of links) {
            this.removeLink(link.id);
        }

        // Remove entities only after collecting links for each
        // otherwise some links might get removed before
        for (const entity of entities) {
            this.removeElement(entity.id);
        }
        
        const box = getContentFittingBox(entities, [], {
            getElementSize: () => undefined,
        });
        const group = new EntityGroup({
            items,
            position: Rect.center(box),
        });

        this.addElement(group);
        this.recreateLinks(links);

        batch.store();
        return group;
    }

    /**
     * Ungroups one or many entity group elements into all contained entity elements.
     *
     * Specified entity group elements are removed from the diagram and
     * all contained entity elements are created at the same position as
     * the owner group.
     *
     * Relation links from/to ungrouped entities are re-grouped to
     * form relation group links the same way.
     *
     * The operation puts a command to the {@link DiagramModel.history command history}.
     *
     * @see {@link group}
     * @see {@link ungroupSome}
     */
    ungroupAll(groups: ReadonlyArray<EntityGroup>): EntityElement[] {
        const batch = this.history.startBatch({
            titleKey: 'data_diagram_model.ungroup_entities.command',
        });

        const ungrouped: EntityElement[] = [];
        const links = new Set<Link>();

        for (const group of groups) {
            for (const link of this.getElementLinks(group)) {
                links.add(link);
            }

            this.removeElement(group.id);

            for (const item of group.items) {
                const entity = new EntityElement({
                    data: item.data,
                    position: group.position,
                });
                this.addElement(entity);
                ungrouped.push(entity);
            }
        }

        // Restore links only after all elements of a group has been
        // added to ensure both source and target of a link exists
        this.recreateLinks(links);

        batch.store();
        return ungrouped;
    }

    /**
     * Ungroups some entities from an entity group element.
     *
     * Specified entity group is modified to remove target entities
     * and re-create them at the same position as the group.
     * If only one or less entities are left in the group,
     * the group will be completely ungrouped instead.
     *
     * Relation links from/to ungrouped entities are re-grouped to
     * form relation group links the same way.
     *
     * The operation puts a command to the {@link DiagramModel.history command history}.
     *
     * @see {@link group}
     * @see {@link ungroupAll}
     */
    ungroupSome(group: EntityGroup, entities: ReadonlySet<ElementIri>): EntityElement[] {
        const leftGrouped = group.items.filter(item => !entities.has(item.data.id));
        if (leftGrouped.length <= 1) {
            return this.ungroupAll([group]);
        }

        const batch = this.history.startBatch({
            titleKey: 'data_diagram_model.ungroup_entities.command',
        });

        const links = new Set<Link>();
        for (const link of this.getElementLinks(group)) {
            if (link instanceof RelationLink) {
                if (entities.has(link.data.sourceId) || entities.has(link.data.targetId)) {
                    links.add(link);
                }
            } else if (link instanceof RelationGroup) {
                if (link.items.some(item => entities.has(item.data.sourceId) || entities.has(item.data.targetId))) {
                    links.add(link);
                }
            }
        }

        for (const link of links) {
            this.removeLink(link.id);
        }

        const ungroupedElements: EntityElement[] = [];
        for (const item of group.items) {
            if (entities.has(item.data.id)) {
                const entity = new EntityElement({
                    data: item.data,
                    position: group.position,
                });
                this.addElement(entity);
                ungroupedElements.push(entity);
            }
        }

        batch.history.execute(setEntityGroupItems(group, leftGrouped));

        this.recreateLinks(links);

        batch.store();
        return ungroupedElements;
    }

    /**
     * Re-creates a set of relations or relation groups to automatically
     * group relations with the same link type connected to entity groups.
     *
     * The operation puts a command to the {@link DiagramModel.history command history}.
     */
    regroupLinks(links: ReadonlyArray<RelationLink | RelationGroup>): void {
        const batch = this.history.startBatch({
            titleKey: 'data_diagram_model.regroup_relations.command',
        });

        for (const link of links) {
            this.removeLink(link.id);
        }

        this.recreateLinks(new Set(links));

        batch.store();
    }

    private recreateLinks(links: ReadonlySet<Link>): void {
        for (const link of links) {
            if (link instanceof RelationLink) {
                for (const created of this.createLinks(link.data)) {
                    if (created instanceof RelationLink) {
                        this.history.execute(setLinkState(created, link.linkState));
                    }
                }
            } else if (link instanceof RelationGroup) {
                for (const {data} of link.items) {
                    this.createLinks(data);
                }
            }
        }
    }
}

/**
 * Options for {@link DataDiagramModel.requestLinks}.
 *
 * @see {@link DataDiagramModel.requestLinks}
 * @see {@link restoreLinksBetweenElements}
 */
export interface RequestLinksOptions {
    /**
     * If specified, skips fetching links between existing elements on the diagram
     * and only adds links between all elements and the specified set.
     *
     * It is recommended to specify this set if possible to allow incremental
     * link loading (avoid fetching already added links).
     */
    addedElements?: ReadonlyArray<ElementIri>;
    /**
     * If specified, instructs the data provider to only return links with one
     * of the specified types.
     */
    linkTypes?: ReadonlyArray<LinkTypeIri>;
}

export interface DataGraphLocaleFormatter extends LocaleFormatter {
    /**
     * Formats an array of element types into a sorted labels
     * to display in the UI.
     */
    formatElementTypes(
        types: ReadonlyArray<ElementTypeIri>,
        language?: string
    ): string[];

    /**
     * Formats a map of property values into a sorted list with labels
     * to display in the UI.
     */
    formatPropertyList(
        properties: { readonly [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> },
        language?: string
    ): FormattedProperty[];
}

class ExtendedLocaleFormatter extends DiagramLocaleFormatter implements DataGraphLocaleFormatter {
    declare protected model: DataDiagramModel;

    constructor(
        model: DataDiagramModel,
        selectLabelLanguage: LabelLanguageSelector
    ) {
        super(model, selectLabelLanguage);
    }

    formatElementTypes(
        types: ReadonlyArray<ElementTypeIri>,
        language?: string
    ): string[] {
        return types.map(typeId => {
            const type = this.model.getElementType(typeId);
            return this.formatLabel(type?.data?.label, typeId, language);
        }).sort();
    }

    formatPropertyList(
        properties: { readonly [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> },
        language?: string
    ): FormattedProperty[] {
        const targetLanguage = language ?? this.model.language;
        const propertyIris = Object.keys(properties) as PropertyTypeIri[];
        const propertyList = propertyIris.map((key): FormattedProperty => {
            const property = this.model.getPropertyType(key);
            const label = this.formatLabel(property?.data?.label, key);
            const allValues = properties[key];
            const localizedValues = allValues.filter(v =>
                v.termType === 'NamedNode' ||
                v.language === '' ||
                v.language === targetLanguage
            );
            return {
                propertyId: key,
                label,
                values: localizedValues.length === 0 ? allValues : localizedValues,
            };
        });
        propertyList.sort((a, b) => a.label.localeCompare(b.label));
        return propertyList;
    }
}

/**
 * Command effect to request data for the specified entity elements on the diagram
 * from a data provider.
 * 
 * @category Commands
 * @see {@link DataDiagramModel.requestElementData}
 */
export function requestElementData(model: DataDiagramModel, elementIris: ReadonlyArray<ElementIri>): Command {
    return Command.effect({titleKey: 'data_diagram_model.request_entities.command'}, () => {
        model.requestElementData(elementIris);
    });
}

/**
 * Command effect to request links between elements on the diagram
 * from a data provider.
 *
 * @category Commands
 * @see {@link DataDiagramModel.requestLinks}
 */
export function restoreLinksBetweenElements(
    model: DataDiagramModel,
    options: RequestLinksOptions = {}
): Command {
    return Command.effect({titleKey: 'data_diagram_model.request_relations.command'}, () => {
        model.requestLinks(options);
    });
}
