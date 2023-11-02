// Adopted from N3.js by Ruben Verborgh: https://github.com/rdfjs/N3.js
// https://github.com/rdfjs/N3.js/blob/208aef00342a7fe2031352aef45cff9a9eb261b8/src/N3Writer.js

export function escapeRdfValue(value: string): string {
    return ESCAPE_TEST.test(value) ? value.replace(ESCAPE_TARGETS, escapeReplacer) : value;
}

const ESCAPE_TEST = /["\\\t\n\r\b\f\u0000-\u0019\ud800-\udbff]/;
const ESCAPE_TARGETS = /["\\\t\n\r\b\f\u0000-\u0019]|[\ud800-\udbff][\udc00-\udfff]/g;
const ESCAPED_CHARACTERS: { [str: string]: string | undefined } = {
    '\\': '\\\\',
    '"': '\\"',
    '\t': '\\t',
    '\n': '\\n',
    '\r': '\\r',
    '\b': '\\b',
    '\f': '\\f',
};

/**
 * Replaces a character by its escaped version
 */
function escapeReplacer(character: string) {
    // Replace a single character by its escaped version
    let result = ESCAPED_CHARACTERS[character];
    if (result === undefined) {
        if (character.length === 1) {
            // Replace a single character with its 4-bit unicode escape sequence
            result = character.charCodeAt(0).toString(16);
            result = '\\u0000'.substr(0, 6 - result.length) + result;
        } else {
            // Replace a surrogate pair with its 8-bit unicode escape sequence
            result = ((character.charCodeAt(0) - 0xD800) * 0x400 +
                character.charCodeAt(1) + 0x2400).toString(16);
            result = '\\U00000000'.substr(0, 10 - result.length) + result;
        }
    }
    return result;
}
