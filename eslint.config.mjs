import globals from 'globals';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';

export default tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    react.configs.flat.recommended,
    react.configs.flat['jsx-runtime'],
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['*.js', '*.mjs', 'vitest.config.mts'],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
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
            '@typescript-eslint/no-misused-promises': ['warn', {
                checksVoidReturn: false,
            }],
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
            '@typescript-eslint/prefer-promise-reject-errors': 'off',
            '@typescript-eslint/require-await': 'off',
            '@typescript-eslint/unbound-method': ['warn', {
                ignoreStatic: true,
            }],
        },
    },
    {
        files: ['**/eslint.config.mjs'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
        },
    },
    {
        files: ['**/vite.config.mts'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
);
