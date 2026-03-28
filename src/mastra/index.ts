import { existsSync, mkdirSync } from 'node:fs';
import { Mastra } from '@mastra/core';
import type { Agent } from '@mastra/core/agent';
import { LibSQLStore } from '@mastra/libsql';
import { loadConfig } from '../config/loader.js';
import { apiRoutes } from '../server/routes.js';
import { createCoordinator } from './agents/coordinator.js';
import { createPlanner } from './agents/planner.js';
import { createPlanningWorkflow } from './workflows/planning.js';

const config = loadConfig();
const { coordinator, discoveryAgents, implementationAgents } =
    createCoordinator();
const planner = createPlanner();

const agents: Record<string, Agent> = { coordinator, planner };
for (const agent of discoveryAgents) {
    agents[agent.name] = agent;
}
for (const agent of implementationAgents) {
    agents[agent.name] = agent;
}

// Create planning workflow with agent instances
const planningWorkflow = createPlanningWorkflow(discoveryAgents[0], planner);

if (!existsSync('.mastra')) {
    mkdirSync('.mastra', { recursive: true });
}

export const mastra = new Mastra({
    agents,
    workflows: { planningWorkflow },
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
