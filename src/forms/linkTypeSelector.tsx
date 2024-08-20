import * as React from 'react';

import { mapAbortedToNull } from '../coreUtils/async';
import { EventObserver } from '../coreUtils/events';

import { ElementModel, LinkModel, LinkDirection, LinkTypeIri, equalLinks } from '../data/model';
import { PLACEHOLDER_LINK_TYPE } from '../data/schema';

import { HtmlSpinner } from '../diagram/spinner';

import type { DataDiagramModel } from '../editor/dataDiagramModel';
import { RelationLink, LinkType } from '../editor/dataElements';

import { WorkspaceContext } from '../workspace/workspaceContext';

const CLASS_NAME = 'reactodia-edit-form';

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
        const {model, editor: {metadataApi}} = this.context;
        const {source, target} = this.props;
        if (!metadataApi) {
            return;
        }
        const linkTypes = await mapAbortedToNull(
            metadataApi.possibleLinkTypes(source, target, this.cancellation.signal),
            this.cancellation.signal
        );
        if (linkTypes === null) { return; }
        const dataLinkTypes: DirectedDataLinkType[] = [];
        linkTypes.forEach(({linkTypeIri, direction}) => {
            dataLinkTypes.push({iri: linkTypeIri, direction});
        });
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
        const {model} = this.context;
        const {source, target} = this.props;
        const data = model.getLinkType(iri);
        const label = model.locale.formatLabel(data?.data?.label, iri);
        let [sourceLabel, targetLabel] = [source, target].map(element =>
            model.locale.formatLabel(element.label, element.id)
        );
        if (direction === 'in') {
            [sourceLabel, targetLabel] = [targetLabel, sourceLabel];
        }
        return <option key={index} value={index}>{label} [{sourceLabel} &rarr; {targetLabel}]</option>;
    };

    render() {
        const {linkValue, disabled} = this.props;
        const {dataLinkTypes} = this.state;
        const value = (dataLinkTypes ?? []).findIndex(({iri, direction}) =>
            iri === linkValue.value.link.linkTypeId && direction === linkValue.value.direction
        );
        return (
            <div className={`${CLASS_NAME}__control-row`}>
                <label>Link Type</label>
                {
                    dataLinkTypes ? (
                        <select className='reactodia-form-control'
                            name='reactodia-link-type-selector-select'
                            value={value}
                            onChange={this.onChangeType}
                            disabled={disabled}>
                            <option value={-1} disabled={true}>Select link type</option>
                            {dataLinkTypes.map(this.renderPossibleLinkType)}
                        </select>
                    ) : <div><HtmlSpinner width={20} height={20} /></div>
                }
                {linkValue.error ? <span className={`${CLASS_NAME}__control-error`}>{linkValue.error}</span> : ''}
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

export function validateLinkType(
    currentLink: LinkModel,
    originalLink: LinkModel,
    {model, editor}: WorkspaceContext
): Promise<Pick<LinkValue, 'error' | 'allowChange'>> {
    if (currentLink.linkTypeId === PLACEHOLDER_LINK_TYPE) {
        return Promise.resolve({error: 'Required.', allowChange: true});
    }
    if (equalLinks(currentLink, originalLink)) {
        return Promise.resolve({error: undefined, allowChange: true});
    }
    const alreadyOnDiagram = model.links.find(link =>
        link instanceof RelationLink &&
        equalLinks(link.data, currentLink) &&
        !editor.temporaryState.links.has(currentLink)
    );
    if (alreadyOnDiagram) {
        return Promise.resolve({error: 'The link already exists.', allowChange: false});
    }
    return model.dataProvider.links({
        elementIds: [currentLink.sourceId, currentLink.targetId],
        linkTypeIds: [currentLink.linkTypeId],
    }).then((links): Pick<LinkValue, 'error' | 'allowChange'> => {
        const alreadyExists = links.some(link => equalLinks(link, currentLink));
        return alreadyExists
            ? {error: 'The link already exists.', allowChange: false}
            : {error: undefined, allowChange: true};
    });
}
