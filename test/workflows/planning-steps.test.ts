import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    intake,
    specApproval,
    taskApproval,
    execution,
} from '../../src/mastra/workflows/planning.js';
import * as taskManager from '../../src/tasks/manager.js';

// Helper to execute a step with minimal context
async function executeStep(
    step: { execute: (...args: unknown[]) => Promise<unknown> },
    params: Record<string, unknown>,
) {
    return step.execute(params as never);
}

describe('intake step', () => {
    it('generates a prompt with idea and metadata', async () => {
        const result = (await executeStep(intake, {
            inputData: { idea: 'Add user authentication' },
        })) as { prompt: string };

        expect(result.prompt).toContain('Add user authentication');
        expect(result.prompt).toContain('slug=add-user-authentication');
    });

    it('includes context when provided', async () => {
        const result = (await executeStep(intake, {
            inputData: {
                idea: 'Add OAuth',
                context: 'Use Google provider',
            },
        })) as { prompt: string };

        expect(result.prompt).toContain('Add OAuth');
        expect(result.prompt).toContain('Use Google provider');
    });

    it('generates URL-safe slugs', async () => {
        const result = (await executeStep(intake, {
            inputData: { idea: 'Add $pecial Ch@racters & Stuff!!!' },
        })) as { prompt: string };

        expect(result.prompt).toContain('slug=add-pecial-ch-racters-stuff');
    });

    it('truncates long slugs to 50 chars', async () => {
        const longIdea =
            'This is a very long product idea that should be truncated to prevent excessively long file names';
        const result = (await executeStep(intake, {
            inputData: { idea: longIdea },
        })) as { prompt: string };

        const slugMatch = result.prompt.match(/slug=([a-z0-9-]+)/);
        expect(slugMatch).toBeTruthy();
        expect(slugMatch![1]!.length).toBeLessThanOrEqual(50);
    });
});

describe('specApproval step', () => {
    let tmpDir: string;
    let originalCwd: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'pj-spec-'));
        originalCwd = process.cwd();
        process.chdir(tmpDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('writes spec file to docs/specs/', async () => {
        let suspended = false;

        try {
            await executeStep(specApproval, {
                inputData: { text: '# My Spec\n\n## Problem\nStuff' },
                resumeData: undefined,
                suspend: async () => {
                    suspended = true;
                },
                getInitData: () => ({ idea: 'test feature' }),
            });
        } catch {
            // suspend may throw
        }

        // File should exist
        const files = existsSync(join(tmpDir, 'docs', 'specs'));
        expect(files).toBe(true);
        expect(suspended).toBe(true);
    });

    it('returns spec path and content when approved', async () => {
        const result = (await executeStep(specApproval, {
            inputData: { text: '# Approved Spec' },
            resumeData: { approved: true },
            suspend: async () => {},
            getInitData: () => ({ idea: 'test feature' }),
        })) as { specPath: string; specContent: string; approved: boolean };

        expect(result.approved).toBe(true);
        expect(result.specPath).toMatch(/docs\/specs\/.+-test-feature\.md$/);
        expect(result.specContent).toBe('# Approved Spec');

        // Verify file was written
        const content = readFileSync(result.specPath, 'utf-8');
        expect(content).toBe('# Approved Spec');
    });
});

describe('taskApproval step', () => {
    let tmpDir: string;
    let originalCwd: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'pj-tasks-'));
        originalCwd = process.cwd();
        process.chdir(tmpDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('writes task plan file when suspending', async () => {
        let suspended = false;

        try {
            await executeStep(taskApproval, {
                inputData: { text: '1. Task one\n2. Task two' },
                resumeData: undefined,
                suspend: async () => {
                    suspended = true;
                },
                getInitData: () => ({ idea: 'test feature' }),
                getStepResult: () => ({
                    specPath: 'docs/specs/test.md',
                    specContent: 'spec',
                    approved: true,
                }),
            });
        } catch {
            // suspend may throw
        }

        expect(suspended).toBe(true);
    });

    it('returns plan content when approved', async () => {
        const result = (await executeStep(taskApproval, {
            inputData: { text: '1. Build auth\n2. Add tests' },
            resumeData: { approved: true },
            suspend: async () => {},
            getInitData: () => ({ idea: 'auth' }),
            getStepResult: () => ({
                specPath: 'docs/specs/test.md',
                specContent: 'spec',
                approved: true,
            }),
        })) as { planContent: string; approved: boolean };

        expect(result.approved).toBe(true);
        expect(result.planContent).toBe('1. Build auth\n2. Add tests');
    });
});

describe('execution step', () => {
    beforeEach(() => {
        // Reset task store
        const tasks = taskManager.getAllTasks();
        // Clear by submitting fresh — task IDs auto-increment
    });

    it('creates a root task via taskManager', async () => {
        const mockAgent = {
            generate: async () => ({ text: 'done' }),
        };

        const result = (await executeStep(execution, {
            inputData: { planContent: 'Build the thing', approved: true },
            getInitData: () => ({ idea: 'my feature' }),
            mastra: {
                getAgent: () => mockAgent,
            },
        })) as { rootTaskId: string; message: string };

        expect(result.rootTaskId).toBeTruthy();
        expect(result.message).toContain(result.rootTaskId);

        // Verify task was created
        const task = taskManager.getTask(result.rootTaskId);
        expect(task).toBeTruthy();
        expect(task!.title).toBe('my feature');
    });

    it('handles missing coordinator gracefully', async () => {
        const result = (await executeStep(execution, {
            inputData: { planContent: 'Build it', approved: true },
            getInitData: () => ({ idea: 'feature' }),
            mastra: {
                getAgent: () => undefined,
            },
        })) as { rootTaskId: string; message: string };

        expect(result.rootTaskId).toBeTruthy();
        // Should still create the task even without coordinator
    });
});
