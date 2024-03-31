import { AbortScope } from '../coreUtils/async';
import { EventSource, Events } from '../coreUtils/events';

import {
    ElementModel, LinkModel, LinkTypeModel,
    ElementIri, LinkTypeIri, ElementTypeIri, PropertyTypeIri,
} from '../data/model';
import { EmptyDataProvider } from '../data/decorated/emptyDataProvider';
import { DataProvider } from '../data/provider';
import { DataFactory } from '../data/rdf/rdfModel';
import { PLACEHOLDER_LINK_TYPE } from '../data/schema';

import {
    Element, LinkType, ElementType, PropertyType, Link, LinkTypeVisibility,
} from '../diagram/elements';
import { Command } from '../diagram/history';
import { DiagramModel, DiagramModelEvents, DiagramModelOptions } from '../diagram/model';

import { DataFetcher, ChangeOperationsEvent, FetchOperation } from './dataFetcher';
import {
    SerializedLayout, SerializedLinkOptions, SerializedDiagram, emptyDiagram, emptyLayoutData,
    makeSerializedLayout, makeSerializedDiagram, 
} from './serializedDiagram';

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

export interface AsyncModelOptions extends DiagramModelOptions {}

export class AsyncModel extends DiagramModel {
    declare readonly events: Events<AsyncModelEvents>;

    private loadingScope: AbortScope | undefined;
    private _dataProvider: DataProvider;
    private fetcher: DataFetcher;

    private linkSettings = new Map<LinkTypeIri, LinkTypeVisibility>();

    constructor(options: AsyncModelOptions) {
        super(options);
        this._dataProvider = new EmptyDataProvider();
        this.fetcher = new DataFetcher(this.graph, this._dataProvider);
    }

    private get asyncSource(): EventSource<AsyncModelEvents> {
        return this.source as EventSource<any>;
    }

    get dataProvider() { return this._dataProvider; }

    protected getTermFactory(): DataFactory {
        return this._dataProvider.factory;
    }

    get operations(): ReadonlyArray<FetchOperation> {
        return this.fetcher.operations;
    }

    protected override resetGraph(): void {
        super.resetGraph();
        this.loadingScope?.abort();
        this.fetcher.dispose();
        this.linkSettings.clear();
    }

    protected override subscribeGraph() {
        super.subscribeGraph();
    }

    private setDataProvider(dataProvider: DataProvider) {
        this._dataProvider = dataProvider;
        this.fetcher = new DataFetcher(this.graph, dataProvider);
        this.graphListener.listen(this.fetcher.events, 'changeOperations', e => {
            this.asyncSource.trigger('changeOperations', e);
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
        this.asyncSource.trigger('loadingStart', {source: this});
        const signal = this.loadingScope.signal;

        try {
            const linkTypes = await this.dataProvider.knownLinkTypes({signal});
            this.initLinkTypes(linkTypes);
            signal.throwIfAborted();

            this.setLinkSettings(diagram.linkTypeOptions ?? []);

            this.createGraphElements({
                layoutData: diagram.layoutData,
                preloadedElements,
                markLinksAsLayoutOnly: validateLinks,
            });

            if (hideUnusedLinkTypes) {
                this.hideUnusedLinkTypes();
            }

            this.subscribeGraph();

            const elementIrisToRequestData = this.graph.getElements()
                .filter(element => !(preloadedElements && preloadedElements.has(element.iri)))
                .map(element => element.iri);

            const requestingModels = this.requestElementData(elementIrisToRequestData);
            const requestingLinks = params.validateLinks
                ? this.requestLinksOfType() : Promise.resolve();

            await Promise.all([requestingModels, requestingLinks]);

            this.history.reset();
            this.asyncSource.trigger('loadingSuccess', {source: this});
        } catch (error) {
            this.asyncSource.trigger('loadingError', {source: this, error});
            throw new Error('Reactodia: failed to import a layout', {cause: error});
        } finally {
            this.loadingScope?.abort();
            this.loadingScope = undefined;
        }
    }

    discardLayout(): void {
        this.linkSettings.clear();
        this.resetGraph();
        this.setDataProvider(new EmptyDataProvider());
        this.asyncSource.trigger('loadingStart', {source: this});
        this.subscribeGraph();
        this.history.reset();
        this.asyncSource.trigger('loadingSuccess', {source: this});
    }

    exportLayout(): SerializedDiagram {
        const layoutData = makeSerializedLayout(this.graph.getElements(), this.graph.getLinks());
        const linkTypeOptions = this.graph.getLinkTypes()
            // do not serialize default link type options
            .filter(linkType => (
                linkType.visibility !== 'visible' &&
                linkType.id !== PLACEHOLDER_LINK_TYPE
            ))
            .map(({id, visibility}): SerializedLinkOptions => ({
                '@type': 'LinkTypeOptions',
                property: id,
                visible: visibility !== 'hidden',
                showLabel: visibility === 'visible',
            }));
        return makeSerializedDiagram({layoutData, linkTypeOptions});
    }

    private initLinkTypes(linkTypes: LinkTypeModel[]): LinkType[] {
        const types: LinkType[] = [];
        for (const {id, label} of linkTypes) {
            const linkType = new LinkType({id, label});
            this.graph.addLinkType(linkType);
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
            this.linkSettings.set(linkTypeId, visibility);
            const linkType = this.getLinkType(linkTypeId);
            if (linkType) {
                linkType.setVisibility(visibility);
            }
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
            const {'@id': id, iri, position, isExpanded, elementState} = layoutElement;
            const template = preloadedElements?.get(iri);
            const data = template ?? Element.placeholderData(iri);
            const element = new Element({id, data, position, expanded: isExpanded, elementState});
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
    }

    private hideUnusedLinkTypes() {
        const usedTypes = new Set<LinkTypeIri>();
        for (const link of this.graph.getLinks()) {
            usedTypes.add(link.typeId);
        }

        for (const linkType of this.graph.getLinkTypes()) {
            if (!usedTypes.has(linkType.id)) {
                linkType.setVisibility('hidden');
            }
        }
    }

    requestElementData(elementIris: ReadonlyArray<ElementIri>): Promise<void> {
        return this.fetcher.fetchElementData(elementIris);
    }

    requestLinksOfType(linkTypeIds?: ReadonlyArray<LinkTypeIri>): Promise<void> {
        const elementIris = this.graph.getElements().map(element => element.iri);
        if (elementIris.length === 0) {
            return Promise.resolve();
        }
        return this.fetcher
            .fetchLinks(elementIris, linkTypeIds)
            .then(links => this.onLinkInfoLoaded(links));
    }

    override createElementType(elementTypeIri: ElementTypeIri): ElementType {
        const existing = super.getElementType(elementTypeIri);
        if (existing) {
            return existing;
        }
        const classModel = super.createElementType(elementTypeIri);
        this.fetcher.fetchElementType(classModel);
        return classModel;
    }

    override createLinkType(linkTypeId: LinkTypeIri): LinkType {
        if (this.graph.getLinkType(linkTypeId)) {
            return super.createLinkType(linkTypeId);
        }
        const linkType = super.createLinkType(linkTypeId);
        const visibility = this.linkSettings.get(linkType.id);
        if (visibility) {
            linkType.setVisibility(visibility);
        }
        this.fetcher.fetchLinkType(linkType);
        return linkType;
    }

    override createPropertyType(propertyIri: PropertyTypeIri): PropertyType {
        if (this.graph.getPropertyType(propertyIri)) {
            return super.createPropertyType(propertyIri);
        }
        const property = super.createPropertyType(propertyIri);
        this.fetcher.fetchPropertyType(property);
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
