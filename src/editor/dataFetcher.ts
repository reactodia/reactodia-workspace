import { BufferingQueue } from '../coreUtils/scheduler';

import {
    ElementModel, ElementType, LinkType, PropertyType,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri,
} from '../data/model';
import { DataProvider } from '../data/provider';

import { FatClassModel, FatLinkType, RichProperty } from '../diagram/elements';
import { Graph } from '../diagram/graph';

export class DataFetcher {
    private readonly cancellation = new AbortController();

    private classQueue = new BufferingQueue<ElementTypeIri>(classIds => {
        this.dataProvider
            .elementTypes({classIds, signal: this.signal})
            .then(this.onElementTypesLoaded);
    });
    private linkTypeQueue = new BufferingQueue<LinkTypeIri>(linkTypeIds => {
        this.dataProvider
            .linkTypes({linkTypeIds, signal: this.signal})
            .then(this.onLinkTypesLoaded);
    });
    private propertyTypeQueue = new BufferingQueue<PropertyTypeIri>(propertyIds => {
        this.dataProvider
            .propertyTypes({propertyIds, signal: this.signal})
            .then(this.onPropertyTypesLoaded);
    });

    constructor(
        private graph: Graph,
        private dataProvider: DataProvider,
    ) {}

    get signal(): AbortSignal {
        return this.cancellation.signal;
    }

    dispose() {
        this.cancellation.abort();
    }

    fetchElementData(elementIris: ReadonlyArray<ElementIri>): Promise<void> {
        if (elementIris.length === 0) {
            return Promise.resolve();
        }
        return this.dataProvider
            .elements({elementIds: [...elementIris], signal: this.signal})
            .then(this.onElementInfoLoaded);
    }

    private onElementInfoLoaded = (elements: Map<ElementIri, ElementModel>) => {
        for (const element of this.graph.getElements()) {
            const loadedModel = elements.get(element.iri);
            if (loadedModel) {
                element.setData(loadedModel);
            }
        }
    };

    fetchElementType(model: FatClassModel): void {
        this.classQueue.push(model.id);
    }

    private onElementTypesLoaded = (elementTypes: Map<ElementTypeIri, ElementType>) => {
        for (const {id, label, count} of elementTypes.values()) {
            const model = this.graph.getClass(id);
            if (!model) { continue; }
            model.setLabel(label);
            if (typeof count === 'number') {
                model.setCount(count);
            }
        }
    };

    fetchLinkType(linkType: FatLinkType): void {
        this.linkTypeQueue.push(linkType.id);
    }

    private onLinkTypesLoaded = (linkTypes: Map<LinkTypeIri, LinkType>) => {
        for (const {id, label} of linkTypes.values()) {
            const model = this.graph.getLinkType(id);
            if (!model) { continue; }
            model.setLabel(label);
        }
    };

    fetchPropertyType(propertyType: RichProperty): void {
        this.propertyTypeQueue.push(propertyType.id);
    }

    private onPropertyTypesLoaded = (propertyTypes: Map<PropertyTypeIri, PropertyType>) => {
        for (const {id, label} of propertyTypes.values()) {
            const targetProperty = this.graph.getProperty(id);
            if (targetProperty) {
                targetProperty.setLabel(label);
            }
        }
    };
}
