import { TypeStyleResolver } from '../diagram/customization';

const classIcon = require('@images/semantic/class.svg');
const objectPropertyIcon = require('@images/semantic/objectProperty.svg');
const datatypePropertyIcon = require('@images/semantic/datatypeProperty.svg');
const personIcon = require('@images/semantic/person.svg');
const countryIcon = require('@images/semantic/country.svg');
const organizationIcon = require('@images/semantic/organization.svg');
const locationIcon = require('@images/semantic/location.svg');
const eventIcon = require('@images/semantic/event.svg');
const objectIcon = require('@images/semantic/object.svg');

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
