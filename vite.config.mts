/// <reference types="vitest/config" /> 
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type UserConfig, defineConfig } from 'vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import { playwright } from '@vitest/browser-playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EXAMPLES = [
    'basic',
    'classicWorkspace',
    'graphAuthoring',
    'i18n',
    'rdfExplorer',
    'sparql',
    'stressTest',
    'styleCustomization',
    'wikidata'
];

export default defineConfig(({ command, mode }) => {
    const common = {
        mode: 'development',
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, './index.html'),
                    ...Object.fromEntries(EXAMPLES.map(example =>
                        [example, resolve(__dirname, `./examples/${example}.html`)] as const
                    ))
                },
            },
        },
        resolve: {
            alias: {
                '@images': resolve(__dirname, './images'),
                '@codicons': '@vscode/codicons/src/icons/',
            }
        },
        css: {
            modules: {
                generateScopedName: '[name]__[local]',
            }
        },
        define: {
            '__REACTODIA_EXAMPLES__': JSON.stringify(EXAMPLES),
            '__REACTODIA_WIKIDATA_ENDPOINT__': JSON.stringify(
                process.env.WIKIDATA_ENDPOINT ?? 'https://query.wikidata.org/sparql'
            ),
        },
    } satisfies UserConfig;

    if (mode === 'test') {
        // Config to run unit tests with Vitest
        return {
            ...common,
            build: {
                ...common.build,
                rollupOptions: undefined,
                assetsInlineLimit: (path, _content) => (
                    /.resource.svg$/.test(path) ? false :
                    /.inline.svg$/.test(path) ? true :
                    undefined
                ),
            },
            test: {
                browser: {
                    provider: playwright(),
                    enabled: true,
                    screenshotFailures: false,
                    instances: [
                        {browser: 'chromium'},
                    ],
                },
            },
            // To avoid warning about reloading due to
            // "new dependencies optimized: react/jsx-dev-runtime":
            optimizeDeps: {
                include: [
                    'react/jsx-dev-runtime',
                ]
            },
        };
    } else if (process.env.BUILD_EXAMPLES) {
        // Config to build static assets from examples
        return {
            ...common,
            build: {
                ...common.build,
                chunkSizeWarningLimit: 2048,
            },
        };
    } else {
        // Config to build the library or locally develop it with examples
        return {
            ...common,
            plugins: [
                cssInjectedByJsPlugin({
                    jsAssetsFilterFunction: outputChunk => outputChunk.fileName === 'workspace.js'
                }),
            ],
            build: {
                ...common.build,
                lib: {
                    entry: {
                        'workspace': resolve(__dirname, './src/workspace'),
                        'layout-sync': resolve(__dirname, './src/layout-sync'),
                        'legacy-styles': resolve(__dirname, './src/legacy-styles'),
                        'layout.worker': resolve(__dirname, './src/layout.worker'),
                    },
                    formats: ['es'],
                },
                rollupOptions: {
                    ...common.build.rollupOptions,
                    input: command === 'serve'
                        ? common.build.rollupOptions.input
                        : undefined,
                    external: [
                        '@reactodia/hashmap',
                        '@reactodia/worker-proxy',
                        '@reactodia/worker-proxy/protocol',
                        'clsx',
                        'd3-color',
                        'file-saver',
                        'n3',
                        'react',
                        'react/jsx-runtime',
                        'react-dom',
                    ],
                },
                minify: false,
                cssMinify: true,
                sourcemap: true,
            },
            define: command === 'serve' ? common.define : undefined,
            server: {
                port: 10555,
                proxy: {
                    '/sparql': {
                        target: process.env.SPARQL_ENDPOINT ?? '/sparql',
                        changeOrigin: true,
                        rewrite: (path) => path.replace(/^\/sparql/, ''),
                    },
                    '/wikidata': {
                        target: process.env.WIKIDATA_ENDPOINT ?? '/wikidata',
                        changeOrigin: true,
                        rewrite: (path) => path.replace(/^\/wikidata/, ''),
                    },
                }
            },
        };
    }
});
