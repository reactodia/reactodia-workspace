import * as React from 'react';

import { mapAbortedToNull } from '../coreUtils/async';
import { useObservedProperty } from '../coreUtils/hooks';
import { useTranslation, type Translation } from '../coreUtils/i18n';
import { useKeyedSyncStore } from '../coreUtils/keyedObserver';

import type { MetadataProvider } from '../data/metadataProvider';
import { ElementModel, LinkModel, LinkDirection, LinkTypeIri, equalLinks, LinkKey } from '../data/model';
import { PlaceholderRelationType } from '../data/schema';

import { HtmlSpinner } from '../diagram/spinner';

import type { DataDiagramModel } from '../editor/dataDiagramModel';
import { EntityElement, RelationLink, iterateRelationsOf } from '../editor/dataElements';
import { subscribeLinkTypes } from '../editor/observedElement';

import { useWorkspace, WorkspaceContext } from '../workspace/workspaceContext';

export interface ExtendedLink {
    base: Omit<LinkModel, 'sourceId' | 'targetId'>;
    source: ElementModel;
    target: ElementModel;
    direction: LinkDirection;
}

interface DirectedLinkType {
    readonly key: number;
    readonly iri: LinkTypeIri;
    readonly direction: LinkDirection;
}

const FORM_CLASS = 'reactodia-form';

export function LinkTypeSelector(props: {
    link: ExtendedLink;
    onChange: (link: ExtendedLink) => void;
    disabled?: boolean;
    error?: React.ReactNode | null;
}) {
    const {link, onChange, disabled, error} = props;
    const {editor} = useWorkspace();
    const t = useTranslation();

    const [linkTypes, setLinkTypes] = React.useState<readonly DirectedLinkType[]>();
    const [fetchState, setFetchState] = React.useState<{ type: 'loading' | 'error'; error?: unknown }>();

    React.useEffect(() => {
        const controller = new AbortController();
        setFetchState({type: 'loading'});
        fetchPossibleLinkTypes({
            link,
            metadataProvider: editor.metadataProvider,
            signal: controller.signal,
        }).then(
            linkTypes => {
                if (!controller.signal.aborted) {
                    setLinkTypes(linkTypes);
                    setFetchState(undefined);
                }
            },
            error => {
                if (!controller.signal.aborted) {
                    setLinkTypes([]);
                    setFetchState({type: 'error', error});
                }
            },
        );
        return () => controller.abort();
    }, [link.source.id, link.target.id]);

    const selectedType = (linkTypes ?? []).find(({iri, direction}) =>
        iri === link.base.linkTypeId && direction === link.direction
    );
    const onChangeType = (e: React.FormEvent<HTMLSelectElement>) => {
        const key = Number(e.currentTarget.value);
        const nextType = linkTypes?.find(linkType => linkType.key === key);
        if (nextType) {
            const changedLink: ExtendedLink = {
                ...link,
                base: {
                    ...link.base,
                    linkTypeId: nextType.iri,
                },
                direction: nextType.direction,
            };
            onChange(changedLink);
        }
    };

    return (
        <div className={`${FORM_CLASS}__control-row`}>
            <label>{t.text('visual_authoring.select_relation.type.label')}</label>
            {linkTypes && !fetchState ? (
                <select className='reactodia-form-control'
                    name='reactodia-link-type-selector-select'
                    value={selectedType?.key ?? -1}
                    onChange={onChangeType}
                    disabled={disabled}>
                    <option value={-1} disabled={true}>
                        {t.text('visual_authoring.select_relation.type.placeholder')}
                    </option>
                    <LinkTypeOptions link={link} linkTypes={linkTypes} />
                </select>
            ) : (
                <div>
                    <HtmlSpinner width={20} height={20} errorOccurred={fetchState?.type === 'error'} />
                </div>
            )}
            {error ? <span className={`${FORM_CLASS}__control-error`}>{error}</span> : null}
        </div>
    );
}

function LinkTypeOptions(props: {
    link: ExtendedLink;
    linkTypes: readonly DirectedLinkType[];
}) {
    const {link, linkTypes} = props;
    const {model} = useWorkspace();
    const t = useTranslation();

    const language = useObservedProperty(model.events, 'changeLanguage', () => model.language);
    useKeyedSyncStore(subscribeLinkTypes, linkTypes.map(type => type.iri), model);
    const sortedLinkTypes = [...linkTypes].sort(
        makeLinkTypeComparatorByLabelAndDirection(model, t, language)
    );

    return (
        <>
            {sortedLinkTypes.map(({key, iri, direction}: DirectedLinkType) => {
                const data = model.getLinkType(iri);
                const label = t.formatLabel(data?.data?.label, iri, model.language);
                let [sourceLabel, targetLabel] = [link.source, link.target].map(element =>
                    model.locale.formatEntityLabel(element, model.language)
                );
                if (direction === 'in') {
                    [sourceLabel, targetLabel] = [targetLabel, sourceLabel];
                }
                return (
                    <option key={key} value={key}>
                        {t.text('visual_authoring.select_relation.relation_type.label', {
                            relation: label,
                            source: sourceLabel,
                            target: targetLabel,
                        })}
                    </option>
                );
            })}
        </>
    );
}

function makeLinkTypeComparatorByLabelAndDirection(model: DataDiagramModel, t: Translation, language: string) {
    return (a: DirectedLinkType, b: DirectedLinkType) => {
        const aData = model.getLinkType(a.iri);
        const bData = model.getLinkType(b.iri);
        const labelA = t.formatLabel(aData?.data?.label, a.iri, language);
        const labelB = t.formatLabel(bData?.data?.label, b.iri, language);
        const labelCompareResult = labelA.localeCompare(labelB);
        if (labelCompareResult !== 0) {
            return labelCompareResult;
        }
        if (a.direction === 'out' && b.direction === 'in') {
            return -1;
        }
        if (a.direction === 'in' && b.direction === 'out') {
            return 1;
        }
        return 0;
    };
}

async function fetchPossibleLinkTypes(params: {
    link: ExtendedLink;
    metadataProvider: MetadataProvider | undefined;
    signal: AbortSignal;
}): Promise<DirectedLinkType[]> {
    const {link, metadataProvider, signal} = params;
    if (!metadataProvider) {
        return [];
    }

    const connections = await mapAbortedToNull(
        metadataProvider.canConnect(
            link.source,
            link.target,
            undefined,
            {signal}
        ),
        signal
    );
    if (connections === null) {
        return [];
    }

    const inLinkSet = new Set<LinkTypeIri>();
    const outLinkSet = new Set<LinkTypeIri>();
    for (const {inLinks, outLinks} of connections) {
        for (const linkType of inLinks) {
            inLinkSet.add(linkType);
        }
        for (const linkType of outLinks) {
            outLinkSet.add(linkType);
        }
    }

    let nextKey = 1;
    const dataLinkTypes: DirectedLinkType[] = [];
    for (const linkType of outLinkSet) {
        dataLinkTypes.push({key: nextKey, iri: linkType, direction: 'out'});
        nextKey++;
    }
    for (const linkType of inLinkSet) {
        dataLinkTypes.push({key: nextKey, iri: linkType, direction: 'in'});
        nextKey++;
    }

    return dataLinkTypes;
}

export function dataFromExtendedLink(link: ExtendedLink): LinkModel {
    return {
        ...link.base,
        sourceId: link.direction === 'out' ? link.source.id : link.target.id,
        targetId: link.direction === 'out' ? link.target.id : link.source.id,
    };
}

export function relationFromExtendedLink(
    link: ExtendedLink,
    source: EntityElement,
    target: EntityElement
): RelationLink {
    let [finalSource, finalTarget] = [source, target];
    if (link.direction === 'in') {
        [finalSource, finalTarget] = [finalTarget, finalSource];
    }
    return new RelationLink({
        sourceId: finalSource.id,
        targetId: finalTarget.id,
        data: {
            ...link.base,
            sourceId: finalSource.iri,
            targetId: finalTarget.iri,
        }
    });
}

export interface ValidatedLink {
    link: ExtendedLink;
    error?: string;
    validated: boolean;
    allowChange: boolean;
}

export async function validateLinkType(
    currentLink: LinkModel,
    originalLink: LinkModel,
    workspace: WorkspaceContext,
    t: Translation,
    signal: AbortSignal | undefined
): Promise<Pick<ValidatedLink, 'error' | 'allowChange'>> {
    const {model, editor} = workspace;
    if (currentLink.linkTypeId === PlaceholderRelationType) {
        return {
            error: t.text('visual_authoring.select_relation.validation.error_required'),
            allowChange: true,
        };
    }
    if (equalLinks(currentLink, originalLink)) {
        return {error: undefined, allowChange: true};
    }
    if (isRelationOnDiagram(model, currentLink)) {
        return {
            error: t.text('visual_authoring.select_relation.validation.error_duplicate'),
            allowChange: editor.temporaryState.links.has(currentLink),
        };
    }

    const links = await model.dataProvider.links({
        primary: [currentLink.sourceId],
        secondary: [currentLink.targetId],
        linkTypeIds: [currentLink.linkTypeId],
        signal,
    });
    if (links.some(link => equalLinks(link, currentLink))) {
        return {
            error: t.text('visual_authoring.select_relation.validation.error_duplicate'),
            allowChange: false,
        };
    }
    
    return {error: undefined, allowChange: true};
}

function isRelationOnDiagram(model: DataDiagramModel, target: LinkKey): boolean {
    for (const link of model.links) {
        for (const relation of iterateRelationsOf(link)) {
            if (equalLinks(relation, target)) {
                return true;
            }
        }
    }
    return false;
}
