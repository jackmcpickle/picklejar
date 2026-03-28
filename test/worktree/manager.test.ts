import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execaSync } from 'execa';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    createWorktree,
    removeWorktree,
    mergeWorktree,
    getActiveWorktrees,
    getWorktreeForTask,
    _clearActiveWorktrees,
} from '../../src/worktree/manager.js';
import { createTempGitRepo, cleanupTempRepo } from '../helpers/git.js';

let repo: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    repo = createTempGitRepo();
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(repo);
    _clearActiveWorktrees();
});

afterEach(() => {
    cwdSpy.mockRestore();
    _clearActiveWorktrees();
    cleanupTempRepo(repo);
});

describe('createWorktree', () => {
    it('creates worktree directory at expected path', async () => {
        const info = await createWorktree('agent-1', 'task-1');
        expect(existsSync(info.path)).toBe(true);
    });

    it('creates branch with task/ prefix', async () => {
        const info = await createWorktree('agent-1', 'task-2');
        expect(info.branch).toBe('task/task-2');

        const branches = execaSync('git', ['branch', '-a'], { cwd: repo });
        expect(branches.stdout).toContain('task/task-2');
    });

    it('returns WorktreeInfo with correct fields', async () => {
        const info = await createWorktree('agent-x', 'task-y');
        expect(info.agentId).toBe('agent-x');
        expect(info.taskId).toBe('task-y');
        expect(info.branch).toBe('task/task-y');
        expect(info.path).toBe(resolve(repo, 'worktrees', 'agent-x-task-y'));
        expect(info.createdAt).toBeTypeOf('number');
    });

    it('registers in activeWorktrees map', async () => {
        await createWorktree('agent-1', 'task-3');
        const active = getActiveWorktrees();
        expect(active).toHaveLength(1);
        expect(active[0].taskId).toBe('task-3');
    });

    it('throws on duplicate branch', async () => {
        await createWorktree('agent-1', 'task-dup');
        await expect(createWorktree('agent-2', 'task-dup')).rejects.toThrow();
    });
});

describe('removeWorktree', () => {
    it('removes existing worktree', async () => {
        const info = await createWorktree('agent-1', 'task-rm');
        expect(existsSync(info.path)).toBe(true);

        await removeWorktree('task-rm');
        expect(existsSync(info.path)).toBe(false);
    });

    it('removes from activeWorktrees map', async () => {
        await createWorktree('agent-1', 'task-rm2');
        expect(getActiveWorktrees()).toHaveLength(1);

        await removeWorktree('task-rm2');
        expect(getActiveWorktrees()).toHaveLength(0);
    });

    it('silently returns for unknown taskId', async () => {
        await expect(removeWorktree('nonexistent')).resolves.toBeUndefined();
    });
});

describe('mergeWorktree', () => {
    it('merges branch into current', async () => {
        const info = await createWorktree('agent-1', 'task-merge');

        // Create a commit in the worktree
        execaSync('sh', ['-c', 'echo "new file" > merge-test.txt'], {
            cwd: info.path,
        });
        execaSync('git', ['add', '-A'], { cwd: info.path });
        execaSync('git', ['commit', '-m', 'worktree commit'], {
            cwd: info.path,
        });

        const result = await mergeWorktree('task-merge');
        expect(result).toContain('Merge');
    });

    it('throws for unknown taskId', async () => {
        await expect(mergeWorktree('unknown')).rejects.toThrow(
            'No worktree for task',
        );
    });
});

describe('getActiveWorktrees', () => {
    it('returns empty array when no worktrees', () => {
        expect(getActiveWorktrees()).toEqual([]);
    });

    it('returns all created worktrees', async () => {
        await createWorktree('a1', 't1');
        await createWorktree('a2', 't2');
        const active = getActiveWorktrees();
        expect(active).toHaveLength(2);
        expect(active.map((w) => w.taskId).sort()).toEqual(['t1', 't2']);
    });
});

describe('getWorktreeForTask', () => {
    it('returns WorktreeInfo for known taskId', async () => {
        await createWorktree('agent-1', 'task-find');
        const info = getWorktreeForTask('task-find');
        expect(info).toBeDefined();
        expect(info!.agentId).toBe('agent-1');
    });

    it('returns undefined for unknown taskId', () => {
        expect(getWorktreeForTask('nope')).toBeUndefined();
    });
});
