import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        include: ['test/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: [
                'src/cli.ts',
                'src/mastra/index.ts',
                'src/mastra/tools/index.ts',
                'src/worktree/types.ts',
                'src/tasks/types.ts',
            ],
            thresholds: {
                statements: 70,
                branches: 65,
                functions: 75,
                lines: 70,
            },
            reporter: ['text', 'html', 'lcov'],
        },
    },
});
