import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execaSync } from 'execa';

export function createTempGitRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'picklejar-git-test-'));
    execaSync('git', ['init', '-b', 'main'], { cwd: dir });
    execaSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
    execaSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
    writeFileSync(join(dir, '.gitkeep'), '');
    execaSync('git', ['add', '-A'], { cwd: dir });
    execaSync('git', ['commit', '-m', 'initial'], { cwd: dir });
    return dir;
}

export function cleanupTempRepo(path: string): void {
    rmSync(path, { recursive: true, force: true });
}
