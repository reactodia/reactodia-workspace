import { hashNumber, hashString, chainHash, dropHighestNonSignBit } from '@reactodia/hashmap';
import * as React from 'react';

/**
 * Represents a keyboard press sequence expression for a hotkey.
 *
 * The valid hotkey expression is at least one or more modifiers and the key separated by `+`,
 * e.g. `Ctrl+Alt+K`, `Alt+Meta+Q`, `Ctrl+/`:
 *   - modifier is one of `Mod`, `Ctrl`, `Meta`, `Alt`, `Shift`
 *    (`Mod` is `Meta` on Mac and `Ctrl` everywhere else).
 *   - key is a [KeyboardEvent.key](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key)
 *     with a special case for `A-Z` keys to handle them independently of an active keyboard layout.
 *   - single-letter keys are matched case-insensitively, so `Ctrl+Shift+a` is the same as `Ctrl+Shift+A`.
 *   - `Shift`-specific special keys needs to be specified as-is i.e. `Shift+5` will not be triggered and
 *     should be specified as `Shift+%` (and only for keyboard layouts with that mapping).
 *
 * @category Core
 * @see {@link useCanvasHotkey}
 */
export type HotkeyString = `${'Mod' | 'Ctrl' | 'Meta' | 'Alt' | 'Shift' | 'None'}+${Capitalize<string>}`;

export interface HotkeyAst {
    readonly modifiers: HotkeyModifier;
    readonly key: string;
}

export const enum HotkeyModifier {
    None = 0,
    Ctrl = 1,
    Meta = 2,
    Alt = 4,
    Shift = 8,
}

const IsMac = /Mac|iPhone|iPad/.test(window?.navigator?.platform || '');

/**
 * Parses a keyboard hotkey sequence to an AST.
 */
export function parseHotkey(hotkey: HotkeyString): HotkeyAst {
    const parts = hotkey.split('+');

    let modifiers = HotkeyModifier.None;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        switch (part) {
            case 'Ctrl': {
                modifiers |= HotkeyModifier.Ctrl;
                break;
            }
            case 'Meta': {
                modifiers |= HotkeyModifier.Meta;
                break;
            }
            case 'Alt': {
                modifiers |= HotkeyModifier.Alt;
                break;
            }
            case 'Shift': {
                modifiers |= HotkeyModifier.Shift;
                break;
            }
            case 'Mod': {
                modifiers |= IsMac ? HotkeyModifier.Meta : HotkeyModifier.Ctrl;
                break;
            }
            case 'None': {
                /* ignore */
                break;
            }
            default: {
                throw new Error(`Unknown hotkey modifier "${part}"`);
            }
        }
    }

    const key = parts[parts.length - 1];
    if (!key) {
        throw new Error('Missing main key for a hotkey');
    }

    return {
        modifiers,
        key: key.length === 1 ? key.toLowerCase() : key,
    };
}

export function formatHotkey(ast: HotkeyAst): string {
    const {modifiers, key} = ast;
    let result = '';
    if (modifiers & HotkeyModifier.Ctrl) {
        result += 'Ctrl+';
    }
    if (modifiers & HotkeyModifier.Meta) {
        result += '⌘+';
    }
    if (modifiers & HotkeyModifier.Alt) {
        result += 'Alt+';
    }
    if (modifiers & HotkeyModifier.Shift) {
        result += 'Shift+';
    }
    result += key.length === 1 ? key.toUpperCase() : key;
    return result;
}

export function sameHotkeyAst(a: HotkeyAst, b: HotkeyAst): boolean {
    return (
        a.modifiers === b.modifiers &&
        a.key === b.key
    );
}

export function hashHotkeyAst(ast: HotkeyAst): number {
    return dropHighestNonSignBit(chainHash(
        hashNumber(ast.modifiers),
        hashString(ast.key)
    ));
}

export function eventToHotkeyAst(e: React.KeyboardEvent | KeyboardEvent): HotkeyAst {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const keyIsLetter = /^[a-z]$/.test(key);
    const codeMatch = /^Key([A-Z])$/.exec(e.code);
    const codeKey = codeMatch ? codeMatch[1].toLowerCase() : undefined;
    return {
        modifiers: (
            (e.ctrlKey ? HotkeyModifier.Ctrl : HotkeyModifier.None) |
            (e.metaKey ? HotkeyModifier.Meta : HotkeyModifier.None) |
            (e.altKey ? HotkeyModifier.Alt : HotkeyModifier.None) |
            (e.shiftKey ? HotkeyModifier.Shift : HotkeyModifier.None)
        ),
        key: codeKey && !keyIsLetter ? codeKey : key,
    };
}
