import {
    mkdtempSync,
    rmSync,
    readFileSync,
    mkdirSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    readFile,
    writeFile,
    editFile,
    globFiles,
} from '../../src/tools/filesystem.js';

let tmp: string;

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'picklejar-test-'));
});

afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
});

describe('readFile', () => {
    it('reads entire file with line numbers', async () => {
        const filePath = join(tmp, 'hello.txt');
        writeFileSync(filePath, 'line1\nline2\nline3');

        const result = await readFile.execute!({ path: filePath }, {} as any);

        expect(result).toEqual({
            content: '1\tline1\n2\tline2\n3\tline3',
            totalLines: 3,
        });
    });

    it('reads line range', async () => {
        const filePath = join(tmp, 'range.txt');
        writeFileSync(filePath, 'a\nb\nc\nd\ne');

        const result = await readFile.execute!(
            { path: filePath, startLine: 2, endLine: 4 },
            {} as any,
        );

        expect(result).toEqual({
            content: '2\tb\n3\tc\n4\td',
            totalLines: 5,
        });
    });

    it('throws for non-existent file', async () => {
        await expect(
            readFile.execute!({ path: join(tmp, 'nope.txt') }, {} as any),
        ).rejects.toThrow();
    });
});

describe('writeFile', () => {
    it('creates file in existing dir', async () => {
        const filePath = join(tmp, 'out.txt');
        const result = await writeFile.execute!(
            { path: filePath, content: 'hello' },
            {} as any,
        );

        expect(result).toEqual({ success: true, path: filePath });
        expect(readFileSync(filePath, 'utf-8')).toBe('hello');
    });

    it('creates nested directories', async () => {
        const filePath = join(tmp, 'a', 'b', 'c', 'deep.txt');
        const result = await writeFile.execute!(
            { path: filePath, content: 'deep' },
            {} as any,
        );

        expect(result).toEqual({ success: true, path: filePath });
        expect(readFileSync(filePath, 'utf-8')).toBe('deep');
    });
});

describe('editFile', () => {
    it('replaces string', async () => {
        const filePath = join(tmp, 'edit.txt');
        writeFileSync(filePath, 'foo bar baz');

        const result = await editFile.execute!(
            { path: filePath, oldString: 'bar', newString: 'qux' },
            {} as any,
        );

        expect(result).toEqual({ success: true, replacements: 1 });
        expect(readFileSync(filePath, 'utf-8')).toBe('foo qux baz');
    });

    it('throws when string not found', async () => {
        const filePath = join(tmp, 'edit2.txt');
        writeFileSync(filePath, 'foo bar');

        await expect(
            editFile.execute!(
                { path: filePath, oldString: 'missing', newString: 'x' },
                {} as any,
            ),
        ).rejects.toThrow('String not found');
    });

    it('counts all occurrences but only replaces first', async () => {
        const filePath = join(tmp, 'multi.txt');
        writeFileSync(filePath, 'aaa aaa aaa');

        const result = await editFile.execute!(
            { path: filePath, oldString: 'aaa', newString: 'bbb' },
            {} as any,
        );

        expect(result).toEqual({ success: true, replacements: 3 });
        expect(readFileSync(filePath, 'utf-8')).toBe('bbb aaa aaa');
    });
});

describe('globFiles', () => {
    it('finds matching files', async () => {
        writeFileSync(join(tmp, 'a.ts'), '');
        writeFileSync(join(tmp, 'b.ts'), '');
        writeFileSync(join(tmp, 'c.js'), '');

        const result = await globFiles.execute!(
            { pattern: '*.ts', cwd: tmp },
            {} as any,
        );

        expect(result.count).toBe(2);
        expect(result.files.sort()).toEqual(['a.ts', 'b.ts']);
    });

    it('respects cwd', async () => {
        const sub = join(tmp, 'sub');
        mkdirSync(sub);
        writeFileSync(join(sub, 'x.ts'), '');
        writeFileSync(join(tmp, 'y.ts'), '');

        const result = await globFiles.execute!(
            { pattern: '*.ts', cwd: sub },
            {} as any,
        );

        expect(result.count).toBe(1);
        expect(result.files).toEqual(['x.ts']);
    });
});
