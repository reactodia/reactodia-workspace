import { AbortScope } from '../coreUtils/async';
import { AnyEvent, EventSource, Events } from '../coreUtils/events';

import {
    ElementModel, LinkModel, LinkTypeModel,
    ElementIri, LinkTypeIri, ElementTypeIri, PropertyTypeIri,
} from '../data/model';
import { EmptyDataProvider } from '../data/decorated/emptyDataProvider';
import { DataProvider } from '../data/provider';
import * as Rdf from '../data/rdf/rdfModel';
import { PLACEHOLDER_LINK_TYPE, TemplateProperties } from '../data/schema';

import { LabelLanguageSelector, FormattedProperty } from '../diagram/customization';
import { Link, LinkTypeVisibility } from '../diagram/elements';
import { Command } from '../diagram/history';
import {
    DiagramLocaleFormatter, DiagramModel, DiagramModelEvents, DiagramModelOptions,
    GraphStructure, LocaleFormatter,
} from '../diagram/model';

import {
    EntityElement, RelationLink, ElementType, ElementTypeEvents,
    PropertyType, PropertyTypeEvents, LinkType, LinkTypeEvents,
} from './dataElements';
import { DataFetcher, ChangeOperationsEvent, FetchOperation } from './dataFetcher';
import {
    SerializedLayout, SerializedLinkOptions, SerializedDiagram, emptyDiagram, emptyLayoutData,
    makeSerializedLayout, makeSerializedDiagram, 
} from './serializedDiagram';
import { DataGraph } from './dataGraph';

export interface AsyncModelEvents extends DiagramModelEvents {
    elementTypeEvent: AnyEvent<ElementTypeEvents>;
    linkTypeEvent: AnyEvent<LinkTypeEvents>;
    propertyTypeEvent: AnyEvent<PropertyTypeEvents>;

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

export interface DataGraphStructure extends GraphStructure {
    getElementType(elementTypeIri: ElementTypeIri): ElementType | undefined;
    getLinkType(linkTypeIri: LinkTypeIri): LinkType | undefined;
    getPropertyType(propertyTypeIri: PropertyTypeIri): PropertyType | undefined;
}

export interface AsyncModelOptions extends DiagramModelOptions {}

export class AsyncModel extends DiagramModel implements DataGraphStructure {
    declare readonly events: Events<AsyncModelEvents>;
    declare readonly locale: EntityLocaleFormatter;

    private dataGraph = new DataGraph();
    private loadingScope: AbortScope | undefined;
    private _dataProvider: DataProvider;
    private fetcher: DataFetcher;

    constructor(options: AsyncModelOptions) {
        super(options);
        this._dataProvider = new EmptyDataProvider();
        this.fetcher = new DataFetcher(this.graph, this.dataGraph, this._dataProvider);
    }

    protected override createLocale(selectLabelLanguage: LabelLanguageSelector): this['locale'] {
        return new ExtendedLocaleFormatter(this, selectLabelLanguage);
    }

    private get asyncSource(): EventSource<AsyncModelEvents> {
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
            this.asyncSource.trigger('elementTypeEvent', e);
        });
        this.graphListener.listen(this.dataGraph.events, 'linkTypeEvent', e => {
            this.asyncSource.trigger('linkTypeEvent', e);
        });
        this.graphListener.listen(this.dataGraph.events, 'propertyTypeEvent', e => {
            this.asyncSource.trigger('propertyTypeEvent', e);
        });

        super.subscribeGraph();
    }

    private setDataProvider(dataProvider: DataProvider) {
        this._dataProvider = dataProvider;
        this.fetcher = new DataFetcher(this.graph, this.dataGraph, dataProvider);
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

            const elementIrisToRequestData = this.graph.getElements()
                .filter((el): el is EntityElement =>
                    el instanceof EntityElement && !(preloadedElements && preloadedElements.has(el.iri))
                )
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
        this.resetGraph();
        this.setDataProvider(new EmptyDataProvider());
        this.asyncSource.trigger('loadingStart', {source: this});
        this.subscribeGraph();
        this.history.reset();
        this.asyncSource.trigger('loadingSuccess', {source: this});
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
            const {'@id': id, iri, position, isExpanded, elementState} = layoutElement;
            if (iri) {
                const template = preloadedElements?.get(iri);
                const data = template ?? EntityElement.placeholderData(iri);
                const element = new EntityElement({id, data, position, expanded: isExpanded, elementState});
                this.graph.addElement(element);
                if (!template) {
                    elementIrisToRequestData.push(element.iri);
                }
            }
        }

        for (const layoutLink of layoutData.links) {
            const {'@id': id, property, source, target, vertices, linkState} = layoutLink;
            const linkType = this.createLinkType(property);
            usedLinkTypes.add(linkType.id);
            const sourceElement = this.graph.getElement(source['@id']);
            const targetElement = this.graph.getElement(target['@id']);
            if (sourceElement instanceof EntityElement && targetElement instanceof EntityElement) {
                const data: LinkModel = {
                    linkTypeId: property,
                    sourceId: sourceElement.iri,
                    targetId: targetElement.iri,
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
        const elementIris = this.graph.getElements()
            .filter((el): el is EntityElement => el instanceof EntityElement)
            .map(el => el.iri);
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

    createLink(link: RelationLink): RelationLink {
        const {typeId, sourceId, targetId, data} = link;
        const existingLink = this.findLink(typeId, sourceId, targetId);
        if (existingLink instanceof RelationLink) {
            const {
                [TemplateProperties.LayoutOnly]: layoutOnly,
                ...withoutLayoutOnly
            } = existingLink.linkState ?? {};

            if (layoutOnly) {
                existingLink.setLinkState(withoutLayoutOnly);
            }

            existingLink.setData(data);
            return existingLink;
        }

        this.addLink(link);
        return link;
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
        const sources = this.graph.getElements().filter(el =>
            el instanceof EntityElement && el.iri === data.sourceId
        );
        const targets = this.graph.getElements().filter(el =>
            el instanceof EntityElement && el.iri === data.targetId
        );
        const batch = this.history.startBatch('Create links');
        for (const source of sources) {
            for (const target of targets) {
                this.createLink(new RelationLink({sourceId: source.id, targetId: target.id, data}));
            }
        }
        batch.store();
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
    declare protected model: AsyncModel;

    constructor(
        model: AsyncModel,
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
