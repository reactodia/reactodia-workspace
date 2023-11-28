module.exports = {
    'env': {
        'browser': true,
        'es2021': true
    },
    'extends': [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:react/recommended'
    ],
    'overrides': [
        {
            'env': {
                'node': true
            },
            'files': [
                '.eslintrc.{js,cjs}'
            ],
            'parserOptions': {
                'sourceType': 'script'
            }
        },
        {
            'env': {
                'node': true
            },
            'files': ['*.config.js'],
            'rules': {
                'indent': ['warn', 2, {
                    'flatTernaryExpressions': true,
                    'SwitchCase': 1,
                }],
            }
        }
    ],
    'parser': '@typescript-eslint/parser',
    'parserOptions': {
        'ecmaVersion': 'latest',
        'sourceType': 'module'
    },
    'plugins': [
        '@typescript-eslint',
        'react'
    ],
    'settings': {
        'react': {
            'pragma': 'React',
            'fragment': 'Fragment',
            'version': '17.0'
        }
    },
    'rules': {
        'indent': ['warn', 4, {
            'flatTernaryExpressions': true,
            'SwitchCase': 1,
        }],
        'no-console': ['warn', {'allow': ['warn', 'error']}],
        'no-constant-condition': ['error', {'checkLoops': false}],
        'no-control-regex': 'off',
        'quotes': ['warn', 'single'],
        'semi': ['warn', 'always'],

        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-namespace': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-var-requires': 'off',
    },
};
