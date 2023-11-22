import { PLACEHOLDER_LINK_TYPE } from '../data/schema';
import { LinkTemplate, LinkTemplateResolver, LinkStyle } from '../diagram/customization';

export const LINK_STYLE_SHOW_IRI: LinkTemplate = {
    renderLink: (data, state, factory): LinkStyle => ({
        properties: [{
            position: 0.5,
            label: [factory.literal(data.linkTypeId)],
            text: {
                fill: 'gray',
                fontSize: 12,
                fontWeight: 'lighter',
            },
        }],
    }),
};

const LINK_SUB_CLASS_OF: LinkTemplate = {
    markerTarget: {
        fill: '#f8a485',
        stroke: '#cf8e76',
    },
    renderLink: (): LinkStyle => ({
        connection: {
            stroke: '#f8a485',
            strokeWidth: 2,
        },
    }),
};

const LINK_DOMAIN: LinkTemplate = {
    markerTarget: {
        fill: '#34c7f3',
        stroke: '#38b5db',
    },
    renderLink: (): LinkStyle => ({
        connection: {
            stroke: '#34c7f3',
            strokeWidth: 2,
        },
    }),
};

const LINK_RANGE: LinkTemplate = {
    markerTarget: {
        fill: '#34c7f3',
        stroke: '#38b5db',
    },
    renderLink: (): LinkStyle => ({
        connection: {
            stroke: '#34c7f3',
            strokeWidth: 2,
        },
    }),
};

const LINK_TYPE_OF: LinkTemplate = {
    markerTarget: {
        fill: '#8cd965',
        stroke: '#5b9a3b',
    },
    renderLink: (): LinkStyle => ({
        connection: {
            stroke: '#8cd965',
            strokeWidth: 2,
        },
    }),
};

export const OntologyLinkTemplates: LinkTemplateResolver = type => {
    if (type === 'http://www.w3.org/2000/01/rdf-schema#subClassOf') {
        return LINK_SUB_CLASS_OF;
    } else if (type === 'http://www.w3.org/2000/01/rdf-schema#domain') {
        return LINK_DOMAIN;
    } else if (type === 'http://www.w3.org/2000/01/rdf-schema#range') {
        return LINK_RANGE;
    } else if (type === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
        return LINK_TYPE_OF;
    } else if (type === PLACEHOLDER_LINK_TYPE) {
        return {markerTarget: {fill: 'none'}};
    } else {
        return undefined;
    }
};
