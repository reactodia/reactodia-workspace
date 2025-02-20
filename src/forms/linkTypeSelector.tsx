import * as React from 'react';

import { mapAbortedToNull } from '../coreUtils/async';
import { EventObserver } from '../coreUtils/events';
import { Translation } from '../coreUtils/i18n';

import { ElementModel, LinkModel, LinkDirection, LinkTypeIri, equalLinks, LinkKey } from '../data/model';
import { PLACEHOLDER_LINK_TYPE } from '../data/schema';

import { HtmlSpinner } from '../diagram/spinner';

import type { DataDiagramModel } from '../editor/dataDiagramModel';
import { EntityElement, LinkType, RelationLink, iterateRelationsOf } from '../editor/dataElements';

import { WorkspaceContext } from '../workspace/workspaceContext';

export interface LinkTypeSelectorProps {
    link: ExtendedLink;
    onChange: (link: ExtendedLink) => void;
    disabled?: boolean;
    error?: React.ReactNode | null;
}

export interface ExtendedLink {
    base: Omit<LinkModel, 'sourceId' | 'targetId'>;
    source: ElementModel;
    target: ElementModel;
    direction: LinkDirection;
}

interface State {
    linkTypes?: ReadonlyArray<DirectedLinkType>;
}

interface DirectedLinkType {
    readonly iri: LinkTypeIri;
    readonly direction: LinkDirection;
}

const FORM_CLASS = 'reactodia-form';

export class LinkTypeSelector extends React.Component<LinkTypeSelectorProps, State> {
    static contextType = WorkspaceContext;
    declare readonly context: WorkspaceContext;

    private readonly listener = new EventObserver();
    private readonly cancellation = new AbortController();

    constructor(props: LinkTypeSelectorProps, context: any) {
        super(props, context);
        this.state = {};
    }

    private updateAll = () => this.forceUpdate();

    componentDidMount() {
        this.fetchPossibleLinkTypes();
    }

    componentDidUpdate(prevProps: LinkTypeSelectorProps) {
        const {link} = this.props;
        if (!(
            link.source.id === prevProps.link.source.id &&
            link.target.id === prevProps.link.target.id
        )) {
            this.setState({linkTypes: undefined});
            this.fetchPossibleLinkTypes();
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.cancellation.abort();
    }

    private async fetchPossibleLinkTypes() {
        const {model, editor: {metadataProvider}, translation: t} = this.context;
        const {link} = this.props;
        if (!metadataProvider) {
            return;
        }
        const connections = await mapAbortedToNull(
            metadataProvider.canConnect(
                link.source,
                link.target,
                undefined,
                {signal: this.cancellation.signal}
            ),
            this.cancellation.signal
        );
        if (connections === null) {
            return;
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

        const dataLinkTypes: DirectedLinkType[] = [];
        for (const linkType of outLinkSet) {
            dataLinkTypes.push({iri: linkType, direction: 'out'});
        }
        for (const linkType of inLinkSet) {
            dataLinkTypes.push({iri: linkType, direction: 'in'});
        }
        dataLinkTypes.sort(makeLinkTypeComparatorByLabelAndDirection(model, t));

        this.setState({linkTypes: dataLinkTypes});
        this.listenToLinkLabels(dataLinkTypes.map(type => model.createLinkType(type.iri)));
    }

    private listenToLinkLabels(linkTypes: ReadonlyArray<LinkType>) {
        for (const linkType of linkTypes) {
            this.listener.listen(linkType.events, 'changeData', this.updateAll);
        }
    }

    private onChangeType = (e: React.FormEvent<HTMLSelectElement>) => {
        const {link} = this.props;
        const index = Number(e.currentTarget.value);
        const {iri, direction} = this.state.linkTypes![index];
        const changedLink: ExtendedLink = {
            ...link,
            base: {
                ...link.base,
                linkTypeId: iri,
            },
            direction,
        };
        this.props.onChange(changedLink);
    };

    private renderPossibleLinkType = (
        {iri, direction}: DirectedLinkType, index: number
    ) => {
        const {model, translation: t} = this.context;
        const {link} = this.props;
        const data = model.getLinkType(iri);
        const label = t.formatLabel(data?.data?.label, iri, model.language);
        let [sourceLabel, targetLabel] = [link.source, link.target].map(element =>
            t.formatLabel(element.label, element.id, model.language)
        );
        if (direction === 'in') {
            [sourceLabel, targetLabel] = [targetLabel, sourceLabel];
        }
        return (
            <option key={index} value={index}>
                {t.text('visual_authoring.select_relation.relation_type.label', {
                    relation: label,
                    source: sourceLabel,
                    target: targetLabel,
                })}
            </option>
        );
    };

    render() {
        const {translation: t} = this.context;
        const {link, disabled, error} = this.props;
        const {linkTypes} = this.state;
        const selectedIndex = (linkTypes ?? []).findIndex(({iri, direction}) =>
            iri === link.base.linkTypeId && direction === link.direction
        );
        return (
            <div className={`${FORM_CLASS}__control-row`}>
                <label>{t.text('visual_authoring.select_relation.type.label')}</label>
                {
                    linkTypes ? (
                        <select className='reactodia-form-control'
                            name='reactodia-link-type-selector-select'
                            value={selectedIndex}
                            onChange={this.onChangeType}
                            disabled={disabled}>
                            <option value={-1} disabled={true}>
                                {t.text('visual_authoring.select_relation.type.placeholder')}
                            </option>
                            {linkTypes.map(this.renderPossibleLinkType)}
                        </select>
                    ) : <div><HtmlSpinner width={20} height={20} /></div>
                }
                {error ? <span className={`${FORM_CLASS}__control-error`}>{error}</span> : null}
            </div>
        );
    }
}

function makeLinkTypeComparatorByLabelAndDirection(model: DataDiagramModel, t: Translation) {
    return (a: DirectedLinkType, b: DirectedLinkType) => {
        const aData = model.getLinkType(a.iri);
        const bData = model.getLinkType(b.iri);
        const labelA = t.formatLabel(aData?.data?.label, a.iri, model.language);
        const labelB = t.formatLabel(bData?.data?.label, b.iri, model.language);
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
    signal: AbortSignal | undefined
): Promise<Pick<ValidatedLink, 'error' | 'allowChange'>> {
    const {model, editor, translation: t} = workspace;
    if (currentLink.linkTypeId === PLACEHOLDER_LINK_TYPE) {
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
