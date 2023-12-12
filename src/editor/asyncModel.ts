import { EventSource, Events } from '../coreUtils/events';

import {
    ElementModel, LinkModel, LinkType,
    ElementIri, LinkTypeIri, ElementTypeIri, PropertyTypeIri,
} from '../data/model';
import { DataProvider } from '../data/provider';
import { DataFactory } from '../data/rdf/rdfModel';
import { PLACEHOLDER_LINK_TYPE } from '../data/schema';

import {
    Element, RichLinkType, RichElementType, RichProperty, Link, LinkTypeVisibility,
} from '../diagram/elements';
import { Command } from '../diagram/history';
import { DiagramModel, DiagramModelEvents, DiagramModelOptions } from '../diagram/model';

import { DataFetcher, ChangeOperationsEvent, FetchOperation } from './dataFetcher';
import {
    LayoutData, LinkTypeOptions, SerializedDiagram, emptyDiagram, emptyLayoutData,
    makeLayoutData, makeSerializedDiagram, 
} from './serializedDiagram';

export interface GroupBy {
    linkType: string;
    linkDirection: 'in' | 'out';
}

export interface AsyncModelEvents extends DiagramModelEvents {
    loadingStart: { source: AsyncModel };
    loadingSuccess: { source: AsyncModel };
    loadingError: {
        source: AsyncModel;
        error: unknown;
    };
    changeOperations: ChangeOperationsEvent;
    createLoadedLink: {
        source: AsyncModel;
        model: LinkModel;
        cancel(): void;
    };
}

export interface AsyncModelOptions extends DiagramModelOptions {
    groupBy: ReadonlyArray<GroupBy>;
}

export class AsyncModel extends DiagramModel {
    declare readonly events: Events<AsyncModelEvents>;

    private readonly groupByProperties: ReadonlyArray<GroupBy>;

    private _dataProvider!: DataProvider;
    private fetcher: DataFetcher | undefined;
    private readonly EMPTY_OPERATIONS: ReadonlyArray<FetchOperation> = [];

    private linkSettings = new Map<LinkTypeIri, LinkTypeVisibility>();

    constructor(options: AsyncModelOptions) {
        super(options);
        const {groupBy} = options;
        this.groupByProperties = groupBy;
    }

    private get asyncSource(): EventSource<AsyncModelEvents> {
        return this.source as EventSource<any>;
    }

    get dataProvider() { return this._dataProvider; }

    protected getTermFactory(): DataFactory {
        return this._dataProvider.factory;
    }

    get operations(): ReadonlyArray<FetchOperation> {
        return this.fetcher ? this.fetcher.operations : this.EMPTY_OPERATIONS;
    }

    resetGraph(): void {
        super.resetGraph();
        this.fetcher?.dispose();
        this.linkSettings.clear();
    }

    subscribeGraph() {
        super.subscribeGraph();
        this.graphListener.listen(this.events, 'elementEvent', e => {
            if (e.data.requestedGroupContent) {
                this.loadGroupContent(e.data.requestedGroupContent.source)
                    .catch(err => {
                        if (!this.fetcher!.signal.aborted) {
                            throw new Error('Error loading group content', {cause: err});
                        }
                    });
            }
        });
    }

    private setDataProvider(dataProvider: DataProvider) {
        this._dataProvider = dataProvider;
        this.fetcher = new DataFetcher(this.graph, dataProvider);
        this.graphListener.listen(this.fetcher.events, 'changeOperations', e => {
            this.asyncSource.trigger('changeOperations', e);
        });
    }

    createNewDiagram(params: {
        dataProvider: DataProvider;
        signal?: AbortSignal;
    }): Promise<void> {
        const {dataProvider, signal} = params;
        this.resetGraph();
        this.setDataProvider(dataProvider);
        this.asyncSource.trigger('loadingStart', {source: this});

        return this.dataProvider.knownLinkTypes({signal}).then(linkTypes => {
            const allLinkTypes = this.initLinkTypes(linkTypes);
            return this.loadAndRenderLayout({
                allLinkTypes,
                markLinksAsLayoutOnly: false,
                signal,
            });
        }).then(() => {
            this.history.reset();
            this.asyncSource.trigger('loadingSuccess', {source: this});
        }).catch(error => {
            console.error(error);
            this.asyncSource.trigger('loadingError', {source: this, error});
            return Promise.reject(error);
        });
    }

    importLayout(params: {
        dataProvider: DataProvider;
        preloadedElements?: ReadonlyMap<ElementIri, ElementModel>;
        validateLinks?: boolean;
        diagram?: SerializedDiagram;
        hideUnusedLinkTypes?: boolean;
        signal?: AbortSignal;
    }): Promise<void> {
        const {dataProvider, signal} = params;
        this.resetGraph();
        this.setDataProvider(dataProvider);
        this.asyncSource.trigger('loadingStart', {source: this});

        return this.dataProvider.knownLinkTypes({signal}).then(linkTypes => {
            const allLinkTypes = this.initLinkTypes(linkTypes);
            const diagram = params.diagram ? params.diagram : emptyDiagram();
            this.setLinkSettings(diagram.linkTypeOptions ?? []);
            const loadingModels = this.loadAndRenderLayout({
                layoutData: diagram.layoutData,
                preloadedElements: params.preloadedElements,
                markLinksAsLayoutOnly: params.validateLinks || false,
                allLinkTypes,
                hideUnusedLinkTypes: params.hideUnusedLinkTypes,
                signal,
            });
            const requestingLinks = params.validateLinks
                ? this.requestLinksOfType() : Promise.resolve();
            return Promise.all([loadingModels, requestingLinks]);
        }).then(() => {
            this.history.reset();
            this.asyncSource.trigger('loadingSuccess', {source: this});
        }).catch(error => {
            console.error(error);
            this.asyncSource.trigger('loadingError', {source: this, error});
            return Promise.reject(error);
        });
    }

    exportLayout(): SerializedDiagram {
        const layoutData = makeLayoutData(this.graph.getElements(), this.graph.getLinks());
        const linkTypeOptions = this.graph.getLinkTypes()
            // do not serialize default link type options
            .filter(linkType => (
                linkType.visibility !== 'visible' &&
                linkType.id !== PLACEHOLDER_LINK_TYPE
            ))
            .map(({id, visibility}): LinkTypeOptions => ({
                '@type': 'LinkTypeOptions',
                property: id,
                visible: visibility !== 'hidden',
                showLabel: visibility === 'visible',
            }));
        return makeSerializedDiagram({layoutData, linkTypeOptions});
    }

    private initLinkTypes(linkTypes: LinkType[]): RichLinkType[] {
        const types: RichLinkType[] = [];
        for (const {id, label} of linkTypes) {
            const linkType = new RichLinkType({id, label});
            this.graph.addLinkType(linkType);
            types.push(linkType);
        }
        return types;
    }

    private setLinkSettings(settings: ReadonlyArray<LinkTypeOptions>) {
        for (const setting of settings) {
            const {visible = true, showLabel = true} = setting;
            const linkTypeId = setting.property as LinkTypeIri;
            const visibility: LinkTypeVisibility = (
                visible && showLabel ? 'visible' :
                visible && !showLabel ? 'withoutLabel' :
                'hidden'
            );
            this.linkSettings.set(linkTypeId, visibility);
            const linkType = this.getLinkType(linkTypeId);
            if (linkType) {
                linkType.setVisibility(visibility);
            }
        }
    }

    private loadAndRenderLayout(params: {
        layoutData?: LayoutData;
        preloadedElements?: ReadonlyMap<ElementIri, ElementModel>;
        markLinksAsLayoutOnly: boolean;
        allLinkTypes: ReadonlyArray<RichLinkType>;
        hideUnusedLinkTypes?: boolean;
        signal?: AbortSignal;
    }): Promise<void> {
        const {
            layoutData = emptyLayoutData(),
            preloadedElements,
            markLinksAsLayoutOnly,
            hideUnusedLinkTypes,
        } = params;

        const elementIrisToRequestData: ElementIri[] = [];
        const usedLinkTypes = new Set<LinkTypeIri>();

        const batch = this.history.startBatch('Import layout');

        for (const layoutElement of layoutData.elements) {
            const {'@id': id, iri, position, isExpanded, group, elementState} = layoutElement;
            const template = preloadedElements?.get(iri);
            const data = template ?? Element.placeholderData(iri);
            const element = new Element({id, data, position, expanded: isExpanded, group, elementState});
            this.graph.addElement(element);
            if (!template) {
                elementIrisToRequestData.push(element.iri);
            }
        }

        for (const layoutLink of layoutData.links) {
            const {'@id': id, property, source, target, vertices, linkState} = layoutLink;
            const linkType = this.createLinkType(property);
            usedLinkTypes.add(linkType.id);
            const sourceElement = this.graph.getElement(source['@id']);
            const targetElement = this.graph.getElement(target['@id']);
            if (sourceElement && targetElement) {
                const data: LinkModel = {
                    linkTypeId: property,
                    sourceId: sourceElement.iri,
                    targetId: targetElement.iri,
                    properties: {},
                };
                const link = new Link({
                    id,
                    sourceId: sourceElement.id,
                    targetId: targetElement.id,
                    data,
                    vertices,
                    linkState,
                });
                link.setLayoutOnly(markLinksAsLayoutOnly);
                this.addLink(link);
            }
        }

        batch.store();
        this.subscribeGraph();
        const requestingModels = this.requestElementData(elementIrisToRequestData);

        if (hideUnusedLinkTypes && params.allLinkTypes) {
            this.hideUnusedLinkTypes(params.allLinkTypes, usedLinkTypes);
        }

        return requestingModels;
    }

    private hideUnusedLinkTypes(
        allTypes: ReadonlyArray<RichLinkType>,
        usedTypes: ReadonlySet<LinkTypeIri>
    ) {
        for (const linkType of allTypes) {
            if (!usedTypes.has(linkType.id)) {
                linkType.setVisibility('hidden');
            }
        }
    }

    requestElementData(elementIris: ReadonlyArray<ElementIri>): Promise<void> {
        return this.fetcher!.fetchElementData(elementIris);
    }

    requestLinksOfType(linkTypeIds?: ReadonlyArray<LinkTypeIri>): Promise<void> {
        const elementIris = this.graph.getElements().map(element => element.iri);
        if (elementIris.length === 0) {
            return Promise.resolve();
        }
        return this.fetcher!
            .fetchLinks(elementIris, linkTypeIds)
            .then(links => this.onLinkInfoLoaded(links));
    }

    createElementType(elementTypeIri: ElementTypeIri): RichElementType {
        const existing = super.getElementType(elementTypeIri);
        if (existing) {
            return existing;
        }
        const classModel = super.createElementType(elementTypeIri);
        this.fetcher!.fetchElementType(classModel);
        return classModel;
    }

    createLinkType(linkTypeId: LinkTypeIri): RichLinkType {
        if (this.graph.getLinkType(linkTypeId)) {
            return super.createLinkType(linkTypeId);
        }
        const linkType = super.createLinkType(linkTypeId);
        const visibility = this.linkSettings.get(linkType.id);
        if (visibility) {
            linkType.setVisibility(visibility);
        }
        this.fetcher!.fetchLinkType(linkType);
        return linkType;
    }

    createProperty(propertyIri: PropertyTypeIri): RichProperty {
        if (this.graph.getProperty(propertyIri)) {
            return super.createProperty(propertyIri);
        }
        const property = super.createProperty(propertyIri);
        this.fetcher!.fetchPropertyType(property);
        return property;
    }

    private onLinkInfoLoaded(links: LinkModel[]) {
        let allowToCreate: boolean;
        const cancel = () => { allowToCreate = false; };

        const batch = this.history.startBatch('Create loaded links');
        for (const linkModel of links) {
            this.createLinkType(linkModel.linkTypeId);
            allowToCreate = true;
            this.asyncSource.trigger('createLoadedLink', {source: this, model: linkModel, cancel});
            if (allowToCreate) {
                this.createLinks(linkModel);
            }
        }
        batch.discard();
    }

    createLinks(data: LinkModel) {
        const sources = this.graph.getElements().filter(el => el.iri === data.sourceId);
        const targets = this.graph.getElements().filter(el => el.iri === data.targetId);
        const batch = this.history.startBatch('Create links');
        for (const source of sources) {
            for (const target of targets) {
                this.createLink(new Link({sourceId: source.id, targetId: target.id, data}));
            }
        }
        batch.store();
    }

    private async loadGroupContent(element: Element): Promise<void> {
        const models = await this.loadEmbeddedElements(element.iri);
        const batch = this.history.startBatch();
        for (const model of models.values()) {
            this.createElement(model, element.id);
        }
        batch.discard();

        await Promise.all([
            this.requestElementData(Array.from(models.keys())),
            this.requestLinksOfType(),
        ]);
        this.fetcher!.signal.throwIfAborted();

        this._triggerChangeGroupContent(element.id, {layoutComplete: false});
    }

    private async loadEmbeddedElements(elementIri: ElementIri): Promise<Map<ElementIri, ElementModel>> {
        const elements = this.groupByProperties.map(groupBy =>
            this.dataProvider.lookup({
                refElementId: elementIri,
                refElementLinkId: groupBy.linkType as LinkTypeIri,
                linkDirection: groupBy.linkDirection,
                signal: this.fetcher!.signal,
            })
        );
        const results = await Promise.all(elements);
        const nestedModels = new Map<ElementIri, ElementModel>();
        for (const result of results) {
            for (const {element} of result) {
                nestedModels.set(element.id, element);
            }
        }
        return nestedModels;
    }
}

export function requestElementData(model: AsyncModel, elementIris: ReadonlyArray<ElementIri>): Command {
    return Command.effect('Fetch element data', () => {
        model.requestElementData(elementIris);
    });
}

export function restoreLinksBetweenElements(model: AsyncModel): Command {
    return Command.effect('Restore links between elements', () => {
        model.requestLinksOfType();
    });
}
