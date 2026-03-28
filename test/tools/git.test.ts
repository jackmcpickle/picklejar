import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execaSync } from 'execa';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    gitStatus,
    gitDiff,
    gitCommit,
    gitBranch,
    gitWorktree,
} from '../../src/mastra/tools/git.js';
import { createTempGitRepo, cleanupTempRepo } from '../helpers/git.js';

let repo: string;

beforeEach(() => {
    repo = createTempGitRepo();
});

afterEach(() => {
    cleanupTempRepo(repo);
});

describe('gitStatus', () => {
    it('returns empty status for clean repo', async () => {
        const result = await gitStatus.execute!({ cwd: repo }, {} as any);
        expect(result.status).toBe('');
    });

    it('returns modified files after edit', async () => {
        writeFileSync(join(repo, '.gitkeep'), 'changed');
        const result = await gitStatus.execute!({ cwd: repo }, {} as any);
        expect(result.status).toContain('.gitkeep');
        expect(result.status).toMatch(/M/);
    });

    it('returns untracked files', async () => {
        writeFileSync(join(repo, 'new.txt'), 'hello');
        const result = await gitStatus.execute!({ cwd: repo }, {} as any);
        expect(result.status).toContain('new.txt');
        expect(result.status).toMatch(/\?\?/);
    });

    it('respects cwd parameter', async () => {
        const repo2 = createTempGitRepo();
        writeFileSync(join(repo2, 'only-in-repo2.txt'), 'x');

        const result = await gitStatus.execute!({ cwd: repo2 }, {} as any);
        expect(result.status).toContain('only-in-repo2.txt');

        const result1 = await gitStatus.execute!({ cwd: repo }, {} as any);
        expect(result1.status).not.toContain('only-in-repo2.txt');

        cleanupTempRepo(repo2);
    });
});

describe('gitDiff', () => {
    it('returns empty diff for clean repo', async () => {
        const result = await gitDiff.execute!({ cwd: repo }, {} as any);
        expect(result.diff).toBe('');
    });

    it('returns diff of unstaged changes', async () => {
        writeFileSync(join(repo, '.gitkeep'), 'modified content');
        const result = await gitDiff.execute!({ cwd: repo }, {} as any);
        expect(result.diff).toContain('modified content');
    });

    it('returns staged diff when staged=true', async () => {
        writeFileSync(join(repo, '.gitkeep'), 'staged content');
        execaSync('git', ['add', '.gitkeep'], { cwd: repo });

        const result = await gitDiff.execute!(
            { cwd: repo, staged: true },
            {} as any,
        );
        expect(result.diff).toContain('staged content');
    });

    it('returns empty when staged=true but changes are unstaged', async () => {
        writeFileSync(join(repo, '.gitkeep'), 'unstaged');

        const result = await gitDiff.execute!(
            { cwd: repo, staged: true },
            {} as any,
        );
        expect(result.diff).toBe('');
    });
});

describe('gitCommit', () => {
    it('commits all changes when files not specified', async () => {
        writeFileSync(join(repo, 'a.txt'), 'a');
        writeFileSync(join(repo, 'b.txt'), 'b');

        const result = await gitCommit.execute!(
            { message: 'add files', cwd: repo },
            {} as any,
        );

        expect(result.hash).toMatch(/^[0-9a-f]{7,}$/);
        const status = execaSync('git', ['status', '--short'], { cwd: repo });
        expect(status.stdout).toBe('');
    });

    it('commits only specified files', async () => {
        writeFileSync(join(repo, 'staged.txt'), 'yes');
        writeFileSync(join(repo, 'unstaged.txt'), 'no');

        await gitCommit.execute!(
            { message: 'partial', files: ['staged.txt'], cwd: repo },
            {} as any,
        );

        const status = execaSync('git', ['status', '--short'], {
            cwd: repo,
        });
        expect(status.stdout).toContain('unstaged.txt');
        // staged.txt was committed, should not appear in status
        expect(status.stdout).not.toMatch(/\bstaged\.txt\b/);
    });

    it('returns short hash of new commit', async () => {
        writeFileSync(join(repo, 'x.txt'), 'x');
        const result = await gitCommit.execute!(
            { message: 'test hash', cwd: repo },
            {} as any,
        );

        const head = execaSync('git', ['rev-parse', '--short', 'HEAD'], {
            cwd: repo,
        });
        expect(result.hash).toBe(head.stdout.trim());
    });

    it('creates commit with correct message', async () => {
        writeFileSync(join(repo, 'msg.txt'), 'msg');
        await gitCommit.execute!(
            { message: 'my commit message', cwd: repo },
            {} as any,
        );

        const log = execaSync('git', ['log', '-1', '--format=%s'], {
            cwd: repo,
        });
        expect(log.stdout).toBe('my commit message');
    });
});

describe('gitBranch', () => {
    it('creates new branch with create=true', async () => {
        const result = await gitBranch.execute!(
            { name: 'feature/test', create: true, cwd: repo },
            {} as any,
        );

        expect(result.branch).toBe('feature/test');
        const current = execaSync('git', ['branch', '--show-current'], {
            cwd: repo,
        });
        expect(current.stdout).toBe('feature/test');
    });

    it('switches to existing branch', async () => {
        execaSync('git', ['checkout', '-b', 'other'], { cwd: repo });
        execaSync('git', ['checkout', 'main'], { cwd: repo });

        const result = await gitBranch.execute!(
            { name: 'other', cwd: repo },
            {} as any,
        );

        expect(result.branch).toBe('other');
        const current = execaSync('git', ['branch', '--show-current'], {
            cwd: repo,
        });
        expect(current.stdout).toBe('other');
    });

    it('throws when switching to non-existent branch', async () => {
        await expect(
            gitBranch.execute!(
                { name: 'does-not-exist', cwd: repo },
                {} as any,
            ),
        ).rejects.toThrow();
    });
});

describe('gitWorktree', () => {
    it('adds worktree with branch and path', async () => {
        const wtPath = join(repo, '..', 'wt-test');
        const result = await gitWorktree.execute!(
            {
                action: 'add',
                branch: 'wt-branch',
                path: wtPath,
                cwd: repo,
            },
            {} as any,
        );

        expect(result.result).toContain(wtPath);
        expect(result.worktreePath).toBe(wtPath);
        expect(existsSync(wtPath)).toBe(true);

        // cleanup
        execaSync('git', ['worktree', 'remove', wtPath, '--force'], {
            cwd: repo,
        });
    });

    it('lists worktrees', async () => {
        const result = await gitWorktree.execute!(
            { action: 'list', cwd: repo },
            {} as any,
        );

        expect(result.result).toContain('main');
    });

    it('removes worktree', async () => {
        const wtPath = join(repo, '..', 'wt-remove');
        execaSync('git', ['worktree', 'add', wtPath, '-b', 'rm-branch'], {
            cwd: repo,
        });

        const result = await gitWorktree.execute!(
            { action: 'remove', path: wtPath, cwd: repo },
            {} as any,
        );

        expect(result.result).toContain(wtPath);
        expect(existsSync(wtPath)).toBe(false);
    });

    it('throws when add called without branch', async () => {
        await expect(
            gitWorktree.execute!(
                { action: 'add', path: '/tmp/x', cwd: repo },
                {} as any,
            ),
        ).rejects.toThrow('branch and path required');
    });

    it('throws when add called without path', async () => {
        await expect(
            gitWorktree.execute!(
                { action: 'add', branch: 'b', cwd: repo },
                {} as any,
            ),
        ).rejects.toThrow('branch and path required');
    });

    it('throws when remove called without path', async () => {
        await expect(
            gitWorktree.execute!({ action: 'remove', cwd: repo }, {} as any),
        ).rejects.toThrow('path required');
    });
});
