import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createTool } from '@mastra/core/tools';
import { execa } from 'execa';
import fg from 'fast-glob';
import { z } from 'zod';

export const readFile = createTool({
    id: 'read-file',
    description:
        'Read the contents of a file, optionally specifying a line range',
    inputSchema: z.object({
        path: z.string().describe('Absolute or relative file path'),
        startLine: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe('Start line number (1-indexed)'),
        endLine: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe('End line number (1-indexed, inclusive)'),
    }),
    outputSchema: z.object({
        content: z.string(),
        totalLines: z.number(),
    }),
    execute: async ({ path, startLine, endLine }) => {
        const content = readFileSync(path, 'utf-8');
        const lines = content.split('\n');

        if (startLine || endLine) {
            const start = (startLine ?? 1) - 1;
            const end = endLine ?? lines.length;
            const sliced = lines.slice(start, end);
            return {
                content: sliced
                    .map((line, i) => `${start + i + 1}\t${line}`)
                    .join('\n'),
                totalLines: lines.length,
            };
        }

        return {
            content: lines.map((line, i) => `${i + 1}\t${line}`).join('\n'),
            totalLines: lines.length,
        };
    },
});

export const writeFile = createTool({
    id: 'write-file',
    description: 'Write content to a file, creating directories if needed',
    inputSchema: z.object({
        path: z.string().describe('File path to write to'),
        content: z.string().describe('Content to write'),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        path: z.string(),
    }),
    execute: async ({ path, content }) => {
        const dir = dirname(path);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        writeFileSync(path, content, 'utf-8');
        return { success: true, path };
    },
});

export const editFile = createTool({
    id: 'edit-file',
    description: 'Find and replace a string in a file',
    inputSchema: z.object({
        path: z.string().describe('File path to edit'),
        oldString: z.string().describe('Exact string to find'),
        newString: z.string().describe('Replacement string'),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        replacements: z.number(),
    }),
    execute: async ({ path, oldString, newString }) => {
        const content = readFileSync(path, 'utf-8');
        if (!content.includes(oldString)) {
            throw new Error(`String not found in ${path}`);
        }
        const updated = content.replace(oldString, newString);
        writeFileSync(path, updated, 'utf-8');
        const replacements = content.split(oldString).length - 1;
        return { success: true, replacements };
    },
});

export const globFiles = createTool({
    id: 'glob-files',
    description: 'Search for files matching a glob pattern',
    inputSchema: z.object({
        pattern: z.string().describe('Glob pattern (e.g., "**/*.ts")'),
        cwd: z.string().optional().describe('Working directory for the search'),
    }),
    outputSchema: z.object({
        files: z.array(z.string()),
        count: z.number(),
    }),
    execute: async ({ pattern, cwd }) => {
        const files = await fg(pattern, {
            cwd: cwd ?? process.cwd(),
            ignore: ['node_modules/**', 'dist/**', '.git/**'],
        });
        return { files, count: files.length };
    },
});

export const grepSearch = createTool({
    id: 'grep-search',
    description: 'Search file contents using a regex pattern',
    inputSchema: z.object({
        pattern: z.string().describe('Regex pattern to search for'),
        path: z.string().optional().describe('Directory or file to search in'),
        glob: z.string().optional().describe('File glob filter (e.g., "*.ts")'),
    }),
    outputSchema: z.object({
        matches: z.array(
            z.object({
                file: z.string(),
                line: z.number(),
                content: z.string(),
            }),
        ),
        totalMatches: z.number(),
    }),
    execute: async ({ pattern, path, glob: fileGlob }) => {
        const args = ['--json', '-n', pattern];
        if (fileGlob) args.push('--glob', fileGlob);
        args.push(path ?? '.');

        const result = await execa('rg', args, { reject: false });
        if (result.exitCode !== 0 && result.exitCode !== 1) {
            throw new Error(`grep failed: ${result.stderr}`);
        }

        const matches: Array<{ file: string; line: number; content: string }> =
            [];
        if (result.stdout) {
            for (const line of result.stdout.split('\n').filter(Boolean)) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.type === 'match') {
                        matches.push({
                            file: parsed.data.path.text,
                            line: parsed.data.line_number,
                            content: parsed.data.lines.text.trim(),
                        });
                    }
                } catch {
                    // skip non-JSON lines
                }
            }
        }
        return { matches, totalMatches: matches.length };
    },
});
