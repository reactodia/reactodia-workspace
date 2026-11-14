import type { DataProvider } from '../../src/data/dataProvider';
import type { LinkModel } from '../../src/data/model';
import { owl as owlBase, rdfs as rdfsBase } from '../../src/data/rdf/vocabulary';

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
    identifier: `${NAMESPACE_ORG}identifier`,
    hasUnit: `${NAMESPACE_ORG}hasUnit`,
    location: `${NAMESPACE_ORG}location`,
    member: `${NAMESPACE_ORG}member`,
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
        '(has-type) and (connected-to) and (with-text)',
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
                        target: {
                            type: 'fromValues',
                            values: [org.Role],
                        },
                    },
                    {
                        type: 'withText',
                        text: 'event',
                    }
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
                        ]
                    },
                ],
            },
        },
        [org.member, org.organization, org.transitiveSubOrganizationOf],
    ],
];
