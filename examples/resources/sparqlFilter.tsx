import * as React from 'react';
import * as Reactodia from '../../src/workspace';

const LAST_QUERY_SESSION_KEY = 'reactodia-sparql-filter-query';
/**
 * Upper bound for the candidate set: the IRIs are inlined into the lookup
 * query as a `VALUES` block, which is sent as a GET request.
 */
const MAX_CANDIDATES = 500;

/**
 * Button for {@link Reactodia.InstancesSearchProps.renderCriteriaActions} which
 * opens a dialog to restrict the entity search results to the bindings
 * of a SPARQL `SELECT` query.
 */
export function SparqlFilterAction(props: {
    context: Reactodia.CriteriaActionsContext;
}) {
    const {context} = props;
    const workspace = Reactodia.useWorkspace();
    return (
        <button type='button'
            className='reactodia-btn reactodia-btn-default'
            style={{margin: '0 10px 4px 10px'}}
            title='Restrict the results to the entities bound by a SPARQL query'
            onClick={() => showSparqlFilterDialog(context, workspace)}>
            Filter by SPARQL query…
        </button>
    );
}

export function showSparqlFilterDialog(
    context: Reactodia.CriteriaActionsContext,
    workspace: Reactodia.WorkspaceContext
): void {
    const {overlay} = workspace;
    overlay.showDialog({
        style: {
            caption: 'Filter by SPARQL query',
            defaultSize: {width: 600, height: 500},
            resizableBy: 'all',
        },
        content: (
            <SparqlFilterForm
                onApply={elementIris => {
                    overlay.hideDialog();
                    context.setCriteria({...context.criteria, elementIris});
                }}
            />
        ),
    });
}

export function SparqlFilterForm(props: {
    onApply: (elementIris: ReadonlyArray<Reactodia.ElementIri>) => void;
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
            const elementIris = await queryElementIris(dataProvider, query, controller.signal);
            if (controller.signal.aborted) {
                return;
            }
            storeLastQuery(query);
            onApply(elementIris);
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
                            style={{position: 'static', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>
                            {error}
                        </div>
                    ) : null}
                </div>
                <div className='reactodia-form__control-row'>
                    The query is sent to the connected endpoint as is (with the graphs
                    of the connection). Up to {MAX_CANDIDATES} distinct IRIs from its
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

async function queryElementIris(
    dataProvider: Reactodia.SparqlDataProvider,
    query: string,
    signal: AbortSignal
): Promise<ReadonlyArray<Reactodia.ElementIri>> {
    const response = await dataProvider.executeSparqlSelect<Record<string, Reactodia.Rdf.Term>>(
        query, {signal}
    );
    const variable = response.head.vars[0];
    if (!variable) {
        throw new Error('The query projects no variables.');
    }
    const elementIris = new Set<Reactodia.ElementIri>();
    for (const binding of response.results.bindings) {
        const term = binding[variable];
        if (term && term.termType === 'NamedNode') {
            elementIris.add(term.value);
        }
        if (elementIris.size >= MAX_CANDIDATES) {
            break;
        }
    }
    return Array.from(elementIris);
}

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
