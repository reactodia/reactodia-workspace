import * as React from 'react';
import * as Reactodia from '../../src/workspace';

export interface SparqlConnectionSettings {
    readonly endpointUrl: string;
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
            defaultSize: {width: 400, height: 250},
            resizableBy: 'x',
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
    const [settings, setSettings] = React.useState<SparqlConnectionSettings>(
        initialSettings ?? {endpointUrl: ''}
    );
    const isValidEndpoint = settings.endpointUrl.length === 0 || URL.canParse(settings.endpointUrl);
    const canSubmit = settings.endpointUrl.length > 0 && isValidEndpoint;
    return (
        <div className='reactodia-form'>
            <div className='reactodia-form__body'>
                <div className='reactodia-form__control-row'>
                    <label htmlFor='sparqlEndpointUrl'>Endpoint URL</label>
                    <input id='sparqlEndpointUrl'
                        type='input'
                        className='reactodia-form-control'
                        placeholder='SPARQL endpoint URL'
                        value={settings.endpointUrl}
                        onChange={e => {
                            const endpointUrl = e.currentTarget.value;
                            setSettings(previous => ({...previous, endpointUrl}));
                        }}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && canSubmit) {
                                onSubmit(settings);
                            }
                        }}
                    />
                    {isValidEndpoint ? null : (
                        <div className={'reactodia-form__control-error'}>
                            Invalid URL
                        </div>
                    )}
                </div>
                <div className='reactodia-form__control-row'>
                    A public SPARQL endpoints will work if only if its configured
                    to allow cross-origin GET queries (CORS headers).
                </div>
            </div>
            <div className='reactodia-form__controls'>
                <button className='reactodia-btn reactodia-btn-primary'
                    type='button'
                    disabled={!canSubmit}
                    onClick={() => onSubmit(settings)}>
                    Connect
                </button>
            </div>
        </div>
    );
}
