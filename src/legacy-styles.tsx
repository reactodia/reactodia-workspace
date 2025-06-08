import type { TypeStyleResolver, LinkTemplate, LinkTemplateResolver } from './diagram/customization';

const classIcon = require('@images/semantic/class.svg');
const objectPropertyIcon = require('@images/semantic/objectProperty.svg');
const datatypePropertyIcon = require('@images/semantic/datatypeProperty.svg');
const personIcon = require('@images/semantic/person.svg');
const countryIcon = require('@images/semantic/country.svg');
const organizationIcon = require('@images/semantic/organization.svg');
const locationIcon = require('@images/semantic/location.svg');
const eventIcon = require('@images/semantic/event.svg');
const objectIcon = require('@images/semantic/object.svg');

/**
 * Built-in type style provider for Semantic Web element types:
 *   - Class: `owl:Class`, `rdfs:Class`
 *   - Object property: `owl:ObjectProperty`
 *   - Datatype property: `owl:DatatypeProperty`
 *   - Person: `foaf:Person`, `wd:Q5`
 *   - Country: `wd:Q6256`
 *   - Organization: `schema:Organization`, `dbpedia:Organisation`,
 *     `foaf:Organization`, `wd:Q43229`
 *   - Location: `wd:Q618123`
 *   - Event: `wd:Q1190554`
 *   - Object: `wd:Q488383`
 *
 * @deprecated These styles will be removed in later versions
 */
export const SemanticTypeStyles: TypeStyleResolver = types => {
    if (types.indexOf('http://www.w3.org/2002/07/owl#Class') !== -1 ||
        types.indexOf('http://www.w3.org/2000/01/rdf-schema#Class') !== -1
    ) {
        return {color: '#eaac77', icon: classIcon};
    } else if (types.indexOf('http://www.w3.org/2002/07/owl#ObjectProperty') !== -1) {
        return {color: '#34c7f3', icon: objectPropertyIcon};
    } else if (types.indexOf('http://www.w3.org/2002/07/owl#DatatypeProperty') !== -1) {
        return {color: '#34c7f3', icon: datatypePropertyIcon};
    } else if (
        types.indexOf('http://xmlns.com/foaf/0.1/Person') !== -1 ||
        types.indexOf('http://www.wikidata.org/entity/Q5') !== -1
    ) {
        return {color: '#eb7777', icon: personIcon};
    } else if (types.indexOf('http://www.wikidata.org/entity/Q6256') !== -1) {
        return {color: '#77ca98', icon: countryIcon};
    } else if (
        types.indexOf('http://schema.org/Organization') !== -1 ||
        types.indexOf('http://dbpedia.org/ontology/Organisation') !== -1 ||
        types.indexOf('http://xmlns.com/foaf/0.1/Organization') !== -1 ||
        types.indexOf('http://www.wikidata.org/entity/Q43229') !== -1
    ) {
        return {color: '#77ca98', icon: organizationIcon};
    } else if (types.indexOf('http://www.wikidata.org/entity/Q618123') !== -1) {
        return {color: '#bebc71', icon: locationIcon};
    } else if (types.indexOf('http://www.wikidata.org/entity/Q1190554') !== -1) {
        return {color: '#b4b1fb', icon: eventIcon};
    } else if (types.indexOf('http://www.wikidata.org/entity/Q488383') !== -1) {
        return {color: '#53ccb2', icon: objectIcon};
    } else {
        return undefined;
    }
};

/**
 * Factory for a built-in link template which displays an additional label
 * with the link type IRI.
 *
 * @deprecated This link template will be removed in some later version
 */
export function makeLinkStyleShowIri(Reactodia: typeof import('./workspace')): LinkTemplate {
    return {
        ...Reactodia.DefaultLinkTemplate,
        renderLink: props => (
            <Reactodia.DefaultLink {...props}
                prependLabels={
                    <Reactodia.LinkLabel link={props.link}
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
}

/**
 * Factory for a built-in link template provider for Web Ontology link types:
 *   - Sub-class-of: `rdfs:subClassOf`
 *   - Domain: `rdfs:domain`
 *   - Range: `rdfs:range`
 *   - Type-of: `rdf:type`
 *
 * @deprecated These link templates will be removed in later versions
 */
export function makeOntologyLinkTemplates(Reactodia: typeof import('./workspace')): LinkTemplateResolver {
    const LINK_SUB_CLASS_OF: LinkTemplate = {
        ...Reactodia.DefaultLinkTemplate,
        markerTarget: {
            fill: '#f8a485',
            stroke: '#cf8e76',
        },
        renderLink: props => (
            <Reactodia.DefaultLink {...props}
                pathProps={{
                    stroke: '#f8a485',
                }}
            />
        ),
    };
    
    const LINK_DOMAIN: LinkTemplate = {
        ...Reactodia.DefaultLinkTemplate,
        markerTarget: {
            fill: '#34c7f3',
            stroke: '#38b5db',
        },
        renderLink: props => (
            <Reactodia.DefaultLink {...props}
                pathProps={{
                    stroke: '#34c7f3',
                }}
            />
        ),
    };
    
    const LINK_RANGE: LinkTemplate = {
        ...Reactodia.DefaultLinkTemplate,
        markerTarget: {
            fill: '#34c7f3',
            stroke: '#38b5db',
        },
        renderLink: props => (
            <Reactodia.DefaultLink {...props}
                pathProps={{
                    stroke: '#34c7f3',
                }}
            />
        ),
    };
    
    const LINK_TYPE_OF: LinkTemplate = {
        ...Reactodia.DefaultLinkTemplate,
        markerTarget: {
            fill: '#8cd965',
            stroke: '#5b9a3b',
        },
        renderLink: props => (
            <Reactodia.DefaultLink {...props}
                pathProps={{
                    stroke: '#8cd965',
                }}
            />
        ),
    };

    return type => {
        if (type === 'http://www.w3.org/2000/01/rdf-schema#subClassOf') {
            return LINK_SUB_CLASS_OF;
        } else if (type === 'http://www.w3.org/2000/01/rdf-schema#domain') {
            return LINK_DOMAIN;
        } else if (type === 'http://www.w3.org/2000/01/rdf-schema#range') {
            return LINK_RANGE;
        } else if (type === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
            return LINK_TYPE_OF;
        } else if (type === Reactodia.PlaceholderRelationType) {
            return {...Reactodia.DefaultLinkTemplate, markerTarget: {fill: 'none'}};
        } else {
            return undefined;
        }
    };
}
