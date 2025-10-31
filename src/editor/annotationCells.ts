import type { LinkTypeIri } from '../data/model';

import { Element, Link } from '../diagram/elements';

import type {
    SerializedElement, SerializableElementCell, ElementFromJsonOptions,
    SerializedLink, SerializableLinkCell, LinkFromJsonOptions,
} from './serializedDiagram';

export class AnnotationElement extends Element {
    static readonly fromJSONType = 'Annotation';

    static fromJSON(
        state: SerializedAnnotationElement,
        options: ElementFromJsonOptions
    ): AnnotationElement | undefined {
        const {'@id': id, position, elementState} = state;
        return new AnnotationElement({
            id,
            position,
            elementState: options.mapTemplateState(elementState),
        });
    }

    toJSON(): SerializedAnnotationElement {
        return {
            '@type': 'Annotation',
            '@id': this.id,
            position: this.position,
            elementState: this.elementState,
        };
    }
}

AnnotationElement satisfies SerializableElementCell<AnnotationElement>;

export interface SerializedAnnotationElement extends SerializedElement {
    '@type': 'Annotation';
}

export class AnnotationLink extends Link {
    static readonly typeId: LinkTypeIri = 'urn:reactodia:annotates';

    protected getTypeId(): LinkTypeIri {
        return AnnotationLink.typeId;
    }

    static readonly fromJSONType = 'AnnotationLink';

    static fromJSON(
        state: SerializedAnnotationLink,
        options: LinkFromJsonOptions
    ): AnnotationLink | undefined {
        const {'@id': id, vertices, linkState} = state;
        return new AnnotationLink({
            id,
            sourceId: options.source.id,
            targetId: options.target.id,
            vertices,
            linkState: options.mapTemplateState(linkState),
        });
    }

    toJSON(): SerializedAnnotationLink {
        return {
            '@type': 'AnnotationLink',
            '@id': this.id,
            source: {'@id': this.sourceId},
            target: {'@id': this.targetId},
            vertices: this.vertices,
            linkState: this.linkState,
        };
    }
}

AnnotationLink satisfies SerializableLinkCell<AnnotationLink>;

export interface SerializedAnnotationLink extends SerializedLink {
    '@type': 'AnnotationLink';
}
