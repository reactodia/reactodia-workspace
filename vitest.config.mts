import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    css: {
        modules: {
            generateScopedName: '[name]__[local]',
        }
    },
    build: {
        assetsInlineLimit: (path, _content) => (
            /.resource.svg$/.test(path) ? false :
            /.inline.svg$/.test(path) ? true :
            undefined
        ),
    },
    resolve: {
        alias: {
            '@images': path.resolve(rootDirectory, 'images'),
            '@codicons': '@vscode/codicons/src/icons/',
        }
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
});
