import * as React from 'react';

export type ColorScheme = 'light' | 'dark';

export const ColorSchemeContext = React.createContext<ColorScheme | null>(null);

/**
 * React hook to get currently active color scheme for the UI components.
 *
 * @category Hooks
 * @see {@link WorkspaceRootProps.colorScheme}
 */
export function useColorScheme(): 'light' | 'dark' {
    return React.useContext(ColorSchemeContext) ?? 'light';
}

export interface ColorSchemeApi {
    readonly defined: boolean;
    readonly actInColorScheme: (scheme: ColorScheme, action: () => void) => void;
}

export const ColorSchemeApi = React.createContext<ColorSchemeApi>({
    defined: false,
    actInColorScheme: () => {/* nothing */},
});
