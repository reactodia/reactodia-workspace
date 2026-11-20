import type { DataProvider, DataProviderLookupItem } from '../../src/data/dataProvider';
import type { LinkModel } from '../../src/data/model';
import * as Rdf from '../../src/data/rdf/rdfModel';
import { owl as owlBase, rdf, rdfs as rdfsBase } from '../../src/data/rdf/vocabulary';

const NAMESPACE_ORG = 'http://www.w3.org/ns/org#';
export const org = {
    $namespace: NAMESPACE_ORG,
    ChangeEvent: `${NAMESPACE_ORG}ChangeEvent`,
    FormalOrganization: `${NAMESPACE_ORG}FormalOrganization`,
    Organization: `${NAMESPACE_ORG}Organization`,
    OrganizationalUnit: `${NAMESPACE_ORG}OrganizationalUnit`,
    Membership: `${NAMESPACE_ORG}Membership`,
    Role: `${NAMESPACE_ORG}Role`,
    Site: `${NAMESPACE_ORG}Site`,
    classification: `${NAMESPACE_ORG}classification`,
    hasMembership: `${NAMESPACE_ORG}hasMembership`,
    hasUnit: `${NAMESPACE_ORG}hasUnit`,
    identifier: `${NAMESPACE_ORG}identifier`,
    location: `${NAMESPACE_ORG}location`,
    member: `${NAMESPACE_ORG}member`,
    memberDuring: `${NAMESPACE_ORG}memberDuring`,
    memberOf: `${NAMESPACE_ORG}memberOf`,
    organization: `${NAMESPACE_ORG}organization`,
    role: `${NAMESPACE_ORG}role`,
    roleProperty: `${NAMESPACE_ORG}roleProperty`,
    subOrganizationOf: `${NAMESPACE_ORG}subOrganizationOf`,
    transitiveSubOrganizationOf: `${NAMESPACE_ORG}transitiveSubOrganizationOf`,
} as const;

export const owl = {
    ...owlBase,
    AnnotationProperty: `${owlBase.$namespace}AnnotationProperty`,
    FunctionalProperty: `${owlBase.$namespace}FunctionalProperty`,
    TransitiveProperty: `${owlBase.$namespace}TransitiveProperty`,
    Thing: `${owlBase.$namespace}Thing`,
    disjointWith: `${owlBase.$namespace}disjointWith`,
};

export const rdfs = {
    ...rdfsBase,
    comment: `${rdfsBase.$namespace}comment`,
    domain: `${rdfsBase.$namespace}domain`,
    isDefinedBy: `${rdfsBase.$namespace}isDefinedBy`,
    range: `${rdfsBase.$namespace}range`,
};

export type LinksTestCase = readonly [
    name: string,
    params: Parameters<DataProvider['links']>[0],
    expectedLinks: readonly LinkModel[],
];

export const linksOrgOntologyCases: readonly LinksTestCase[] = [
    [
        'disjoint primary and secondary',
        {
            primary: [org.Organization, org.OrganizationalUnit, org.hasUnit],
            secondary: [org.FormalOrganization],
        },
        [
            {
                sourceId: org.FormalOrganization,
                linkTypeId: rdfs.subClassOf,
                targetId: org.Organization,
                properties: {},
            },
            {
                sourceId: org.hasUnit,
                linkTypeId: rdfs.domain,
                targetId: org.FormalOrganization,
                properties: {},
            },
        ],
    ]
];

export type LookupTestCase = [
    name: string,
    params: Parameters<DataProvider['lookup']>[0],
    expectedIds: readonly string[],
];

export const lookupBasicOrgOntologyCases: readonly LookupTestCase[] = [
    [
        'type',
        {elementTypeId: owl.AnnotationProperty},
        [org.roleProperty],
    ],
    [
        'type and text',
        {elementTypeId: owl.DatatypeProperty, text: 'ident'},
        [org.identifier],
    ],
    [
        'text',
        {text: 'rol'},
        [org.Role, org.role, org.roleProperty],
    ],
    [
        'connected by entity and link type',
        {
            refElementId: org.Role,
            refElementLinkId: owl.disjointWith,
        },
        [org.ChangeEvent, org.Membership, org.Organization, org.Site],
    ],
    [
        'connected by entity, link type and direction',
        {
            refElementId: org.Role,
            refElementLinkId: owl.disjointWith,
            linkDirection: 'in',
        },
        [org.Organization],
    ],
    [
        'connected by link type and direction',
        {
            refElementLinkId: rdfs.isDefinedBy,
            linkDirection: 'out',
        },
        ['http://www.w3.org/ns/org'],
    ],
];

export const lookupPatternOrgOntologyCases: readonly LookupTestCase[] = [
    [
        '(has-type) and (from-values)',
        {
            pattern: {
                type: 'allOf',
                patterns: [
                    {
                        type: 'hasType',
                        elementType: owl.DatatypeProperty,
                    },
                    {
                        type: 'fromValues',
                        values: [org.location, org.identifier, org.organization],
                    },
                ],
            },
        },
        [org.identifier, org.location],
    ],
    [
        '(from-values [])',
        {
            pattern: {
                type: 'fromValues',
                values: [],
            },
        },
        [],
    ],
    [
        '(from-values) and (from-values)',
        {
            pattern: {
                type: 'allOf',
                patterns: [
                    {
                        type: 'fromValues',
                        values: [org.organization, org.transitiveSubOrganizationOf],
                    },
                    {
                        type: 'fromValues',
                        values: [org.member, org.organization],
                    }
                ],
            },
        },
        [org.organization],
    ],
    [
        '(from-values) or (from-values)',
        {
            pattern: {
                type: 'anyOf',
                patterns: [
                    {
                        type: 'fromValues',
                        values: [org.organization, org.transitiveSubOrganizationOf],
                    },
                    {
                        type: 'fromValues',
                        values: [org.member, org.organization],
                    }
                ],
            },
        },
        [org.member, org.organization, org.transitiveSubOrganizationOf],
    ],
    [
        '(has-type) and (connected-to (from-values)) and (with-text)',
        {
            pattern: {
                type: 'allOf',
                patterns: [
                    {
                        type: 'hasType',
                        elementType: owl.Class,
                    },
                    {
                        type: 'connectedTo',
                        other: {
                            type: 'fromValues',
                            values: [org.Role],
                        },
                    },
                    {
                        type: 'withText',
                        text: 'event',
                    },
                ],
            },
        },
        [org.ChangeEvent],
    ],
    [
        '(has-property) and ((has-type) or (has-type))',
        {
            pattern: {
                type: 'allOf',
                patterns: [
                    {
                        type: 'hasProperty',
                        propertyType: rdfs.comment,
                    },
                    {
                        type: 'anyOf',
                        patterns: [
                            {
                                type: 'hasType',
                                elementType: owl.FunctionalProperty,
                            },
                            {
                                type: 'hasType',
                                elementType: owl.TransitiveProperty,
                            },
                        ],
                    },
                ],
            },
        },
        [org.member, org.organization, org.transitiveSubOrganizationOf],
    ],
    [
        '(connected-to (connected-to (from-values)))',
        {
            pattern: {
                type: 'connectedTo',
                linkType: rdfs.domain,
                linkDirection: 'in',
                other: {
                    type: 'connectedTo',
                    linkType: rdfs.range,
                    linkDirection: 'out',
                    other: {
                        type: 'fromValues',
                        values: [org.hasMembership],
                    },
                },
            },
        },
        [org.member, org.memberDuring, org.organization],
    ],
    [
        '(has-property)',
        {
            pattern: {
                type: 'hasProperty',
                propertyType: rdfs.label,
                values: [Rdf.DefaultDataFactory.literal('Formal Organization', 'en')],
            },
        },
        [org.FormalOrganization],
    ],
    [
        '(has-property) and (has-property)',
        {
            pattern: {
                type: 'allOf',
                patterns: [
                    {
                        type: 'hasProperty',
                        propertyType: rdfs.label,
                        values: [
                            Rdf.DefaultDataFactory.literal('Formal Organization', 'en'),
                            Rdf.DefaultDataFactory.literal('SomethingElse')
                        ],
                    },
                    {
                        type: 'hasProperty',
                        propertyType: rdfs.comment,
                    },
                ],
            },
        },
        [org.FormalOrganization],
    ],
    [
        '(has-property) or (has-property)',
        {
            pattern: {
                type: 'anyOf',
                patterns: [
                    {
                        type: 'hasProperty',
                        propertyType: rdfs.label,
                        values: [Rdf.DefaultDataFactory.literal('Formal Organization', 'en')],
                    },
                    {
                        type: 'hasProperty',
                        propertyType: rdfs.label,
                        values: [Rdf.DefaultDataFactory.literal('member', 'en')],
                    },
                ],
            },
        },
        [org.FormalOrganization, org.member],
    ],
    [
        '(has-type) and (has-type)',
        {
            pattern: {
                type: 'allOf',
                patterns: [
                    {
                        type: 'hasType',
                        elementType: owl.ObjectProperty,
                    },
                    {
                        type: 'hasType',
                        elementType: owl.TransitiveProperty,
                    },
                ],
            },
        },
        [org.transitiveSubOrganizationOf],
    ],
    [
        '(has-type) or (has-type)',
        {
            pattern: {
                type: 'anyOf',
                patterns: [
                    {
                        type: 'hasType',
                        elementType: owl.AnnotationProperty,
                    },
                    {
                        type: 'hasType',
                        elementType: owl.DatatypeProperty,
                    },
                ],
            },
        },
        [org.identifier, org.location, org.roleProperty],
    ],
    [
        '(with-text) and (with-text)',
        {
            pattern: {
                type: 'allOf',
                patterns: [
                    {
                        type: 'withText',
                        text: 'formal',
                    },
                    {
                        type: 'withText',
                        text: 'formal organ',
                    },
                ],
            },
        },
        [org.FormalOrganization],
    ],
    [
        '(with-text) or (with-text)',
        {
            pattern: {
                type: 'anyOf',
                patterns: [
                    {
                        type: 'withText',
                        text: 'formal',
                    },
                    {
                        type: 'withText',
                        text: 'classification',
                    },
                ],
            },
        },
        [org.FormalOrganization, org.classification],
    ],
    [
        '(connected-to (has-type)) and (connected-to (has-type))',
        {
            pattern: {
                type: 'allOf',
                patterns: [
                    {
                        type: 'connectedTo',
                        linkType: rdfs.range,
                        linkDirection: 'out',
                        other: {
                            type: 'hasType',
                            elementType: owl.FunctionalProperty,
                        },
                    },
                    {
                        type: 'connectedTo',
                        linkType: rdfs.domain,
                        linkDirection: 'out',
                        other: {
                            type: 'hasType',
                            elementType: owl.DatatypeProperty,
                        },
                    },
                ],
            },
        },
        [org.Organization],
    ],
];

export type LookupWithLinksTestCase = [
    name: string,
    params: Parameters<DataProvider['lookup']>[0],
    getExpectedItems: readonly DataProviderLookupItem[]
];

export const lookupWithLinksOrgOntologyCases: readonly LookupWithLinksTestCase[] = [
    [
        'type',
        {
            elementTypeId: owl.DatatypeProperty,
            withLinks: true,
        },
        [
            {
                element: {
                    id: org.identifier,
                    types: [rdf.Property, owl.DatatypeProperty],
                    properties: {
                        [rdfs.label]: [Rdf.DefaultDataFactory.literal('identifier', 'en')],
                    }
                },
                inLinks: new Set(),
                outLinks: new Set(),
            },
            {
                element: {
                    id: org.location,
                    types: [rdf.Property, owl.DatatypeProperty],
                    properties: {
                        [rdfs.label]: [Rdf.DefaultDataFactory.literal('location', 'en')],
                    }
                },
                inLinks: new Set(),
                outLinks: new Set(),
            },
        ] as const
    ],
    [
        'connected by entity',
        {
            refElementId: org.roleProperty,
            withLinks: true,
        },
        [
            {
                element: {
                    id: rdf.Property,
                    types: [],
                    properties: {}
                },
                inLinks: new Set(),
                outLinks: new Set([rdf.type, rdfs.range]),
            },
            {
                element: {
                    id: owl.AnnotationProperty,
                    types: [],
                    properties: {}
                },
                inLinks: new Set(),
                outLinks: new Set([rdf.type]),
            },
            {
                element: {
                    id: 'http://www.w3.org/ns/org',
                    types: [],
                    properties: {},
                },
                inLinks: new Set(),
                outLinks: new Set([rdfs.isDefinedBy]),
            },
            {
                element: {
                    id: org.Role,
                    types: [rdfs.Class, owl.Class],
                    properties: {
                        [rdfs.label]: [Rdf.DefaultDataFactory.literal('Role', 'en')],
                    }
                },
                inLinks: new Set(),
                outLinks: new Set([rdfs.domain]),
            },
        ] as const,
    ],
];
