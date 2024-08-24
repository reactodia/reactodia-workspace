import { AbortScope } from '../coreUtils/async';
import { AnyEvent, EventSource, Events } from '../coreUtils/events';

import {
    ElementIri, ElementModel, ElementTypeIri, LinkModel, LinkTypeModel,
    LinkTypeIri, PropertyTypeIri, equalLinks,
} from '../data/model';
import { EmptyDataProvider } from '../data/decorated/emptyDataProvider';
import { DataProvider } from '../data/provider';
import * as Rdf from '../data/rdf/rdfModel';
import { PLACEHOLDER_LINK_TYPE, TemplateProperties } from '../data/schema';

import { setLinkState } from '../diagram/commands';
import { LabelLanguageSelector, FormattedProperty } from '../diagram/customization';
import { Link, LinkTemplateState, LinkTypeVisibility } from '../diagram/elements';
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
import { DataFetcher, ChangeOperationsEvent, FetchOperation } from './dataFetcher';
import {
    SerializedLayout, SerializedLinkOptions, SerializedDiagram, emptyDiagram, emptyLayoutData,
    makeSerializedLayout, makeSerializedDiagram, 
} from './serializedDiagram';
import { DataGraph } from './dataGraph';

export interface DataDiagramModelEvents extends DiagramModelEvents {
    elementTypeEvent: AnyEvent<ElementTypeEvents>;
    linkTypeEvent: AnyEvent<LinkTypeEvents>;
    propertyTypeEvent: AnyEvent<PropertyTypeEvents>;

    loadingStart: { source: DataDiagramModel };
    loadingSuccess: { source: DataDiagramModel };
    loadingError: {
        source: DataDiagramModel;
        error: unknown;
    };

    changeOperations: ChangeOperationsEvent;
    createLoadedLink: {
        source: DataDiagramModel;
        model: LinkModel;
        cancel(): void;
    };
}

export interface DataGraphStructure extends GraphStructure {
    getElementType(elementTypeIri: ElementTypeIri): ElementType | undefined;
    getLinkType(linkTypeIri: LinkTypeIri): LinkType | undefined;
    getPropertyType(propertyTypeIri: PropertyTypeIri): PropertyType | undefined;
}

export interface DataDiagramModelOptions extends DiagramModelOptions {}

export class DataDiagramModel extends DiagramModel implements DataGraphStructure {
    declare readonly events: Events<DataDiagramModelEvents>;
    declare readonly locale: EntityLocaleFormatter;

    private dataGraph = new DataGraph();
    private loadingScope: AbortScope | undefined;
    private _dataProvider: DataProvider;
    private fetcher: DataFetcher;

    constructor(options: DataDiagramModelOptions) {
        super(options);
        this._dataProvider = new EmptyDataProvider();
        this.fetcher = new DataFetcher(this.graph, this.dataGraph, this._dataProvider);
    }

    protected override createLocale(selectLabelLanguage: LabelLanguageSelector): this['locale'] {
        return new ExtendedLocaleFormatter(this, selectLabelLanguage);
    }

    private get extendedSource(): EventSource<DataDiagramModelEvents> {
        return this.source as EventSource<any>;
    }    

    get dataProvider() { return this._dataProvider; }

    protected getTermFactory(): Rdf.DataFactory {
        return this._dataProvider.factory;
    }

    get operations(): ReadonlyArray<FetchOperation> {
        return this.fetcher.operations;
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

    async createNewDiagram(params: {
        dataProvider: DataProvider;
        signal?: AbortSignal;
    }): Promise<void> {
        const {dataProvider, signal} = params;
        return this.importLayout({dataProvider, signal});
    }

    async importLayout(params: {
        dataProvider: DataProvider;
        diagram?: SerializedDiagram;
        preloadedElements?: ReadonlyMap<ElementIri, ElementModel>;
        validateLinks?: boolean;
        hideUnusedLinkTypes?: boolean;
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
            const linkTypes = await this.dataProvider.knownLinkTypes({signal});
            const knownLinkTypes = this.initLinkTypes(linkTypes);
            signal.throwIfAborted();

            this.setLinkSettings(diagram.linkTypeOptions ?? []);

            this.createGraphElements({
                layoutData: diagram.layoutData,
                preloadedElements,
                markLinksAsLayoutOnly: validateLinks,
            });

            if (hideUnusedLinkTypes) {
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
                ? this.requestLinksOfType() : Promise.resolve();

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

    discardLayout(): void {
        this.resetGraph();
        this.setDataProvider(new EmptyDataProvider());
        this.extendedSource.trigger('loadingStart', {source: this});
        this.subscribeGraph();
        this.history.reset();
        this.extendedSource.trigger('loadingSuccess', {source: this});
    }

    exportLayout(): SerializedDiagram {
        const layoutData = makeSerializedLayout(this.graph.getElements(), this.graph.getLinks());
        const knownLinkTypes = new Set(this.graph.getLinks().map(link => link.typeId));
        const linkTypeOptions: SerializedLinkOptions[] = [];
        for (const linkTypeIri of knownLinkTypes) {
            const visibility = this.getLinkVisibility(linkTypeIri);
            // do not serialize default link type options
            if  (visibility !== 'visible' && linkTypeIri !== PLACEHOLDER_LINK_TYPE) {
                linkTypeOptions.push({
                    '@type': 'LinkTypeOptions',
                    property: linkTypeIri,
                    visible: visibility !== 'hidden',
                    showLabel: visibility !== 'withoutLabel',
                });
            }
        }
        return makeSerializedDiagram({layoutData, linkTypeOptions});
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
        layoutData?: SerializedLayout;
        preloadedElements?: ReadonlyMap<ElementIri, ElementModel>;
        markLinksAsLayoutOnly: boolean;
    }): void {
        const {
            layoutData = emptyLayoutData(),
            preloadedElements,
            markLinksAsLayoutOnly,
        } = params;

        const elementIrisToRequestData: ElementIri[] = [];
        const usedLinkTypes = new Set<LinkTypeIri>();

        const batch = this.history.startBatch('Import layout');

        for (const layoutElement of layoutData.elements) {
            switch (layoutElement['@type']) {
                case 'Element': {
                    const {'@id': id, iri, position, isExpanded, elementState} = layoutElement;
                    if (iri) {
                        const preloadedData = preloadedElements?.get(iri);
                        const data = preloadedData ?? EntityElement.placeholderData(iri);
                        const element = new EntityElement({id, data, position, expanded: isExpanded, elementState});
                        this.graph.addElement(element);
                        if (!preloadedData) {
                            elementIrisToRequestData.push(element.iri);
                        }
                    }
                    break;
                }
                case 'Group': {
                    const {'@id': id, items, position, elementState} = layoutElement;
                    const groupItems: EntityGroupItem[] = [];
                    for (const item of items) {
                        const preloadedData = preloadedElements?.get(item.iri);
                        groupItems.push({
                            data: preloadedData ?? EntityElement.placeholderData(item.iri),
                            elementState: item.elementState,
                        });
                        if (!preloadedData) {
                            elementIrisToRequestData.push(item.iri);
                        }
                    }
                    const group = new EntityGroup({id, items: groupItems, position, elementState});
                    this.graph.addElement(group);
                    break;
                }
            }
            
        }

        for (const layoutLink of layoutData.links) {
            const {'@id': id, property, source, target, vertices, linkState} = layoutLink;
            const linkType = this.createLinkType(property);
            usedLinkTypes.add(linkType.id);
            
            const sourceElement = this.graph.getElement(source['@id']);
            const targetElement = this.graph.getElement(target['@id']);

            const sourceIri = layoutLink.sourceIri ?? (
                sourceElement instanceof EntityElement ? sourceElement.data.id : undefined
            );
            const targetIri = layoutLink.targetIri ?? (
                targetElement instanceof EntityElement ? targetElement.data.id : undefined
            );

            if (sourceElement && targetElement && sourceIri && targetIri) {
                const data: LinkModel = {
                    linkTypeId: property,
                    sourceId: sourceIri,
                    targetId: targetIri,
                    properties: {},
                };
                const link = new RelationLink({
                    id,
                    sourceId: sourceElement.id,
                    targetId: targetElement.id,
                    data,
                    vertices,
                    linkState,
                });
                if (markLinksAsLayoutOnly) {
                    link.setLinkState({
                        ...link.linkState,
                        [TemplateProperties.LayoutOnly]: true,
                    });
                }
                this.addLink(link);
            }
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

    requestElementData(elementIris: ReadonlyArray<ElementIri>): Promise<void> {
        return this.fetcher.fetchElementData(elementIris);
    }

    requestLinksOfType(linkTypeIds?: ReadonlyArray<LinkTypeIri>): Promise<void> {
        const elementIris: ElementIri[] = [];
        for (const element of this.graph.getElements()) {
            for (const entity of iterateEntitiesOf(element)) {
                elementIris.push(entity.id);
            }
        }
        if (elementIris.length === 0) {
            return Promise.resolve();
        }
        return this.fetcher
            .fetchLinks(elementIris, linkTypeIds)
            .then(links => this.onLinkInfoLoaded(links));
    }

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
        this.createLinkType(link.typeId);
        super.addLink(link);
    }

    private onLinkInfoLoaded(links: LinkModel[]) {
        let allowToCreate: boolean;
        const cancel = () => { allowToCreate = false; };

        const batch = this.history.startBatch('Create loaded links');
        for (const linkModel of links) {
            this.createLinkType(linkModel.linkTypeId);
            allowToCreate = true;
            this.extendedSource.trigger('createLoadedLink', {source: this, model: linkModel, cancel});
            if (allowToCreate) {
                this.createLinks(linkModel);
            }
        }
        batch.discard();
    }

    createLinks(data: LinkModel): Array<RelationLink | RelationGroup> {
        const sources = this.graph.getElements().filter((el): el is EntityElement | EntityGroup =>
            el instanceof EntityElement && el.iri === data.sourceId ||
            el instanceof EntityGroup && el.itemIris.has(data.sourceId)
        );
        const targets = this.graph.getElements().filter((el): el is EntityElement | EntityGroup =>
            el instanceof EntityElement && el.iri === data.targetId ||
            el instanceof EntityGroup && el.itemIris.has(data.targetId)
        );
        const batch = this.history.startBatch('Create links');
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
                this.history.execute(setLinkState(link, omitLayoutOnly(link.linkState)));
                this.history.execute(setRelationLinkData(link, data));
                return link;
            } else if (link instanceof RelationGroup && link.itemKeys.has(data)) {
                const items = link.items.map((item): RelationGroupItem => equalLinks(item.data, data)
                    ? {...item, data, linkState: omitLayoutOnly(item.linkState)}
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

    group(entities: ReadonlyArray<EntityElement>): EntityGroup {
        const batch = this.history.startBatch('Group entities');

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

    ungroupAll(groups: ReadonlyArray<EntityGroup>): EntityElement[] {
        const batch = this.history.startBatch('Ungroup entities');

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

    ungroupSome(group: EntityGroup, entities: ReadonlySet<ElementIri>): EntityElement[] {
        const leftGrouped = group.items.filter(item => !entities.has(item.data.id));
        if (leftGrouped.length <= 1) {
            return this.ungroupAll([group]);
        }

        const batch = this.history.startBatch('Ungroup entities');

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

export interface EntityLocaleFormatter extends LocaleFormatter {
    formatElementTypes(
        types: ReadonlyArray<ElementTypeIri>,
        language?: string
    ): string[];

    formatPropertyList(
        properties: { readonly [id: string]: ReadonlyArray<Rdf.NamedNode | Rdf.Literal> },
        language?: string
    ): FormattedProperty[];
}

class ExtendedLocaleFormatter extends DiagramLocaleFormatter implements EntityLocaleFormatter {
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

export function requestElementData(model: DataDiagramModel, elementIris: ReadonlyArray<ElementIri>): Command {
    return Command.effect('Fetch element data', () => {
        model.requestElementData(elementIris);
    });
}

export function restoreLinksBetweenElements(model: DataDiagramModel): Command {
    return Command.effect('Restore links between elements', () => {
        model.requestLinksOfType();
    });
}

function omitLayoutOnly(linkState: LinkTemplateState | undefined): LinkTemplateState | undefined {
    if (linkState && Object.prototype.hasOwnProperty.call(linkState, TemplateProperties.LayoutOnly)) {
        const {
            [TemplateProperties.LayoutOnly]: layoutOnly,
            ...withoutLayoutOnly
        } = linkState;
        return withoutLayoutOnly;
    }
    return linkState;
}
