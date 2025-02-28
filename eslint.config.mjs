import path from 'node:path';
import { fileURLToPath } from 'node:url';

import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

import react from 'eslint-plugin-react';
import globals from 'globals';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [
    ...compat.extends(
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:react/recommended',
    ),
    {
        plugins: {
            '@typescript-eslint': typescriptEslint,
            react,
        },
        languageOptions: {
            globals: {
                ...globals.browser,
            },
            parser: tsParser,
            ecmaVersion: 'latest',
            sourceType: 'module',
        },
        settings: {
            react: {
                pragma: 'React',
                fragment: 'Fragment',
                version: '17.0',
            },
        },
        rules: {
            'indent': ['warn', 4, {
                flatTernaryExpressions: true,
                SwitchCase: 1,
            }],
            'no-console': ['warn', {
                allow: ['warn', 'error'],
            }],
            'no-constant-condition': ['error', {
                checkLoops: false,
            }],
            'no-control-regex': 'off',
            'quotes': ['warn', 'single'],
            'semi': ['warn', 'always'],
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-namespace': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-var-requires': 'off',
        },
    },
    {
        files: ['**/.eslintrc.{js,cjs}'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
            ecmaVersion: 5,
            sourceType: 'commonjs',
        },
    },
    {
        files: ['**/*.config.js', '**/webpackServe.js'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
        rules: {
            'indent': ['warn', 2, {
                flatTernaryExpressions: true,
                SwitchCase: 1,
            }],
        },
    }
];
