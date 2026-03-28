import type { PicklejarConfig } from './schema.js';

export const defaultConfig: PicklejarConfig = {
    agents: {
        coordinator: {
            model: 'anthropic/claude-opus-4-6',
            maxSteps: 50,
        },
        planner: {
            model: 'anthropic/claude-opus-4-6',
            maxSteps: 30,
        },
        discovery: {
            model: 'anthropic/claude-sonnet-4-6',
            count: 2,
            maxSteps: 30,
        },
        implementation: {
            model: 'openai/o3',
            count: 3,
            maxSteps: 40,
        },
    },
    providers: {
        anthropic: { apiKeyEnv: 'ANTHROPIC_API_KEY' },
        openai: { apiKeyEnv: 'OPENAI_API_KEY' },
    },
    memory: {
        storage: 'libsql',
        observationalMemory: true,
    },
    server: {
        port: 4111,
    },
};
