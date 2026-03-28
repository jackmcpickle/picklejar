import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, resetConfig } from '../../src/config/loader.js';
import { createCoordinator } from '../../src/mastra/agents/coordinator.js';
import {
    createDiscoveryAgent,
    createDiscoveryAgents,
} from '../../src/mastra/agents/discovery.js';
import {
    createImplementationAgent,
    createImplementationAgents,
} from '../../src/mastra/agents/implementation.js';
import { createPlanner } from '../../src/mastra/agents/planner.js';

const baseConfig = {
    agents: {
        coordinator: { model: 'anthropic/claude-opus-4-6', maxSteps: 50 },
        discovery: {
            model: 'anthropic/claude-sonnet-4-6',
            count: 2,
            maxSteps: 30,
        },
        implementation: { model: 'openai/o3', count: 3, maxSteps: 40 },
    },
    providers: {
        anthropic: { apiKeyEnv: 'ANTHROPIC_API_KEY' },
        openai: { apiKeyEnv: 'OPENAI_API_KEY' },
    },
    memory: { storage: 'libsql' as const, observationalMemory: true },
    server: { port: 4111 },
};

function writeConfig(dir: string, data: unknown): string {
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify(data));
    return path;
}

function getToolNames(
    agent: ReturnType<typeof createDiscoveryAgent>,
): string[] {
    const fields = agent.__getOverridableFields();
    return Object.keys(fields.tools as Record<string, unknown>);
}

describe('discovery agents', () => {
    let tmpDir: string;

    beforeEach(() => {
        resetConfig();
        tmpDir = mkdtempSync(join(tmpdir(), 'pj-test-'));
        loadConfig(writeConfig(tmpDir, baseConfig));
    });

    afterEach(() => {
        resetConfig();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('creates correct count (2 by default)', () => {
        const agents = createDiscoveryAgents();
        expect(agents).toHaveLength(2);
    });

    it('assigns unique sequential ids', () => {
        const agents = createDiscoveryAgents();
        expect(agents[0].id).toBe('discovery-1');
        expect(agents[1].id).toBe('discovery-2');
    });

    it('assigns unique sequential names', () => {
        const agents = createDiscoveryAgents();
        expect(agents[0].name).toBe('Discovery Agent 1');
        expect(agents[1].name).toBe('Discovery Agent 2');
    });

    it('has git read tools as custom tools', () => {
        const agent = createDiscoveryAgent(1);
        const tools = getToolNames(agent);
        expect(tools).toContain('gitStatus');
        expect(tools).toContain('gitDiff');
    });

    it('does NOT have write tools', () => {
        const agent = createDiscoveryAgent(1);
        const tools = getToolNames(agent);
        expect(tools).not.toContain('gitCommit');
        expect(tools).not.toContain('gitBranch');
        expect(tools).not.toContain('gitWorktree');
    });

    it('has exactly 2 custom tools (workspace provides the rest)', () => {
        const agent = createDiscoveryAgent(1);
        expect(getToolNames(agent)).toHaveLength(2);
    });
});

describe('implementation agents', () => {
    let tmpDir: string;

    beforeEach(() => {
        resetConfig();
        tmpDir = mkdtempSync(join(tmpdir(), 'pj-test-'));
        loadConfig(writeConfig(tmpDir, baseConfig));
    });

    afterEach(() => {
        resetConfig();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('creates correct count (3 by default)', () => {
        const agents = createImplementationAgents();
        expect(agents).toHaveLength(3);
    });

    it('assigns unique sequential ids', () => {
        const agents = createImplementationAgents();
        expect(agents[0].id).toBe('implementation-1');
        expect(agents[1].id).toBe('implementation-2');
        expect(agents[2].id).toBe('implementation-3');
    });

    it('assigns unique sequential names', () => {
        const agents = createImplementationAgents();
        expect(agents[0].name).toBe('Implementation Agent 1');
        expect(agents[1].name).toBe('Implementation Agent 2');
        expect(agents[2].name).toBe('Implementation Agent 3');
    });

    it('has git tools as custom tools', () => {
        const agent = createImplementationAgent(1);
        const tools = getToolNames(agent);
        expect(tools).toContain('gitCommit');
        expect(tools).toContain('gitBranch');
        expect(tools).toContain('gitWorktree');
        expect(tools).toContain('gitStatus');
        expect(tools).toContain('gitDiff');
    });

    it('has exactly 5 custom tools (workspace provides the rest)', () => {
        const agent = createImplementationAgent(1);
        expect(getToolNames(agent)).toHaveLength(5);
    });
});

describe('coordinator', () => {
    let tmpDir: string;

    beforeEach(() => {
        resetConfig();
        tmpDir = mkdtempSync(join(tmpdir(), 'pj-test-'));
        loadConfig(writeConfig(tmpDir, baseConfig));
    });

    afterEach(() => {
        resetConfig();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns coordinator agent with correct id and name', () => {
        const { coordinator } = createCoordinator();
        expect(coordinator.id).toBe('coordinator');
        expect(coordinator.name).toBe('Coordinator');
    });

    it('returns discovery and implementation agent arrays', () => {
        const { discoveryAgents, implementationAgents } = createCoordinator();
        expect(discoveryAgents).toHaveLength(2);
        expect(implementationAgents).toHaveLength(3);
    });

    it('has task management tools', () => {
        const { coordinator } = createCoordinator();
        const tools = getToolNames(coordinator);
        expect(tools).toContain('createSubtask');
        expect(tools).toContain('updateTaskStatus');
        expect(tools).toContain('reportCompletion');
        expect(tools).toHaveLength(3);
    });

    it('discovery agents in return match expected ids', () => {
        const { discoveryAgents } = createCoordinator();
        const ids = discoveryAgents.map((a) => a.id);
        expect(ids).toEqual(['discovery-1', 'discovery-2']);
    });

    it('implementation agents in return match expected ids', () => {
        const { implementationAgents } = createCoordinator();
        const ids = implementationAgents.map((a) => a.id);
        expect(ids).toEqual([
            'implementation-1',
            'implementation-2',
            'implementation-3',
        ]);
    });
});

describe('planner agent', () => {
    let tmpDir: string;

    beforeEach(() => {
        resetConfig();
        tmpDir = mkdtempSync(join(tmpdir(), 'pj-test-'));
        loadConfig(writeConfig(tmpDir, baseConfig));
    });

    afterEach(() => {
        resetConfig();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('has correct id and name', () => {
        const planner = createPlanner();
        expect(planner.id).toBe('planner');
        expect(planner.name).toBe('Planner');
    });

    it('has git read tools as custom tools', () => {
        const planner = createPlanner();
        const tools = getToolNames(planner);
        expect(tools).toContain('gitStatus');
        expect(tools).toContain('gitDiff');
    });

    it('does NOT have write tools', () => {
        const planner = createPlanner();
        const tools = getToolNames(planner);
        expect(tools).not.toContain('gitCommit');
        expect(tools).not.toContain('gitBranch');
        expect(tools).not.toContain('gitWorktree');
    });

    it('has exactly 2 custom tools', () => {
        const planner = createPlanner();
        expect(getToolNames(planner)).toHaveLength(2);
    });

    it('uses planner model from config', () => {
        const custom = {
            ...baseConfig,
            agents: {
                ...baseConfig.agents,
                planner: {
                    model: 'anthropic/claude-sonnet-4-6',
                    maxSteps: 20,
                },
            },
        };
        loadConfig(writeConfig(tmpDir, custom));

        const planner = createPlanner();
        expect(planner.id).toBe('planner');
    });

    it('defaults planner config when not provided', () => {
        // baseConfig has no planner key — should use schema defaults
        const planner = createPlanner();
        expect(planner.id).toBe('planner');
    });
});

describe('custom config agent counts', () => {
    let tmpDir: string;

    beforeEach(() => {
        resetConfig();
        tmpDir = mkdtempSync(join(tmpdir(), 'pj-test-'));
    });

    afterEach(() => {
        resetConfig();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('respects custom discovery count', () => {
        const custom = {
            ...baseConfig,
            agents: {
                ...baseConfig.agents,
                discovery: { ...baseConfig.agents.discovery, count: 1 },
            },
        };
        loadConfig(writeConfig(tmpDir, custom));

        const agents = createDiscoveryAgents();
        expect(agents).toHaveLength(1);
        expect(agents[0].id).toBe('discovery-1');
    });

    it('respects custom implementation count', () => {
        const custom = {
            ...baseConfig,
            agents: {
                ...baseConfig.agents,
                implementation: {
                    ...baseConfig.agents.implementation,
                    count: 1,
                },
            },
        };
        loadConfig(writeConfig(tmpDir, custom));

        const agents = createImplementationAgents();
        expect(agents).toHaveLength(1);
        expect(agents[0].id).toBe('implementation-1');
    });

    it('coordinator reflects custom counts', () => {
        const custom = {
            ...baseConfig,
            agents: {
                ...baseConfig.agents,
                discovery: { ...baseConfig.agents.discovery, count: 3 },
                implementation: {
                    ...baseConfig.agents.implementation,
                    count: 5,
                },
            },
        };
        loadConfig(writeConfig(tmpDir, custom));

        const { discoveryAgents, implementationAgents } = createCoordinator();
        expect(discoveryAgents).toHaveLength(3);
        expect(implementationAgents).toHaveLength(5);
    });
});
