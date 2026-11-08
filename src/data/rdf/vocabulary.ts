const NAMESPACE_OWL = 'http://www.w3.org/2002/07/owl#';
/**
 * Vocabulary for common terms from `owl: <http://www.w3.org/2002/07/owl#>` namespace.
 *
 * @category Constants
 */
export const owl = {
    $namespace: NAMESPACE_OWL,
    Class: `${NAMESPACE_OWL}Class`,
    DatatypeProperty: `${NAMESPACE_OWL}DatatypeProperty`,
    ObjectProperty: `${NAMESPACE_OWL}ObjectProperty`,
} as const;

const NAMESPACE_RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
/**
 * Vocabulary for common terms from `rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>` namespace.
 *
 * @category Constants
 */
export const rdf = {
    $namespace: NAMESPACE_RDF,
    Property: `${NAMESPACE_RDF}Property`,
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
    $namespace: NAMESPACE_RDFS,
    Class: `${NAMESPACE_RDFS}Class`,
    label: `${NAMESPACE_RDFS}label`,
    subClassOf: `${NAMESPACE_RDFS}subClassOf`,
} as const;

const NAMESPACE_SCHEMA = 'http://schema.org/';
/**
 * Vocabulary for common terms from `schema: <http://schema.org/>` namespace.
 *
 * @category Constants
 */
export const schema = {
    $namespace: NAMESPACE_SCHEMA,
    encodingFormat: `${NAMESPACE_SCHEMA}encodingFormat`,
    fileSize: `${NAMESPACE_SCHEMA}fileSize`,
    thumbnailUrl: `${NAMESPACE_SCHEMA}thumbnailUrl`,
    uploadDate: `${NAMESPACE_SCHEMA}uploadDate`,
} as const;

const NAMESPACE_XSD = 'http://www.w3.org/2001/XMLSchema#';
/**
 * Vocabulary for common terms from `xsd: <http://www.w3.org/2001/XMLSchema#>` namespace.
 *
 * @category Constants
 */
export const xsd = {
    $namespace: NAMESPACE_XSD,
    boolean: `${NAMESPACE_XSD}boolean`,
    dateTime: `${NAMESPACE_XSD}dateTime`,
    integer: `${NAMESPACE_XSD}integer`,
    string: `${NAMESPACE_XSD}string`,
} as const;

type LazyVocabulary<Namespace extends string, Keys extends string> = {
    readonly $namespace: Namespace;
} & {
    readonly [K in Keys]: `${Namespace}${K}`
};

type VocabularyFactory<N extends string> = <Keys extends string>() => LazyVocabulary<N, Keys>;

export function vocabulary<const N extends string>(namespace: N): VocabularyFactory<N> {
    return <Keys extends string>() => new Proxy(
        {$namespace: namespace},
        {
            get(target: Record<string, string>, p, _receiver) {
                if (typeof p !== 'string') {
                    return undefined;
                } else if (Object.hasOwn(target, p)) {
                    return target[p];
                } else {
                    const iri = `${namespace}${p}`;
                    target[p] = iri;
                    return iri;
                }
            },
        }
    ) as LazyVocabulary<N, Keys>;
}
