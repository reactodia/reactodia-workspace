import * as React from 'react';

export const ColorSchemeContext = React.createContext<'light' | 'dark'>('light');

/**
 * React hook to get currently active color scheme for the UI components.
 *
 * @category Hooks
 * @see {@link WorkspaceRootProps.colorScheme}
 */
export function useColorScheme(): 'light' | 'dark' {
    return React.useContext(ColorSchemeContext);
}
