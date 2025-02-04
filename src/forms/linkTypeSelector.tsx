import * as React from 'react';

import { mapAbortedToNull } from '../coreUtils/async';
import { EventObserver } from '../coreUtils/events';

import { ElementModel, LinkModel, LinkDirection, LinkTypeIri, equalLinks, LinkKey } from '../data/model';
import { PLACEHOLDER_LINK_TYPE } from '../data/schema';

import { HtmlSpinner } from '../diagram/spinner';

import type { DataDiagramModel } from '../editor/dataDiagramModel';
import { LinkType, iterateRelationsOf } from '../editor/dataElements';

import { WorkspaceContext } from '../workspace/workspaceContext';

const FORM_CLASS = 'reactodia-form';

export interface Value {
    link: LinkModel;
    direction: LinkDirection;
}

export interface LinkValue {
    value: Value;
    error?: string;
    validated: boolean;
    allowChange: boolean;
}

interface DirectedDataLinkType {
    readonly iri: LinkTypeIri;
    readonly direction: LinkDirection;
}

export interface LinkTypeSelectorProps {
    linkValue: LinkValue;
    source: ElementModel;
    target: ElementModel;
    onChange: (value: Value) => void;
    disabled?: boolean;
}

interface State {
    dataLinkTypes?: ReadonlyArray<DirectedDataLinkType>;
}

export class LinkTypeSelector extends React.Component<LinkTypeSelectorProps, State> {
    static contextType = WorkspaceContext;
    declare readonly context: WorkspaceContext;

    private readonly listener = new EventObserver();
    private readonly cancellation = new AbortController();

    constructor(props: LinkTypeSelectorProps, context: any) {
        super(props, context);
        this.state = {
            dataLinkTypes: [],
        };
    }

    private updateAll = () => this.forceUpdate();

    componentDidMount() {
        this.fetchPossibleLinkTypes();
    }

    componentDidUpdate(prevProps: LinkTypeSelectorProps) {
        const {source, target} = this.props;
        if (prevProps.source !== source || prevProps.target !== target) {
            this.setState({dataLinkTypes: undefined});
            this.fetchPossibleLinkTypes();
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.cancellation.abort();
    }

    private async fetchPossibleLinkTypes() {
        const {model, editor: {metadataProvider}} = this.context;
        const {source, target} = this.props;
        if (!metadataProvider) {
            return;
        }
        const connections = await mapAbortedToNull(
            metadataProvider.canConnect(
                source,
                target,
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

        const dataLinkTypes: DirectedDataLinkType[] = [];
        for (const linkType of outLinkSet) {
            dataLinkTypes.push({iri: linkType, direction: 'out'});
        }
        for (const linkType of inLinkSet) {
            dataLinkTypes.push({iri: linkType, direction: 'in'});
        }
        dataLinkTypes.sort(makeLinkTypeComparatorByLabelAndDirection(model));

        this.setState({dataLinkTypes: dataLinkTypes});
        this.listenToLinkLabels(dataLinkTypes.map(type => model.createLinkType(type.iri)));
    }

    private listenToLinkLabels(linkTypes: ReadonlyArray<LinkType>) {
        for (const linkType of linkTypes) {
            this.listener.listen(linkType.events, 'changeData', this.updateAll);
        }
    }

    private onChangeType = (e: React.FormEvent<HTMLSelectElement>) => {
        const {link: originalLink, direction: originalDirection} = this.props.linkValue.value;
        const index = parseInt(e.currentTarget.value, 10);
        const {iri, direction} = this.state.dataLinkTypes![index];
        let link: LinkModel = {...originalLink, linkTypeId: iri};
        // switches source and target if the direction has changed
        if (originalDirection !== direction) {
            link = {
                ...link,
                sourceId: originalLink.targetId,
                targetId: originalLink.sourceId,
            };
        }
        this.props.onChange({link, direction});
    };

    private renderPossibleLinkType = (
        {iri, direction}: DirectedDataLinkType, index: number
    ) => {
        const {model, translation: t} = this.context;
        const {source, target} = this.props;
        const data = model.getLinkType(iri);
        const label = model.locale.formatLabel(data?.data?.label, iri);
        let [sourceLabel, targetLabel] = [source, target].map(element =>
            model.locale.formatLabel(element.label, element.id)
        );
        if (direction === 'in') {
            [sourceLabel, targetLabel] = [targetLabel, sourceLabel];
        }
        return (
            <option key={index} value={index}>
                {t.template('visual_authoring.select_relation.relation_type.label', {
                    relation: label,
                    source: sourceLabel,
                    target: targetLabel,
                })}
            </option>
        );
    };

    render() {
        const {translation: t} = this.context;
        const {linkValue, disabled} = this.props;
        const {dataLinkTypes} = this.state;
        const value = (dataLinkTypes ?? []).findIndex(({iri, direction}) =>
            iri === linkValue.value.link.linkTypeId && direction === linkValue.value.direction
        );
        return (
            <div className={`${FORM_CLASS}__control-row`}>
                <label>{t.text('visual_authoring.select_relation.type.label')}</label>
                {
                    dataLinkTypes ? (
                        <select className='reactodia-form-control'
                            name='reactodia-link-type-selector-select'
                            value={value}
                            onChange={this.onChangeType}
                            disabled={disabled}>
                            <option value={-1} disabled={true}>
                                {t.text('visual_authoring.select_relation.type.placeholder')}
                            </option>
                            {dataLinkTypes.map(this.renderPossibleLinkType)}
                        </select>
                    ) : <div><HtmlSpinner width={20} height={20} /></div>
                }
                {linkValue.error ? <span className={`${FORM_CLASS}__control-error`}>{linkValue.error}</span> : ''}
            </div>
        );
    }
}

function makeLinkTypeComparatorByLabelAndDirection(model: DataDiagramModel) {
    return (a: DirectedDataLinkType, b: DirectedDataLinkType) => {
        const aData = model.getLinkType(a.iri);
        const bData = model.getLinkType(b.iri);
        const labelA = model.locale.formatLabel(aData?.data?.label, a.iri);
        const labelB = model.locale.formatLabel(bData?.data?.label, b.iri);
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

export async function validateLinkType(
    currentLink: LinkModel,
    originalLink: LinkModel,
    workspace: WorkspaceContext,
    signal: AbortSignal | undefined
): Promise<Pick<LinkValue, 'error' | 'allowChange'>> {
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
    if (isRelationOnDiagram(model, currentLink) && !editor.temporaryState.links.has(currentLink)) {
        return {
            error: t.text('visual_authoring.select_relation.validation.error_duplicate'),
            allowChange: false,
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
