import { EventSource, Events } from '../coreUtils/events';

import {
    Dictionary, ElementModel, LinkModel, LinkType,
    ElementIri, LinkTypeIri, ElementTypeIri, PropertyTypeIri,
} from '../data/model';
import { DataProvider } from '../data/provider';
import { DataFactory } from '../data/rdf/rdfModel';
import { PLACEHOLDER_LINK_TYPE } from '../data/schema';

import { Element, FatLinkType, FatClassModel, RichProperty, Link } from '../diagram/elements';
import { CommandHistory, Command } from '../diagram/history';
import { DiagramModel, DiagramModelEvents, placeholderDataFromIri } from '../diagram/model';

import { DataFetcher } from './dataFetcher';
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
        error: any;
    };
    createLoadedLink: {
        source: AsyncModel;
        model: LinkModel;
        cancel(): void;
    };
}

export class AsyncModel extends DiagramModel {
    declare readonly events: Events<AsyncModelEvents>;

    private _dataProvider!: DataProvider;
    private fetcher: DataFetcher | undefined;

    private linkSettings: { [linkTypeId: string]: LinkTypeOptions } = {};

    constructor(
        history: CommandHistory,
        private groupByProperties: ReadonlyArray<GroupBy>,
    ) {
        super(history);
    }

    private get asyncSource(): EventSource<AsyncModelEvents> {
        return this.source as EventSource<any>;
    }

    get dataProvider() { return this._dataProvider; }

    protected getTermFactory(): DataFactory {
        return this._dataProvider.factory;
    }

    resetGraph(): void {
        super.resetGraph();
        this.fetcher?.dispose();
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
    }

    createNewDiagram(params: {
        dataProvider: DataProvider;
        signal?: AbortSignal;
    }): Promise<void> {
        const {dataProvider, signal} = params;
        this.resetGraph();
        this.setDataProvider(dataProvider);
        this.asyncSource.trigger('loadingStart', {source: this});

        return this.dataProvider.linkTypes({signal}).then((linkTypes: LinkType[]) => {
            const allLinkTypes = this.initLinkTypes(linkTypes);
            return this.loadAndRenderLayout({
                allLinkTypes,
                markLinksAsLayoutOnly: false,
                signal,
            });
        }).then(() => {
            this.asyncSource.trigger('loadingSuccess', {source: this});
        }).catch(error => {
            // tslint:disable-next-line:no-console
            console.error(error);
            this.asyncSource.trigger('loadingError', {source: this, error});
            return Promise.reject(error);
        });
    }

    importLayout(params: {
        dataProvider: DataProvider;
        preloadedElements?: Dictionary<ElementModel>;
        validateLinks?: boolean;
        diagram?: SerializedDiagram;
        hideUnusedLinkTypes?: boolean;
        signal?: AbortSignal;
    }): Promise<void> {
        const {dataProvider, signal} = params;
        this.resetGraph();
        this.setDataProvider(dataProvider);
        this.asyncSource.trigger('loadingStart', {source: this});

        return this.dataProvider.linkTypes({signal}).then(linkTypes => {
            const allLinkTypes = this.initLinkTypes(linkTypes);
            const diagram = params.diagram ? params.diagram : emptyDiagram();
            this.setLinkSettings(diagram.linkTypeOptions ?? []);
            const loadingModels = this.loadAndRenderLayout({
                layoutData: diagram.layoutData,
                preloadedElements: params.preloadedElements || {},
                markLinksAsLayoutOnly: params.validateLinks || false,
                allLinkTypes,
                hideUnusedLinkTypes: params.hideUnusedLinkTypes,
                signal,
            });
            const requestingLinks = params.validateLinks
                ? this.requestLinksOfType() : Promise.resolve();
            return Promise.all([loadingModels, requestingLinks]);
        }).then(() => {
            this.asyncSource.trigger('loadingSuccess', {source: this});
        }).catch(error => {
            // tslint:disable-next-line:no-console
            console.error(error);
            this.asyncSource.trigger('loadingError', {source: this, error});
            return Promise.reject(error);
        });
    }

    exportLayout(): SerializedDiagram {
        const layoutData = makeLayoutData(this.graph.getElements(), this.graph.getLinks());
        const linkTypeOptions = this.graph.getLinkTypes()
            // do not serialize default link type options
            .filter(linkType => (!linkType.visible || !linkType.showLabel) && linkType.id !== PLACEHOLDER_LINK_TYPE)
            .map(({id, visible, showLabel}): LinkTypeOptions =>
                ({'@type': 'LinkTypeOptions', property: id, visible, showLabel}));
        return makeSerializedDiagram({layoutData, linkTypeOptions});
    }

    private initLinkTypes(linkTypes: LinkType[]): FatLinkType[] {
        const types: FatLinkType[] = [];
        for (const {id, label} of linkTypes) {
            const linkType = new FatLinkType({id, label});
            this.graph.addLinkType(linkType);
            types.push(linkType);
        }
        return types;
    }

    private setLinkSettings(settings: ReadonlyArray<LinkTypeOptions>) {
        for (const setting of settings) {
            const {visible = true, showLabel = true} = setting;
            const linkTypeId = setting.property as LinkTypeIri;
            this.linkSettings[linkTypeId] = {'@type': 'LinkTypeOptions', property: linkTypeId, visible, showLabel};
            const linkType = this.getLinkType(linkTypeId);
            if (linkType) {
                linkType.setVisibility({visible, showLabel});
            }
        }
    }

    private loadAndRenderLayout(params: {
        layoutData?: LayoutData;
        preloadedElements?: Dictionary<ElementModel>;
        markLinksAsLayoutOnly: boolean;
        allLinkTypes: ReadonlyArray<FatLinkType>;
        hideUnusedLinkTypes?: boolean;
        signal?: AbortSignal;
    }): Promise<void> {
        const {
            layoutData = emptyLayoutData(),
            preloadedElements = {},
            markLinksAsLayoutOnly,
            hideUnusedLinkTypes,
        } = params;

        const elementIrisToRequestData: ElementIri[] = [];
        const usedLinkTypes: { [typeId: string]: FatLinkType } = {};

        for (const layoutElement of layoutData.elements) {
            const {'@id': id, iri, position, isExpanded, group, elementState} = layoutElement;
            const template = preloadedElements[iri];
            const data = template || placeholderDataFromIri(iri);
            const element = new Element({id, data, position, expanded: isExpanded, group, elementState});
            this.graph.addElement(element);
            if (!template) {
                elementIrisToRequestData.push(element.iri);
            }
        }

        for (const layoutLink of layoutData.links) {
            const {'@id': id, property, source, target, vertices, linkState} = layoutLink;
            const linkType = this.createLinkType(property);
            usedLinkTypes[linkType.id] = linkType;
            const sourceElement = this.graph.getElement(source['@id']);
            const targetElement = this.graph.getElement(target['@id']);
            if (sourceElement && targetElement) {
                const data: LinkModel = {
                    linkTypeId: property,
                    sourceId: sourceElement.iri,
                    targetId: targetElement.iri,
                    properties: {},
                };
                const link = this.addLink(new Link({
                    id,
                    sourceId: sourceElement.id,
                    targetId: targetElement.id,
                    data,
                    vertices,
                    linkState,
                }));
                link.setLayoutOnly(markLinksAsLayoutOnly);
            }
        }

        this.subscribeGraph();
        const requestingModels = this.requestElementData(elementIrisToRequestData);

        if (hideUnusedLinkTypes && params.allLinkTypes) {
            this.hideUnusedLinkTypes(params.allLinkTypes, usedLinkTypes);
        }

        return requestingModels;
    }

    private hideUnusedLinkTypes(
        allTypes: ReadonlyArray<FatLinkType>,
        usedTypes: { [typeId: string]: FatLinkType }
    ) {
        for (const linkType of allTypes) {
            if (!usedTypes[linkType.id]) {
                linkType.setVisibility({
                    visible: false,
                    showLabel: linkType.showLabel,
                });
            }
        }
    }

    requestElementData(elementIris: ReadonlyArray<ElementIri>): Promise<void> {
        return this.fetcher!.fetchElementData(elementIris);
    }

    requestLinksOfType(linkTypeIds?: LinkTypeIri[]): Promise<void> {
        return this.dataProvider.linksInfo({
            elementIds: this.graph.getElements().map(element => element.iri),
            linkTypeIds,
        }).then(links => this.onLinkInfoLoaded(links));
    }

    createClass(classId: ElementTypeIri): FatClassModel {
        const existing = super.getClass(classId);
        if (existing) {
            return existing;
        }
        const classModel = super.createClass(classId);
        this.fetcher!.fetchClass(classModel);
        return classModel;
    }

    createLinkType(linkTypeId: LinkTypeIri): FatLinkType {
        if (this.graph.getLinkType(linkTypeId)) {
            return super.createLinkType(linkTypeId);
        }
        const linkType = super.createLinkType(linkTypeId);
        const setting = this.linkSettings[linkType.id];
        if (setting) {
            const {visible, showLabel} = setting;
            linkType.setVisibility({visible, showLabel: showLabel!});
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

        for (const linkModel of links) {
            this.createLinkType(linkModel.linkTypeId);
            allowToCreate = true;
            this.asyncSource.trigger('createLoadedLink', {source: this, model: linkModel, cancel});
            if (allowToCreate) {
                this.createLinks(linkModel);
            }
        }
    }

    createLinks(data: LinkModel) {
        const sources = this.graph.getElements().filter(el => el.iri === data.sourceId);
        const targets = this.graph.getElements().filter(el => el.iri === data.targetId);
        for (const source of sources) {
            for (const target of targets) {
                this.addLink(new Link({sourceId: source.id, targetId: target.id, data}));
            }
        }
    }

    private async loadGroupContent(element: Element): Promise<void> {
        const models = await this.loadEmbeddedElements(element.iri);
        const batch = this.history.startBatch();
        const elementIris = Object.keys(models) as ElementIri[];
        const elements = elementIris.map(
            key => this.createElement(models[key], element.id)
        );
        batch.discard();

        await Promise.all([
            this.requestElementData(elementIris),
            this.requestLinksOfType(),
        ]);
        this.fetcher!.signal.throwIfAborted();

        this.triggerChangeGroupContent(element.id, {layoutComplete: false});
    }

    private async loadEmbeddedElements(elementIri: ElementIri): Promise<Dictionary<ElementModel>> {
        const elements = this.groupByProperties.map(groupBy =>
            this.dataProvider.filter({
                refElementId: elementIri,
                refElementLinkId: groupBy.linkType as LinkTypeIri,
                linkDirection: groupBy.linkDirection,
                signal: this.fetcher!.signal,
            })
        );
        const results = await Promise.all(elements);
        const nestedModels: { [id: string]: ElementModel } = {};
        for (const result of results) {
            for (const {element} of result) {
                nestedModels[element.id] = element;
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
