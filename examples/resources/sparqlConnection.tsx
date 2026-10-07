import * as React from 'react';
import * as Reactodia from '../../src/workspace';

import { getHashQuery, setHashQueryParams } from './common';

export interface SparqlConnectionSettings {
    readonly endpointUrl: string;
    /**
     * Named graph IRIs to restrict all queries to, applied via the SPARQL 1.1 Protocol
     * `default-graph-uri` parameters: the queried default graph is the merge of these
     * graphs (requires the endpoint to support dataset specification via protocol
     * parameters).
     *
     * If the schema (class and property declarations) is stored separately
     * from the instance data, list both graphs, otherwise there will be
     * no link types to display.
     */
    readonly defaultGraphIris?: ReadonlyArray<string>;
    /**
     * Username for HTTP Basic authentication on the endpoint.
     */
    readonly username?: string;
    /**
     * Password for HTTP Basic authentication on the endpoint.
     */
    readonly password?: string;
}

const CREDENTIALS_SESSION_KEY = 'reactodia-sparql-credentials';
const RECENT_CONNECTIONS_KEY = 'reactodia-sparql-recent-connections';
const RECENT_CONNECTIONS_LIMIT = 8;

/**
 * Connection settings without the password, as remembered in the recent
 * connections list ({@link localStorage}, shared between browser tabs).
 *
 * An entry with a user-assigned {@link label} is pinned: it is never evicted
 * from the list, so named configurations accumulate without limit while
 * unnamed ones rotate through the most recent few.
 */
interface RecentConnection {
    readonly endpointUrl: string;
    readonly defaultGraphIris?: ReadonlyArray<string>;
    readonly username?: string;
    readonly label?: string;
}

function connectionKey(connection: RecentConnection): string {
    return JSON.stringify([
        connection.endpointUrl,
        connection.defaultGraphIris ?? [],
        connection.username ?? '',
    ]);
}

function loadRecentConnections(): RecentConnection[] {
    try {
        const stored = localStorage.getItem(RECENT_CONNECTIONS_KEY);
        const parsed = stored ? JSON.parse(stored) as RecentConnection[] : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function storeRecentConnections(connections: ReadonlyArray<RecentConnection>): void {
    try {
        localStorage.setItem(RECENT_CONNECTIONS_KEY, JSON.stringify(connections));
    } catch (e) {
        /* ignore */
    }
}

function rememberRecentConnection(settings: SparqlConnectionSettings): void {
    const entry: RecentConnection = {
        endpointUrl: settings.endpointUrl,
        defaultGraphIris: settings.defaultGraphIris,
        username: settings.username,
    };
    const entryKey = connectionKey(entry);
    const existing = loadRecentConnections();
    const previous = existing.find(other => connectionKey(other) === entryKey);
    // The limit applies to unnamed entries only; named ones are pinned
    let unnamedCount = 0;
    const connections = [
        {...entry, label: previous?.label},
        ...existing.filter(other => connectionKey(other) !== entryKey),
    ].filter(connection => connection.label
        ? true
        : ++unnamedCount <= RECENT_CONNECTIONS_LIMIT
    );
    storeRecentConnections(connections);
}

function formatRecentConnection(recent: RecentConnection): string {
    if (recent.label) {
        return recent.label;
    }
    const host = URL.canParse(recent.endpointUrl)
        ? new URL(recent.endpointUrl).host : recent.endpointUrl;
    const graphCount = recent.defaultGraphIris?.length ?? 0;
    return [
        host,
        graphCount > 0 ? `${graphCount} graph${graphCount === 1 ? '' : 's'}` : undefined,
        recent.username,
    ].filter(Boolean).join(' · ');
}

/**
 * Restores connection settings persisted by {@link saveConnectionSettings}:
 * the endpoint URL and graph IRI from the URL hash, the credentials
 * from the tab-scoped session storage.
 */
export function loadConnectionSettings(): SparqlConnectionSettings | undefined {
    const params = getHashQuery();
    const endpointUrl = params?.get('sparql-endpoint');
    if (!endpointUrl) {
        return undefined;
    }
    const defaultGraphIris = parseGraphIris(params?.get('sparql-graph') ?? '');
    let username: string | undefined;
    let password: string | undefined;
    try {
        const storedCredentials = sessionStorage.getItem(CREDENTIALS_SESSION_KEY);
        if (storedCredentials) {
            const credentials = JSON.parse(storedCredentials) as {
                endpointUrl?: string;
                username?: string;
                password?: string;
            };
            // The hash is editable and shareable, so attach the stored
            // credentials only to the endpoint they were entered for,
            // never to whatever endpoint a pasted link happens to name
            if (credentials.endpointUrl === endpointUrl) {
                username = credentials.username;
                password = credentials.password;
            }
        }
    } catch (e) {
        /* ignore */
    }
    const settings: SparqlConnectionSettings = {endpointUrl, defaultGraphIris, username, password};
    // A connection activated from a bookmarked or restored URL should appear
    // in the saved list the same as one submitted through the dialog
    rememberRecentConnection(settings);
    return settings;
}

export function saveConnectionSettings(settings: SparqlConnectionSettings): void {
    setHashQueryParams({
        'sparql-endpoint': settings.endpointUrl,
        'sparql-graph': settings.defaultGraphIris?.join(' ') ?? null,
    });
    rememberRecentConnection(settings);
    // Credentials are kept out of the URL hash to avoid leaking them via
    // browser history or copied links; session storage is tab-scoped and
    // cleared when the tab is closed.
    try {
        if (settings.username) {
            sessionStorage.setItem(CREDENTIALS_SESSION_KEY, JSON.stringify({
                endpointUrl: settings.endpointUrl,
                username: settings.username,
                password: settings.password,
            }));
        } else {
            sessionStorage.removeItem(CREDENTIALS_SESSION_KEY);
        }
    } catch (e) {
        /* ignore */
    }
}

export function parseGraphIris(text: string): ReadonlyArray<string> | undefined {
    // Whitespace only: comma is a legal IRI character (RFC 3987 sub-delims)
    const iris = text.split(/\s+/).filter(iri => iri.length > 0);
    return iris.length > 0 ? iris : undefined;
}

/**
 * Computes {@link Reactodia.SparqlDataProviderOptions} part for the connection settings:
 * the endpoint URL with `default-graph-uri` parameters if graph IRIs are set,
 * and a query function sending the `Authorization` header if credentials are set.
 */
export function createConnectionOptions(
    settings: SparqlConnectionSettings
): Pick<Reactodia.SparqlDataProviderOptions, 'endpointUrl' | 'queryFunction'> {
    const {endpointUrl, defaultGraphIris, username, password} = settings;

    let effectiveEndpointUrl = endpointUrl;
    for (const graphIri of defaultGraphIris ?? []) {
        const separator = effectiveEndpointUrl.includes('?') ? '&' : '?';
        effectiveEndpointUrl +=
            `${separator}default-graph-uri=${encodeURIComponent(graphIri)}`;
    }

    let queryFunction: Reactodia.SparqlQueryFunction | undefined;
    if (username) {
        const authorization = `Basic ${encodeBase64(`${username}:${password ?? ''}`)}`;
        queryFunction = params => fetch(params.url, {
            method: params.method,
            body: params.body,
            credentials: 'same-origin',
            mode: 'cors',
            cache: 'default',
            headers: {
                ...params.headers,
                'Authorization': authorization,
            },
            signal: params.signal,
        });
    }

    return {endpointUrl: effectiveEndpointUrl, queryFunction};
}

function encodeBase64(text: string): string {
    // btoa() alone throws on characters outside the Latin-1 range
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

export function SparqlConnectionAction(props: {
    settings: SparqlConnectionSettings | undefined;
    applySettings: (settings: SparqlConnectionSettings) => void;
}) {
    const {settings, applySettings} = props;
    if (!settings) {
        return null;
    }
    const context = Reactodia.useWorkspace();
    const endpointUrl = URL.canParse(settings.endpointUrl)
        ? new URL(settings.endpointUrl) : undefined;
    return (
        <Reactodia.ToolbarAction
            onSelect={() => showConnectionDialog(settings, applySettings, context)}>
            SPARQL endpoint: <code>{endpointUrl?.host ?? settings.endpointUrl}</code>
            {settings.defaultGraphIris?.length
                ? ` (${settings.defaultGraphIris.length} graph${settings.defaultGraphIris.length === 1 ? '' : 's'})`
                : null}
        </Reactodia.ToolbarAction>
    );
}

export function showConnectionDialog(
    initialSettings: SparqlConnectionSettings | undefined,
    applySettings: (settings: SparqlConnectionSettings) => void,
    context: Reactodia.WorkspaceContext
): void {
    const {overlay} = context;
    overlay.showDialog({
        style: {
            caption: 'SPARQL connection settings',
            defaultSize: {width: 400, height: 600},
            resizableBy: 'all',
            closable: Boolean(initialSettings),
        },
        content: (
            <SparqlConnectionForm
                initialSettings={initialSettings}
                onSubmit={settings => {
                    overlay.hideDialog();
                    applySettings(settings);
                }}
            />
        ),
    });
}

export function SparqlConnectionForm(props: {
    initialSettings: SparqlConnectionSettings | undefined;
    onSubmit: (settings: SparqlConnectionSettings) => void;
}) {
    const {initialSettings, onSubmit} = props;
    const [draft, setDraft] = React.useState(() => ({
        endpointUrl: initialSettings?.endpointUrl ?? '',
        graphText: initialSettings?.defaultGraphIris?.join(' ') ?? '',
        username: initialSettings?.username ?? '',
        password: initialSettings?.password ?? '',
    }));
    const [recentConnections, setRecentConnections] = React.useState(loadRecentConnections);
    const passwordInputRef = React.useRef<HTMLInputElement>(null);
    const [focusPasswordToken, setFocusPasswordToken] = React.useState(0);
    React.useEffect(() => {
        if (focusPasswordToken > 0) {
            passwordInputRef.current?.focus();
        }
    }, [focusPasswordToken]);
    const applyRecentConnection = (recent: RecentConnection) => {
        if (recent.username) {
            // Passwords are deliberately not remembered: fill the form and
            // point the user at the field that still needs a value
            setDraft({
                endpointUrl: recent.endpointUrl,
                graphText: recent.defaultGraphIris?.join(' ') ?? '',
                username: recent.username,
                password: '',
            });
            setFocusPasswordToken(token => token + 1);
        } else {
            onSubmit({
                endpointUrl: recent.endpointUrl,
                defaultGraphIris: recent.defaultGraphIris,
            });
        }
    };
    const nameRecentConnection = (index: number) => {
        const connection = recentConnections[index];
        const label = window.prompt(
            'Name this connection (leave empty to unname it):',
            connection.label ?? ''
        );
        if (label === null) {
            return;
        }
        const renamed = recentConnections.map((other, i) => i === index
            ? {...other, label: label.trim() || undefined}
            : other);
        setRecentConnections(renamed);
        storeRecentConnections(renamed);
    };
    const forgetRecentConnection = (index: number) => {
        const remaining = recentConnections.filter((_, i) => i !== index);
        setRecentConnections(remaining);
        storeRecentConnections(remaining);
    };
    const isValidEndpoint = draft.endpointUrl.length === 0 || URL.canParse(draft.endpointUrl);
    const invalidGraph = (parseGraphIris(draft.graphText) ?? [])
        .find(iri => !URL.canParse(iri));
    const canSubmit = draft.endpointUrl.length > 0 && isValidEndpoint && !invalidGraph;
    const submitSettings = () => onSubmit({
        endpointUrl: draft.endpointUrl,
        defaultGraphIris: parseGraphIris(draft.graphText),
        username: draft.username || undefined,
        password: draft.password || undefined,
    });
    const submitOnEnter = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && canSubmit) {
            submitSettings();
        }
    };
    return (
        <div className='reactodia-form'>
            <div className='reactodia-form__body'
                style={{overflowY: 'auto'}}>
                <div className='reactodia-form__control-row'>
                    <label htmlFor='sparqlEndpointUrl'>Endpoint URL</label>
                    <input id='sparqlEndpointUrl'
                        type='input'
                        className='reactodia-form-control'
                        placeholder='SPARQL endpoint URL'
                        autoFocus
                        value={draft.endpointUrl}
                        onChange={e => {
                            const endpointUrl = e.currentTarget.value;
                            setDraft(previous => ({...previous, endpointUrl}));
                        }}
                        onKeyDown={submitOnEnter}
                    />
                    {isValidEndpoint ? null : (
                        <div className={'reactodia-form__control-error'}>
                            Invalid URL
                        </div>
                    )}
                </div>
                <div className='reactodia-form__control-row'>
                    <label htmlFor='sparqlDefaultGraph'>Named graph IRIs (optional)</label>
                    <input id='sparqlDefaultGraph'
                        type='input'
                        className='reactodia-form-control'
                        placeholder='Space-separated; empty queries the whole dataset'
                        value={draft.graphText}
                        onChange={e => {
                            const graphText = e.currentTarget.value;
                            setDraft(previous => ({...previous, graphText}));
                        }}
                        onKeyDown={submitOnEnter}
                    />
                    {invalidGraph ? (
                        <div className={'reactodia-form__control-error'}>
                            Invalid graph IRI: {invalidGraph}
                        </div>
                    ) : null}
                </div>
                <div className='reactodia-form__control-row'>
                    <label htmlFor='sparqlUsername'>Username (optional)</label>
                    <input id='sparqlUsername'
                        type='input'
                        className='reactodia-form-control'
                        placeholder='Username for HTTP Basic authentication'
                        autoComplete='username'
                        value={draft.username}
                        onChange={e => {
                            const username = e.currentTarget.value;
                            setDraft(previous => ({...previous, username}));
                        }}
                        onKeyDown={submitOnEnter}
                    />
                </div>
                <div className='reactodia-form__control-row'>
                    <label htmlFor='sparqlPassword'>Password</label>
                    <input id='sparqlPassword'
                        ref={passwordInputRef}
                        type='password'
                        className='reactodia-form-control'
                        autoComplete='current-password'
                        disabled={!draft.username}
                        value={draft.password}
                        onChange={e => {
                            const password = e.currentTarget.value;
                            setDraft(previous => ({...previous, password}));
                        }}
                        onKeyDown={submitOnEnter}
                    />
                </div>
                {recentConnections.length === 0 ? null : (
                    <div className='reactodia-form__control-row'>
                        <label>Saved and recent connections</label>
                        {recentConnections.map((recent, index) => (
                            <div key={index}
                                style={{display: 'flex', gap: 4, marginBottom: 4}}>
                                <button type='button'
                                    className='reactodia-btn reactodia-btn-default'
                                    style={{
                                        flex: 'auto',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                    title={[
                                        recent.username
                                            ? 'Fill the connection form (the password will need to be re-entered)'
                                            : 'Connect',
                                        recent.endpointUrl,
                                        ...(recent.defaultGraphIris ?? []),
                                        ...(recent.username ? [`user: ${recent.username}`] : []),
                                    ].join('\n')}
                                    onClick={() => applyRecentConnection(recent)}>
                                    {formatRecentConnection(recent)}
                                </button>
                                <button type='button'
                                    className='reactodia-btn reactodia-btn-default'
                                    title={'Name this connection to pin it permanently' +
                                        (recent.label ? ` (currently: ${recent.label})` : '')}
                                    onClick={() => nameRecentConnection(index)}>
                                    ✎
                                </button>
                                <button type='button'
                                    className='reactodia-btn reactodia-btn-default'
                                    title='Forget this connection'
                                    onClick={() => forgetRecentConnection(index)}>
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <div className='reactodia-form__control-row'>
                    A public SPARQL endpoint will work only if it is configured
                    to allow cross-origin queries (CORS headers, including
                    the <code>Authorization</code> header when credentials are used).
                    Credentials are sent with each request and kept only
                    for the current browser tab.
                </div>
                <div className='reactodia-form__control-row'>
                    If the schema is stored separately from the data, list both
                    graphs, otherwise there will be no link types to display.
                    Naming a connection (✎) keeps it in the list permanently;
                    unnamed ones rotate through the most recent few.
                </div>
            </div>
            <div className='reactodia-form__controls'>
                <button className='reactodia-btn reactodia-btn-primary'
                    type='button'
                    disabled={!canSubmit}
                    onClick={submitSettings}>
                    Connect
                </button>
            </div>
        </div>
    );
}
