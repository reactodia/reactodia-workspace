import * as React from 'react';
import * as ReactDOM from 'react-dom';

import styles from './pageControls.module.css';

function PageControls() {
    return (
        <>
            <PageSelector />
            <ThemeSettings />
        </>
    );
}

declare const __REACTODIA_EXAMPLES__: string[] | undefined;

function PageSelector() {
    const examples: string[] = __REACTODIA_EXAMPLES__ ?? [];

    const selectedValue = React.useMemo(() => {
        const pathname = window.location.pathname;
        const  separatorIndex = pathname.lastIndexOf('/');
        const page = separatorIndex >= 0 ? pathname.substring(separatorIndex + 1) : pathname;
        return page || 'index.html';
    }, []);

    return (
        <select className={styles.pageSelector}
            title="Change active example"
            value={selectedValue}
            onChange={e => {
                window.location.href = e.currentTarget.value;
            }}>
            {examples.map(example => (
                <option key={example} value={`${example}.html`}>
                    {example}
                </option>
            ))}
        </select>
    );
}

function ThemeSettings() {
    const [, forceUpdate] = React.useState({});

    const [isDarkColorQuery] = React.useState(window.matchMedia('(prefers-color-scheme: dark)'));    
    React.useEffect(() => {
        const onThemeChange = () => {
            document.documentElement.removeAttribute('data-theme');
            forceUpdate({});
        };
        isDarkColorQuery.addEventListener('change', onThemeChange);
        return () => isDarkColorQuery.removeEventListener('change', onThemeChange);
    }, [isDarkColorQuery]);

    const isDarkColorScheme = () => {
        return (
            document.documentElement.getAttribute('data-theme') === 'dark' ||
            isDarkColorQuery.matches
        );
    };

    const hasBorderRadiusZero = () =>
        document.documentElement.hasAttribute('data-border-radius-zero');

    return (
        <>
            <button className={styles.colorSchemeToggle}
                title="Toggle light or dark color scheme"
                onClick={() => {
                    document.documentElement.setAttribute(
                        'data-theme',
                        isDarkColorScheme() ? 'light' : 'dark'
                    );
                }}>
                {isDarkColorScheme() ? '☽' : '☼'}
            </button>
            <button className={styles.borderRadiusToggle}
                title="Toggle global border radius style"
                onClick={() => {
                    if (hasBorderRadiusZero()) {
                        document.documentElement.removeAttribute('data-border-radius-zero');
                    } else {
                        document.documentElement.setAttribute('data-border-radius-zero', 'true');
                    }
                }}>
                {hasBorderRadiusZero() ? '▭' : '◯'}
            </button>
        </>
    );
}

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.createElement('div');
    container.id = 'selector';
    document.body.appendChild(container);
    
    try {
        const {createRoot} = await import('react-dom/client');
        const root = createRoot(container);
        root.render(<PageControls />);
    } catch (err) {
        ReactDOM.render(<PageControls />, container);
    }
});
