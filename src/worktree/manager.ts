import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execa } from 'execa';
import type { WorktreeInfo } from './types.js';

const activeWorktrees = new Map<string, WorktreeInfo>();

function worktreeDir(): string {
    return resolve(process.cwd(), 'worktrees');
}

export async function createWorktree(
    agentId: string,
    taskId: string,
): Promise<WorktreeInfo> {
    const branch = `task/${taskId}`;
    const path = resolve(worktreeDir(), `${agentId}-${taskId}`);

    await execa('git', ['worktree', 'add', path, '-b', branch], {
        cwd: process.cwd(),
    });

    const info: WorktreeInfo = {
        path,
        branch,
        agentId,
        taskId,
        createdAt: Date.now(),
    };

    activeWorktrees.set(taskId, info);
    return info;
}

export async function removeWorktree(taskId: string): Promise<void> {
    const info = activeWorktrees.get(taskId);
    if (!info) return;

    if (existsSync(info.path)) {
        await execa('git', ['worktree', 'remove', info.path, '--force'], {
            cwd: process.cwd(),
        });
    }

    activeWorktrees.delete(taskId);
}

export async function mergeWorktree(
    taskId: string,
    _targetBranch: string = 'main',
): Promise<string> {
    const info = activeWorktrees.get(taskId);
    if (!info) throw new Error(`No worktree for task ${taskId}`);

    const result = await execa(
        'git',
        ['merge', info.branch, '--no-ff', '-m', `Merge ${info.branch}`],
        {
            cwd: process.cwd(),
            reject: false,
        },
    );

    if (result.exitCode !== 0) {
        throw new Error(`Merge conflict on ${info.branch}: ${result.stderr}`);
    }

    return result.stdout;
}

export function getActiveWorktrees(): WorktreeInfo[] {
    return Array.from(activeWorktrees.values());
}

export function getWorktreeForTask(taskId: string): WorktreeInfo | undefined {
    return activeWorktrees.get(taskId);
}

export function _clearActiveWorktrees(): void {
    activeWorktrees.clear();
}
