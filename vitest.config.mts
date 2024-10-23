/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
    test: {
        browser: {
            provider: 'playwright',
            enabled: true,
            name: 'chromium',
        },
    }
});
