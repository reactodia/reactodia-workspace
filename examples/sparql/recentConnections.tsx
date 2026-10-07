import * as React from 'react';
import * as Reactodia from '../../src/workspace';
import cx from 'clsx';

import styles from './sparql.module.css';

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

export function RecentConnections(props: {
    current?: RecentConnection;
    onApply: (connection: RecentConnection) => void;
}) {
    const {current, onApply} = props;
    const [storedConnections, setStoredConnections] = React.useState(loadRecentConnections);
    
    let recentConnections = storedConnections;
    if (current && !recentConnections.find(other => equalRecentConnections(other, current))) {
        recentConnections = [current, ...recentConnections];
    }

    if (recentConnections.length === 0) {
        return null;
    }

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
        setStoredConnections(renamed);
        storeRecentConnections(renamed);
    };

    const forgetRecentConnection = (index: number) => {
        const remaining = recentConnections.filter((_, i) => i !== index);
        setStoredConnections(remaining);
        storeRecentConnections(remaining);
    };

    return (
        <div className='reactodia-form__control-row'>
            <label>Saved and recent connections</label>
            {recentConnections.map((recent, index) => (
                <div key={index} className={styles.recentConnection}>
                    <button type='button'
                        className={cx(
                            'reactodia-btn reactodia-btn-default',
                            styles.recentConnectionLabel
                        )}
                        title={[
                            recent.username
                                ? 'Fill the connection form (the password will need to be re-entered)'
                                : 'Connect',
                            recent.endpointUrl,
                            ...(recent.defaultGraphIris ?? []),
                            ...(recent.username ? [`user: ${recent.username}`] : []),
                        ].join('\n')}
                        onClick={() => onApply(recent)}>
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
    );
}

function equalRecentConnections(a: RecentConnection, b: RecentConnection) {
    return (
        a.endpointUrl === b.endpointUrl &&
        Reactodia.shallowArrayEqual(a.defaultGraphIris ?? [], b.defaultGraphIris ?? []) &&
        (a.username ?? '') === (b.username ?? '')
    );
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

export function rememberRecentConnection(connection: RecentConnection): void {
    const existing = loadRecentConnections();
    const previous = existing.find(other => equalRecentConnections(connection, other));
    // The limit applies to unnamed entries only; named ones are pinned
    let unnamedCount = 0;
    const connections: RecentConnection[] = [{...connection, label: previous?.label}];
    for (const other of existing) {
        if (equalRecentConnections(other, connection)) {
            continue;
        } else if (other.label || unnamedCount < RECENT_CONNECTIONS_LIMIT) {
            connections.push(other);
            if (!other.label) {
                unnamedCount++;
            }
        }
    }
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
