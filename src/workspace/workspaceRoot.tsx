import * as React from 'react';
import classnames from 'classnames';

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
     * Specifies a theme for the components.
     *
     * If set to `auto`, the component will track the following places in order:
     *  - `<html data-theme="...">` attribute in case it is set to `dark`;
     *  - `(prefers-color-scheme: dark)` media query matches;
     *  - fallback to the default `light` theme otherwise.
     *
     * @default "auto"
     */
    theme?: 'auto' | 'light' | 'dark';
}

const CLASS_NAME = 'reactodia-workspace';

/**
 * Component to establish inheritable style defaults for the workspace.
 *
 * @category Components
 */
export function WorkspaceRoot(props: WorkspaceRootProps) {
    const {theme = 'auto'} = props;

    const htmlTheme = useAutoTheme(theme === 'auto');
    let effectiveTheme = theme;
    if (effectiveTheme === 'auto') {
        effectiveTheme = htmlTheme === 'dark' ? 'dark' : 'light';
    }

    return (
        <div className={classnames(CLASS_NAME, props.className)}
            style={props.style}
            data-theme={effectiveTheme}>
            {props.children}
        </div>
    );
}

function useAutoTheme(track: boolean): string {
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
