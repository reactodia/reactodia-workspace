import * as React from 'react';

import { PLACEHOLDER_LINK_TYPE } from '../data/schema';
import { LinkTemplate, LinkTemplateResolver } from '../diagram/customization';
import { LinkLabel } from '../diagram/linkLayer';

import { DefaultLinkTemplate, DefaultLinkPathTemplate } from './defaultLinkTemplate';

/**
 * Built-in link template which displays an additional label
 * with the link type IRI.
 *
 * @category Constants
 */
export const LINK_STYLE_SHOW_IRI: LinkTemplate = {
    ...DefaultLinkTemplate,
    renderLink: props => (
        <DefaultLinkPathTemplate {...props}
            prependLabels={
                <LinkLabel link={props.link}
                    position={props.getPathPosition(0.5)}
                    line={1}
                    textStyle={{
                        fill: 'gray',
                        fontSize: 12,
                        fontWeight: 'lighter',
                    }}
                    content={props.link.typeId}
                />
            }
            propertyLabelStartLine={2}
        />
    ),
};

const LINK_SUB_CLASS_OF: LinkTemplate = {
    ...DefaultLinkTemplate,
    markerTarget: {
        fill: '#f8a485',
        stroke: '#cf8e76',
    },
    renderLink: props => (
        <DefaultLinkPathTemplate {...props}
            pathProps={{
                stroke: '#f8a485',
            }}
        />
    ),
};

const LINK_DOMAIN: LinkTemplate = {
    ...DefaultLinkTemplate,
    markerTarget: {
        fill: '#34c7f3',
        stroke: '#38b5db',
    },
    renderLink: props => (
        <DefaultLinkPathTemplate {...props}
            pathProps={{
                stroke: '#34c7f3',
            }}
        />
    ),
};

const LINK_RANGE: LinkTemplate = {
    ...DefaultLinkTemplate,
    markerTarget: {
        fill: '#34c7f3',
        stroke: '#38b5db',
    },
    renderLink: props => (
        <DefaultLinkPathTemplate {...props}
            pathProps={{
                stroke: '#34c7f3',
            }}
        />
    ),
};

const LINK_TYPE_OF: LinkTemplate = {
    ...DefaultLinkTemplate,
    markerTarget: {
        fill: '#8cd965',
        stroke: '#5b9a3b',
    },
    renderLink: props => (
        <DefaultLinkPathTemplate {...props}
            pathProps={{
                stroke: '#8cd965',
            }}
        />
    ),
};

/**
 * Built-in link template provider for Web Ontology link types:
 *   - Sub-class-of: `rdfs:subClassOf`
 *   - Domain: `rdfs:domain`
 *   - Range: `rdfs:range`
 *   - Type-of: `rdf:type`
 *
 * @category Constants
 * @deprecated These link templates will be removed in later versions
 */
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
        return {...DefaultLinkTemplate, markerTarget: {fill: 'none'}};
    } else {
        return undefined;
    }
};
