import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Mastra } from '@mastra/core';
import type { Agent } from '@mastra/core/agent';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetConfig } from '../../src/config/loader.js';
import { createPicklejar } from '../../src/index.js';
import * as taskManager from '../../src/tasks/manager.js';

// E2E tests use real API keys - load from .env
process.loadEnvFile(join(import.meta.dirname, '../../.env'));

describe('e2e: full agent flow', { timeout: 120_000 }, () => {
    let tmpDir: string;
    let mastra: Mastra;
    let coordinator: Agent;
    let discoveryAgents: Agent[];

    beforeAll(() => {
        resetConfig();
        tmpDir = mkdtempSync(join(tmpdir(), 'picklejar-e2e-'));

        mkdirSync(join(tmpDir, 'src'), { recursive: true });
        writeFileSync(
            join(tmpDir, 'src', 'hello.ts'),
            'export function hello() { return "world"; }\n',
        );
        writeFileSync(
            join(tmpDir, 'package.json'),
            JSON.stringify({ name: 'test-project', version: '1.0.0' }),
        );

        const pj = createPicklejar();
        mastra = pj.mastra;
        coordinator = pj.coordinator;
        discoveryAgents = pj.discoveryAgents;
    });

    afterAll(() => {
        rmSync(tmpDir, { recursive: true, force: true });
        resetConfig();
    });

    it('coordinator agent responds to a simple task', async () => {
        const agent = mastra.getAgent('coordinator');

        const result = await agent.generate(
            `Analyze this file and tell me what function it exports: ${join(tmpDir, 'src', 'hello.ts')}`,
            {
                maxSteps: 5,
                memory: {
                    resource: 'e2e-test',
                    thread: 'test-coordinator',
                },
            },
        );

        expect(result.text).toBeTruthy();
        expect(result.text.toLowerCase()).toContain('hello');
    });

    it('discovery agent can read files', async () => {
        const agent = mastra.getAgent(discoveryAgents[0].name);

        const result = await agent.generate(
            `Read the file at ${join(tmpDir, 'src', 'hello.ts')} and tell me what it contains`,
            {
                maxSteps: 3,
            },
        );

        expect(result.text).toBeTruthy();
        expect(result.text.toLowerCase()).toContain('hello');
    });

    it('task management integrates with agent flow', async () => {
        const rootTask = taskManager.submitRootTask(
            'Analyze test project',
            `Explore the project at ${tmpDir}`,
        );

        expect(rootTask.status).toBe('pending');
        expect(rootTask.type).toBe('root');

        const subtask = taskManager.createSubtask(
            rootTask.id,
            'Read source files',
            'discovery',
            'Read all .ts files',
        );

        expect(subtask.parentId).toBe(rootTask.id);
        expect(subtask.type).toBe('discovery');

        taskManager.completeTask(
            subtask.id,
            'Found hello.ts with hello() export',
        );

        const tree = taskManager.getTaskTree(rootTask.id);
        expect(tree.subtasks).toHaveLength(1);
        expect(tree.subtasks[0].status).toBe('completed');
    });
});
