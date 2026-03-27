import { Mastra } from '@mastra/core';
import type { Agent } from '@mastra/core/agent';
import { LibSQLStore } from '@mastra/libsql';
import { createCoordinator } from './agents/coordinator.js';
import { loadConfig } from './config/loader.js';
import type { PicklejarConfig } from './config/schema.js';
import { apiRoutes } from './server/routes.js';

export function createPicklejar(configPath?: string): {
    mastra: Mastra;
    config: PicklejarConfig;
    coordinator: Agent;
    discoveryAgents: Agent[];
    implementationAgents: Agent[];
} {
    const config = loadConfig(configPath);
    const { coordinator, discoveryAgents, implementationAgents } =
        createCoordinator();

    const agents: Record<string, Agent> = {
        coordinator,
    };

    for (const agent of discoveryAgents) {
        agents[agent.name] = agent;
    }
    for (const agent of implementationAgents) {
        agents[agent.name] = agent;
    }

    const mastra = new Mastra({
        agents,
        storage: new LibSQLStore({
            id: 'picklejar-storage',
            url:
                config.memory.storage === 'libsql'
                    ? 'file:.mastra/picklejar.db'
                    : ':memory:',
        }),
        server: {
            port: config.server.port,
            apiRoutes,
        },
    });

    return {
        mastra,
        config,
        coordinator,
        discoveryAgents,
        implementationAgents,
    };
}

export { loadConfig, getConfig } from './config/loader.js';
export type { PicklejarConfig } from './config/schema.js';
