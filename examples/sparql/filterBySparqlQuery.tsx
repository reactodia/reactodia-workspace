import * as React from 'react';
import * as Reactodia from '../../src/workspace';

export class FilterBySparqlQueryPattern extends Reactodia.SearchPattern<{
    readonly initial?: boolean;
    readonly query: string;
    readonly resultItems?: readonly Reactodia.ElementIri[];
}> {
    generate(
        context: Reactodia.SearchPatternGenerateContext
    ): Reactodia.LookupPattern | Reactodia.SearchPatternError {
        const {resultItems} = this.state;
        if (!resultItems || resultItems.length === 0) {
            return {
                type: 'error',
                errors: [{
                    target: this,
                    message: resultItems
                        ? 'Query result is empty'
                        : 'Query has not been run yet',
                }],
            };
        }
        
        return {
            type: 'fromValues',
            values: resultItems,
        };
    }

    static readonly fromJSONType: RawFilterBySparqlQuery['@type'] =
        'FilterBySparqlQuery';

    static fromJSON(
        raw: RawFilterBySparqlQuery,
        context: Reactodia.SearchPatternFromJsonContext
    ): FilterBySparqlQueryPattern {
        const {query, resultItems} = raw;
        return new FilterBySparqlQueryPattern({query, resultItems});
    }

    toJSON(context: Reactodia.SearchPatternToJsonContext): RawFilterBySparqlQuery {
        const {query, resultItems} = this.state;
        return {
            '@type': 'FilterBySparqlQuery',
            query,
            resultItems: resultItems ? [...resultItems] : undefined,
        };
    }
}

Reactodia.SearchPattern.define(FilterBySparqlQueryPattern);

interface RawFilterBySparqlQuery {
    '@type': 'FilterBySparqlQuery';
    query: string;
    resultItems?: Reactodia.ElementIri[];
}

export const FilterBySparqlQueryCriterion:
    Reactodia.SearchCriteriaOption<FilterBySparqlQueryPattern> =
{
    type: FilterBySparqlQueryPattern,
    label: 'from SPARQL query',
    createPattern: () => new FilterBySparqlQueryPattern({initial: true, query: ''}),
    renderCriterion: props => <FilterBySparqlQuery {...props} />,
};

/**
 * Button for {@link Reactodia.InstancesSearchProps.renderCriteriaActions} which
 * opens a dialog to restrict the entity search results to the bindings
 * of a SPARQL `SELECT` query.
 */
function FilterBySparqlQuery(
    props: Reactodia.SearchCriteriaRenderProps<FilterBySparqlQueryPattern>
) {
    const {pattern, setPattern, controls, inEditMode} = props;
    const {overlay} = Reactodia.useWorkspace();
    const statusLine = (
        <span>
            One of <b>{pattern.state.resultItems?.length}</b> entities from SPARQL query
        </span>
    );
    const {onRefresh, status: refreshStatus} = useRefreshQueryResult({pattern, setPattern});

    const onEditQuery = () => {
        overlay.showDialog({
            style: {
                caption: 'Filter by SPARQL query',
                defaultSize: {width: 600, height: 500},
                resizableBy: 'all',
            },
            content: (
                <SparqlFilterForm pattern={pattern}
                    onApply={nextPattern => {
                        overlay.hideDialog();
                        setPattern(nextPattern);
                    }}
                />
            ),
        });
    };

    React.useEffect(() => {
        if (pattern.state.initial) {
            onEditQuery();
            setPattern(new FilterBySparqlQueryPattern({
                ...pattern.state,
                initial: undefined,
            }));
        }
    }, [pattern.state]);

    if (!inEditMode) {
        return statusLine;
    }

    return (
        <Reactodia.SearchCriterionBlock target={pattern}
            controls={controls}
            header={
                pattern.state.resultItems
                    ? statusLine
                    : 'Restrict to the entities bound by a SPARQL query'
            }>
            <div style={{display: 'flex', gap: 5, flexWrap: 'wrap'}}>
                <button type='button'
                    className='reactodia-btn reactodia-btn-default'
                    style={{padding: 2}}
                    onClick={onEditQuery}>
                    Edit SPARQL query…
                </button>
                <button type='button'
                    className='reactodia-btn reactodia-btn-default'
                    style={{padding: 2}}
                    disabled={!pattern.state.query}
                    onClick={onRefresh}>
                    {refreshStatus === 'loading'
                        ? 'Refreshing…' : 'Refresh results'}
                </button>
            </div>
            {refreshStatus === 'error' ? (
                <div style={{color: 'var(--reactodia-color-danger)'}}>
                    Failed to refresh query results
                </div>
            ) : null}
        </Reactodia.SearchCriterionBlock>
    );
}

function SparqlFilterForm(props: {
    pattern: FilterBySparqlQueryPattern;
    onApply: (nextPattern: FilterBySparqlQueryPattern) => void;
}) {
    const {onApply} = props;
    const {model} = Reactodia.useWorkspace();
    const [query, setQuery] = React.useState(loadLastQuery);
    const [querying, setQuerying] = React.useState(false);
    const [error, setError] = React.useState<string | undefined>();
    const cancellation = React.useRef<AbortController>();
    React.useEffect(() => () => cancellation.current?.abort(), []);

    const canSubmit = query.trim().length > 0 && !querying;
    const submit = async () => {
        const {dataProvider} = model;
        if (!(dataProvider instanceof Reactodia.SparqlDataProvider)) {
            setError('The workspace is not connected to a SPARQL endpoint.');
            return;
        }
        cancellation.current?.abort();
        const controller = new AbortController();
        cancellation.current = controller;
        setQuerying(true);
        setError(undefined);
        try {
            const resultItems = await queryElementIris(dataProvider, query, controller.signal);
            if (controller.signal.aborted) {
                return;
            }
            storeLastQuery(query);
            onApply(new FilterBySparqlQueryPattern({query, resultItems}));
        } catch (err) {
            if (controller.signal.aborted) {
                return;
            }
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            if (!controller.signal.aborted) {
                setQuerying(false);
            }
        }
    };

    return (
        <div className='reactodia-form'>
            <div className='reactodia-form__body'
                style={{display: 'flex', flexDirection: 'column'}}>
                <div className='reactodia-form__control-row'
                    style={{flex: 'auto', display: 'flex', flexDirection: 'column'}}>
                    <label htmlFor='sparqlFilterQuery'>
                        SPARQL <code>SELECT</code> query
                    </label>
                    <textarea id='sparqlFilterQuery'
                        className='reactodia-form-control'
                        style={{flex: 'auto', fontFamily: 'monospace', resize: 'none'}}
                        placeholder={
                            'The entities bound to the first projected variable ' +
                            'restrict the search results, in addition to the other criteria.'
                        }
                        autoFocus
                        spellCheck={false}
                        value={query}
                        onChange={e => setQuery(e.currentTarget.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && e.ctrlKey && canSubmit) {
                                void submit();
                            }
                        }}
                    />
                    {error ? (
                        <div className='reactodia-form__control-error'
                            style={{
                                position: 'static',
                                whiteSpace: 'pre-wrap',
                                overflowWrap: 'anywhere',
                            }}>
                            {error}
                        </div>
                    ) : null}
                </div>
                <div className='reactodia-form__control-row'>
                    The query is sent to the connected endpoint as is (with the graphs
                    of the connection). Up to {MAX_RESULT_ITEMS} distinct IRIs from its
                    results are used; add a <code>LIMIT</code> for larger result sets.
                </div>
            </div>
            <div className='reactodia-form__controls'>
                <button className='reactodia-btn reactodia-btn-primary'
                    type='button'
                    disabled={!canSubmit}
                    title='Run the query and apply its results as a filter (Ctrl+Enter)'
                    onClick={() => void submit()}>
                    {querying ? 'Querying…' : 'Apply'}
                </button>
            </div>
        </div>
    );
}

function useRefreshQueryResult(params: {
    pattern: FilterBySparqlQueryPattern;
    setPattern: (nextPattern: FilterBySparqlQueryPattern) => void;
}): {
    onRefresh: () => Promise<void>;
    status: 'loading' | 'error' | undefined;
} {
    const {pattern, setPattern} = params;

    const [status, setStatus] = React.useState<'loading' | 'error' | undefined>();
    const cancellation = React.useRef<AbortController>();
    React.useEffect(() => () => cancellation.current?.abort(), []);
    const {model} = Reactodia.useWorkspace();

    const onRefresh = React.useCallback(async () => {
        const {dataProvider} = model;
        if (!(dataProvider instanceof Reactodia.SparqlDataProvider)) {
            setStatus('error');
            return;
        }
        cancellation.current?.abort();
        const controller = new AbortController();
        cancellation.current = controller;
        setStatus('loading');
        try {
            const {query} = pattern.state;
            const resultItems = await queryElementIris(
                dataProvider,
                query,
                controller.signal
            );
            if (controller.signal.aborted) {
                return;
            }
            setStatus(undefined);
            setPattern(new FilterBySparqlQueryPattern({query, resultItems}));
        } catch (err) {
            if (controller.signal.aborted) {
                return;
            }
            setStatus('error');
        }
    }, [model, pattern]);

    return {onRefresh, status};
}

const MAX_RESULT_ITEMS = 500;

async function queryElementIris(
    dataProvider: Reactodia.SparqlDataProvider,
    query: string,
    signal: AbortSignal
): Promise<ReadonlyArray<Reactodia.ElementIri>> {
    const variableMatch = /SELECT[^?]*\?(.+?)\b/ig.exec(query);
    if (!variableMatch) {
        throw new Error('The query projects no variables.');
    }
    const variable = variableMatch[1];

    type Binding = Record<string, Reactodia.Rdf.Term>;
    const response = await dataProvider.executeSparqlSelect<Binding>(
        query, {signal}
    );

    const elementIris = new Set<Reactodia.ElementIri>();
    for (const binding of response.results.bindings) {
        const term = binding[variable];
        if (term && term.termType === 'NamedNode') {
            elementIris.add(term.value);
        }
        if (elementIris.size >= MAX_RESULT_ITEMS) {
            break;
        }
    }
    return Array.from(elementIris);
}

const LAST_QUERY_SESSION_KEY = 'reactodia-sparql-filter-query';

function loadLastQuery(): string {
    try {
        return sessionStorage.getItem(LAST_QUERY_SESSION_KEY) ?? '';
    } catch (e) {
        return '';
    }
}

function storeLastQuery(query: string): void {
    try {
        sessionStorage.setItem(LAST_QUERY_SESSION_KEY, query);
    } catch (e) {
        /* ignore */
    }
}
