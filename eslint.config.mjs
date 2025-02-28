import globals from 'globals';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';

export default tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    react.configs.flat.recommended,
    react.configs.flat['jsx-runtime'],
    {
        ignores: ['dist/'],
    },
    {
        plugins: {
            react,
        },
        settings: {
            react: {
                pragma: 'React',
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
            '@typescript-eslint/no-empty-object-type': ['warn', {
                allowInterfaces: 'with-single-extends',
                allowWithName: 'Props$',
            }],
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-namespace': 'off',
            '@typescript-eslint/no-require-imports': ['warn', {
                allow: ['\\.(json|scss|svg|ttl)$'],
            }],
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-var-requires': 'off',
        },
    },
    {
        files: ['**/eslint.config.mjs', '**/*.config.mts'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
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
            '@typescript-eslint/no-require-imports': 'off',
        },
    }
);
