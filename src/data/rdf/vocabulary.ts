const NAMESPACE_RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
/**
 * Vocabulary for common terms from `rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>` namespace.
 *
 * @category Constants
 */
export const rdf = {
    namespace: NAMESPACE_RDF,
    langString: `${NAMESPACE_RDF}langString`,
    type: `${NAMESPACE_RDF}type`,
    JSON: `${NAMESPACE_RDF}JSON`,
} as const;

const NAMESPACE_RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
/**
 * Vocabulary for common terms from `rdfs: <http://www.w3.org/2000/01/rdf-schema#>` namespace.
 *
 * @category Constants
 */
export const rdfs = {
    namespace: NAMESPACE_RDFS,
    label: `${NAMESPACE_RDFS}label`,
} as const;

const NAMESPACE_SCHEMA = 'http://schema.org/';
/**
 * Vocabulary for common terms from `schema: <http://schema.org/>` namespace.
 *
 * @category Constants
 */
export const schema = {
    namespace: NAMESPACE_SCHEMA,
    thumbnailUrl: `${NAMESPACE_SCHEMA}thumbnailUrl`,
} as const;

const NAMESPACE_XSD = 'http://www.w3.org/2001/XMLSchema#';
/**
 * Vocabulary for common terms from `xsd: <http://www.w3.org/2001/XMLSchema#>` namespace.
 *
 * @category Constants
 */
export const xsd = {
    namespace: NAMESPACE_XSD,
    string: `${NAMESPACE_XSD}string`,
} as const;
