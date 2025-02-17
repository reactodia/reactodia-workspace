import classnames from 'classnames';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { ColorScheme, ColorSchemeContext, ColorSchemeApi } from '../coreUtils/colorScheme';

/**
 * Props for {@link WorkspaceRoot} component.
 *
 * @see {@link WorkspaceRoot}
 */
export interface WorkspaceRootProps {
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Additional CSS styles for the component.
     */
    style?: React.CSSProperties;
    /**
     * Component children.
     */
    children: React.ReactNode;
    /**
     * Sets a color scheme for the UI components.
     *
     * If set to `auto`, the component will track the following places in order:
     *  - `<html data-theme="...">` attribute in case it is set to `dark`;
     *  - `(prefers-color-scheme: dark)` media query matches;
     *  - fallback to the default `light` color scheme otherwise.
     *
     * @default "auto"
     */
    colorScheme?: 'auto' | 'light' | 'dark';
}

const CLASS_NAME = 'reactodia-workspace';

/**
 * Component to establish inheritable style defaults for the workspace.
 *
 * @category Components
 */
export function WorkspaceRoot(props: WorkspaceRootProps) {
    const {colorScheme = 'auto'} = props;

    const preferredColorScheme = usePreferredColorScheme(colorScheme === 'auto');
    
    let effectiveColorScheme = colorScheme;
    if (effectiveColorScheme === 'auto') {
        effectiveColorScheme = preferredColorScheme === 'dark' ? 'dark' : 'light';
    }

    const [actedColorScheme, setActedColorScheme] = React.useState<ColorScheme | undefined>();
    if (actedColorScheme !== undefined) {
        effectiveColorScheme = actedColorScheme;
    }

    const colorSchemeApi = React.useMemo<ColorSchemeApi>(() => ({
        actInColorScheme: (scheme, action) => {
            ReactDOM.flushSync(() => setActedColorScheme(scheme));
            action();
            ReactDOM.flushSync(() => setActedColorScheme(undefined));
        }
    }), [setActedColorScheme]);

    return (
        <ColorSchemeApi.Provider value={colorSchemeApi}>
            <ColorSchemeContext.Provider value={effectiveColorScheme}>
                <div className={classnames(CLASS_NAME, props.className)}
                    style={props.style}
                    data-theme={effectiveColorScheme}>
                    {props.children}
                </div>
            </ColorSchemeContext.Provider>
        </ColorSchemeApi.Provider>
    );
}

function usePreferredColorScheme(track: boolean): string {
    const html = document.querySelector('html');

    const [theme, setTheme] = React.useState(() => (
        html?.getAttribute('data-theme') ??
        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : ''
    ));

    React.useEffect(() => {
        if (track) {
            const preferDarkTheme = window.matchMedia('(prefers-color-scheme: dark)');
            const updateTheme = () => {
                setTheme(
                    html?.getAttribute('data-theme') ??
                    (preferDarkTheme.matches ? 'dark' : '')
                );
            };
            preferDarkTheme.addEventListener('change', updateTheme);

            const observer = new MutationObserver(updateTheme);
            if (html) {
                observer.observe(html, {
                    attributes: true,
                    attributeFilter: ['data-theme'],
                });
            }

            return () => {
                preferDarkTheme.removeEventListener('change', updateTheme);
                observer.disconnect();
            };
        }
    }, [html, track]);

    return theme;
}
