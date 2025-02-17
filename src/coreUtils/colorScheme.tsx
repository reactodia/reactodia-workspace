import * as React from 'react';

export type ColorScheme = 'light' | 'dark';

export const ColorSchemeContext = React.createContext<ColorScheme>('light');

/**
 * React hook to get currently active color scheme for the UI components.
 *
 * @category Hooks
 * @see {@link WorkspaceRootProps.colorScheme}
 */
export function useColorScheme(): 'light' | 'dark' {
    return React.useContext(ColorSchemeContext);
}

export interface ColorSchemeApi {
    readonly actInColorScheme: (scheme: ColorScheme, action: () => void) => void;
}

export const ColorSchemeApi = React.createContext<ColorSchemeApi>({
    actInColorScheme: () => {/* nothing */},
});
