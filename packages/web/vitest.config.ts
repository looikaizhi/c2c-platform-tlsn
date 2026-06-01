import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    resolve: {
        alias: [
            // `server-only` throws when loaded outside an RSC bundling pipeline.
            // Under vitest we redirect it to a no-op shim.
            {
                find: /^server-only$/,
                replacement: path.resolve(__dirname, 'src/test/serverOnlyShim.ts'),
            },
            { find: '@', replacement: path.resolve(__dirname, 'src') },
        ],
    },
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
});
